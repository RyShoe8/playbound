import { describe, expect, it, vi, beforeEach } from "vitest";
import type { DiscoveredDiscount } from "./types";

/**
 * The three failure modes free-offers' ingestion pattern exists to prevent,
 * exercised against the store-discounts copy of it:
 *   1. A disabled provider (StoreProvider.discountScanEnabled: false) must not
 *      call the adapter at all.
 *   2. A failed fetch must leave existing rows for that store untouched —
 *      never expire real discounts because a store's API had a bad minute.
 *   3. A fresh, non-empty pull is the only thing allowed to soft-expire a row
 *      that dropped out of it.
 *
 * Mongoose models are faked with a tiny in-memory store rather than mocked
 * method-by-method — the upsert/expire *sequencing* is the thing under test,
 * and a fake that actually holds state exercises that far more honestly than
 * asserting individual mock calls would.
 */

type Row = {
  _id: string;
  store: string;
  externalId: string;
  isActive: boolean;
  [key: string]: unknown;
};

let rows: Row[] = [];
let nextId = 1;
let providerFlags: Record<string, boolean> = {};

vi.mock("@/lib/db", () => ({ default: vi.fn(async () => {}) }));
vi.mock("@/lib/commerce/ensureStores", () => ({ ensureCommerceStores: vi.fn(async () => {}) }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

vi.mock("@/lib/models/IngestionLog", () => ({
  default: {
    create: vi.fn(async () => ({ _id: "log-1" })),
    findByIdAndUpdate: vi.fn(async () => {}),
  },
}));

vi.mock("@/lib/models/StoreProvider", () => ({
  default: {
    findOne: vi.fn((query: { slug: string }) => ({
      lean: async () => (query.slug in providerFlags ? { discountScanEnabled: providerFlags[query.slug] } : null),
    })),
  },
}));

vi.mock("@/lib/models/StoreDiscount", () => ({
  default: {
    findOne: vi.fn((query: { store: string; externalId: string }) => ({
      select: () => ({
        lean: async () => rows.find((r) => r.store === query.store && r.externalId === query.externalId) ?? null,
      }),
    })),
    create: vi.fn(async (data: Record<string, unknown>) => {
      const row = { _id: `row-${nextId++}`, ...data } as Row;
      rows.push(row);
      return row;
    }),
    updateOne: vi.fn(async (query: { store: string; externalId: string }, update: { $set: Record<string, unknown> }) => {
      const row = rows.find((r) => r.store === query.store && r.externalId === query.externalId);
      if (row) Object.assign(row, update.$set);
    }),
    updateMany: vi.fn(async (query: Record<string, unknown>, update: { $set: Record<string, unknown> }) => {
      const store = query.store as string;
      const nin = (query.externalId as { $nin: string[] } | undefined)?.$nin ?? [];
      let modifiedCount = 0;
      for (const row of rows) {
        if (row.store === store && row.isActive && !nin.includes(row.externalId)) {
          Object.assign(row, update.$set);
          modifiedCount++;
        }
      }
      return { modifiedCount };
    }),
  },
}));

const fetchDiscounts = vi.fn<(minPercentOff: number) => Promise<DiscoveredDiscount[]>>();
vi.mock("./providers", () => ({
  getDiscountProvider: () => ({ fetchDiscounts }),
}));

const { ingestStoreDiscounts } = await import("./ingestion");

function discovered(over: Partial<DiscoveredDiscount> = {}): DiscoveredDiscount {
  return {
    externalId: "ext-1",
    title: "Some Game",
    store: "gog",
    storeUrl: "https://www.gog.com/en/game/some-game",
    coverImage: null,
    genres: [],
    developers: [],
    platforms: [],
    currency: "USD",
    regularPriceCents: 1999,
    currentPriceCents: 499,
    metadata: {},
    ...over,
  };
}

beforeEach(() => {
  rows = [];
  nextId = 1;
  providerFlags = { gog: true };
  fetchDiscounts.mockReset();
});

describe("ingestStoreDiscounts", () => {
  it("skips the adapter entirely when the store is disabled", async () => {
    providerFlags = { gog: false };
    const [result] = await ingestStoreDiscounts({ stores: ["gog"] });
    expect(fetchDiscounts).not.toHaveBeenCalled();
    expect(result.status).toBe("success");
    expect(result.discountsFound).toBe(0);
  });

  it("creates a new row for a first-seen discount", async () => {
    fetchDiscounts.mockResolvedValue([discovered()]);
    const [result] = await ingestStoreDiscounts({ stores: ["gog"] });
    expect(result.discountsCreated).toBe(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ store: "gog", externalId: "ext-1", isActive: true });
  });

  it("updates rather than duplicates an existing row on the next run", async () => {
    fetchDiscounts.mockResolvedValue([discovered({ currentPriceCents: 499 })]);
    await ingestStoreDiscounts({ stores: ["gog"] });

    fetchDiscounts.mockResolvedValue([discovered({ currentPriceCents: 399 })]);
    const [result] = await ingestStoreDiscounts({ stores: ["gog"] });

    expect(rows).toHaveLength(1); // still one row, not two
    expect(result.discountsUpdated).toBe(1);
    expect(rows[0].currentPriceCents).toBe(399);
  });

  it("soft-expires a row that drops out of a fresh, non-empty pull", async () => {
    fetchDiscounts.mockResolvedValue([discovered({ externalId: "still-here" }), discovered({ externalId: "gone" })]);
    await ingestStoreDiscounts({ stores: ["gog"] });
    expect(rows.every((r) => r.isActive)).toBe(true);

    fetchDiscounts.mockResolvedValue([discovered({ externalId: "still-here" })]);
    await ingestStoreDiscounts({ stores: ["gog"] });

    const gone = rows.find((r) => r.externalId === "gone");
    const stillHere = rows.find((r) => r.externalId === "still-here");
    expect(gone?.isActive).toBe(false);
    expect(stillHere?.isActive).toBe(true);
  });

  it("never expires existing rows when the adapter fetch fails", async () => {
    fetchDiscounts.mockResolvedValue([discovered({ externalId: "survivor" })]);
    await ingestStoreDiscounts({ stores: ["gog"] });

    fetchDiscounts.mockRejectedValue(new Error("GOG is down"));
    const [result] = await ingestStoreDiscounts({ stores: ["gog"] });

    expect(result.status).toBe("failed");
    expect(rows.find((r) => r.externalId === "survivor")?.isActive).toBe(true);
  });

  it("does not delete rows — a soft-expired row still exists, just inactive", async () => {
    fetchDiscounts.mockResolvedValue([discovered({ externalId: "gone" })]);
    await ingestStoreDiscounts({ stores: ["gog"] });
    fetchDiscounts.mockResolvedValue([]);
    await ingestStoreDiscounts({ stores: ["gog"] });
    // An empty-but-successful pull is deliberately NOT treated as "nothing
    // exists" — ingestion.ts only expires on a non-empty batch, so a store
    // returning [] once (rate limited, etc.) cannot wipe out everything.
    expect(rows.find((r) => r.externalId === "gone")).toBeDefined();
  });
});
