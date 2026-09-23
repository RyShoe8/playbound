import { describe, expect, it, vi } from "vitest";
import type { DiscountedGame } from "@/lib/dealsShared";

/**
 * `listDiscountedGames()` in lib/deals.ts is now a thin passthrough to
 * `storeDiscounts/service.ts`'s `listActiveDiscounts()` — the filtering,
 * threshold and affiliate logic all moved there (see
 * `storeDiscounts/service.test.ts` and `storeDiscounts/providers/*.test.ts`
 * for that coverage). This file only pins that the passthrough is real: that
 * `deals.ts` calls the store-wide service and does not, say, silently fall
 * back to reading the catalog again the way it used to.
 *
 * In its own file (not deals.test.ts) because `vi.mock` is hoisted per module.
 */

const RECORDS: DiscountedGame[] = [
  {
    slug: null,
    title: "Eighty-Five Off",
    tagline: null,
    coverImage: null,
    art: null,
    genres: [],
    regularPriceCents: 999,
    currentPriceCents: 149,
    currency: "USD",
    percentOff: 85,
    storeName: "GOG",
    storeUrl: "https://www.gog.com/en/game/eighty-five-off",
    storeKey: "gog",
  },
];

vi.mock("@/lib/storeDiscounts/service", () => ({
  listActiveDiscounts: vi.fn(async () => RECORDS),
}));

const { listDiscountedGames } = await import("@/lib/deals");
const { listActiveDiscounts } = await import("@/lib/storeDiscounts/service");

describe("listDiscountedGames", () => {
  it("returns exactly what the store-discounts service returns", async () => {
    expect(await listDiscountedGames()).toBe(RECORDS);
  });

  it("takes no arguments — there is no catalog-testing flag to thread through", async () => {
    // A store discount was never a draft/testing catalog row; the old
    // { includeTesting } option has nothing left to mean.
    await listDiscountedGames();
    expect(listActiveDiscounts).toHaveBeenCalledWith();
  });
});
