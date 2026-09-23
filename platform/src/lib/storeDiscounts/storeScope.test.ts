import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DISCOUNT_STORE_SLUGS } from "./types";
import { STORE_CAPABILITIES, COMMERCE_STORE_SLUGS } from "@/lib/commerce/stores";
import { getDiscountProvider } from "./providers";

/**
 * Three things that name the same store list and must not drift apart:
 *   - `DISCOUNT_STORE_SLUGS` (types.ts) — the list `ingestion.ts` loops over
 *   - `StoreDiscount`'s Mongoose `store` enum — what Mongo will actually accept
 *   - `STORE_CAPABILITIES[x].discountScan` — what the admin/seed layer thinks
 *     is scanned
 *
 * A provider added to one and not the others fails silently in a specific,
 * confusing way: either Mongo rejects every row from the new store with a
 * validation error, or the provider registry has nothing to look up.
 *
 * Reads the model source rather than importing it, so this file never needs a
 * live Mongo connection — following the pattern in
 * `platform/src/lib/controls/controlsParity.test.ts` and
 * `platform/src/lib/admin/pinnedAnalyticsEvents.test.ts`.
 */

const MODEL_SOURCE = readFileSync(
  path.join(process.cwd(), "src", "lib", "models", "StoreDiscount.ts"),
  "utf8"
);

function modelEnum(): string[] {
  const at = MODEL_SOURCE.indexOf("enum: [");
  expect(at, "StoreDiscount.ts's store enum not found — did the schema shape change?").toBeGreaterThan(-1);
  const body = MODEL_SOURCE.slice(MODEL_SOURCE.indexOf("[", at) + 1, MODEL_SOURCE.indexOf("]", at));
  return [...body.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

describe("store-discount scope stays in sync", () => {
  it("the Mongoose model's store enum matches DISCOUNT_STORE_SLUGS exactly", () => {
    expect([...modelEnum()].sort()).toEqual([...DISCOUNT_STORE_SLUGS].sort());
  });

  it("every DISCOUNT_STORE_SLUGS entry is marked discountScan: true in STORE_CAPABILITIES", () => {
    for (const slug of DISCOUNT_STORE_SLUGS) {
      expect(STORE_CAPABILITIES[slug].discountScan, `${slug} should be discountScan: true`).toBe(true);
    }
  });

  it("no other commerce store claims discountScan: true", () => {
    const scanned = COMMERCE_STORE_SLUGS.filter((s) => STORE_CAPABILITIES[s].discountScan);
    expect([...scanned].sort()).toEqual([...DISCOUNT_STORE_SLUGS].sort());
  });

  it("every scanned store resolves to a real provider adapter", () => {
    for (const slug of DISCOUNT_STORE_SLUGS) {
      const adapter = getDiscountProvider(slug);
      expect(adapter, `no provider registered for ${slug}`).toBeDefined();
      expect(adapter.store).toBe(slug);
    }
  });
});
