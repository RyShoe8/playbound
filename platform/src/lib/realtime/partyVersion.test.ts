import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, unknown>();
vi.mock("@/lib/realtime/sharedCache", () => ({
  sharedCacheSet: vi.fn(async (k: string, v: unknown) => void store.set(k, v)),
  sharedCacheGet: vi.fn(async (k: string) => store.get(k) ?? null),
}));

import { bumpPartyVersion, readPartyVersion } from "./partyVersion";

const ID = "6ab60bfa716498aa267ee550";

describe("party version stamp", () => {
  beforeEach(() => store.clear());

  it("reads null until a write stamps it, then a number that moves", async () => {
    expect(await readPartyVersion(ID)).toBeNull();
    bumpPartyVersion(ID);
    const first = await readPartyVersion(ID);
    expect(typeof first).toBe("number");
    await new Promise((r) => setTimeout(r, 2));
    bumpPartyVersion({ toString: () => ID });
    expect(await readPartyVersion(ID)).toBeGreaterThan(first!);
  });

  it("ignores ids that are not ObjectIds", async () => {
    bumpPartyVersion("../../etc");
    bumpPartyVersion(undefined);
    expect(store.size).toBe(0);
    expect(await readPartyVersion("nope")).toBeNull();
  });
});
