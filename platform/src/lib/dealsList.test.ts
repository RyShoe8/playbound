import { describe, expect, it, vi } from "vitest";
import type { Game } from "@/lib/data/types";

/**
 * The bar has to be applied, not just defined.
 *
 * deals.test.ts pins `isDiscounted` and `percentOff` in isolation, which proves
 * the arithmetic but not that `listDiscountedGames` actually filters on it — a
 * dropped `>= floor` would sail straight through those tests while putting a 5%
 * price change on the front of /deals.
 *
 * In its own file because vi.mock is hoisted per module: mocking the catalog
 * here keeps deals.test.ts able to import the real module.
 */

const game = (slug: string, regular: number | null, current: number | null): Game =>
  ({
    slug,
    title: slug,
    tagline: `${slug} tagline`,
    genres: [],
    art: { from: "#000", to: "#111", icon: "Gamepad2" },
    access: {
      priceType: "PAID",
      regularPriceCents: regular,
      currentPriceCents: current,
      qualifyingPriceCents: regular,
      currency: "USD",
      purchaseRequired: true,
      offers: [
        {
          retailer: "GOG",
          url: `https://gog.com/${slug}`,
          priceCents: current ?? 0,
          affiliate: false,
          lastCheckedAt: null,
          isActive: true,
          matchSource: "manual",
        },
      ],
    },
  }) as unknown as Game;

const CATALOG: Game[] = [
  game("eighty-five-off", 999, 149), // 85% — in
  game("exactly-seventy-five", 599, 149), // 75% — in, boundary
  game("seventy-four", 599, 150), // 74% — out, one cent short
  game("half-off", 1000, 500), // 50% — out
  game("full-price", 999, 999), // no discount — out
  game("stale-regular", 599, 999), // bad data — out
  game("unknown-price", 999, null), // unknown — out
];

vi.mock("@/lib/catalog", () => ({
  listGames: vi.fn(async () => CATALOG),
}));

const { listDiscountedGames, DEEP_DISCOUNT_MIN_PERCENT } = await import("@/lib/deals");

describe("listDiscountedGames", () => {
  it("lists only games at or past the deep-discount bar", async () => {
    const slugs = (await listDiscountedGames()).map((g) => g.slug);
    expect(slugs).toEqual(["eighty-five-off", "exactly-seventy-five"]);
  });

  it("includes the boundary and excludes one cent short of it", async () => {
    const slugs = (await listDiscountedGames()).map((g) => g.slug);
    // 75% is "at least 75% off", so the boundary is inclusive.
    expect(slugs).toContain("exactly-seventy-five");
    expect(slugs).not.toContain("seventy-four");
  });

  it("sorts deepest discount first", async () => {
    const found = await listDiscountedGames();
    expect(found.map((g) => g.percentOff)).toEqual([85, 75]);
  });

  it("never admits bad data even when the bar is lowered to zero", async () => {
    // Correctness and curation are separate filters; dropping the second must
    // not weaken the first.
    const slugs = (await listDiscountedGames({ minPercentOff: 0 })).map((g) => g.slug);
    expect(slugs).toContain("half-off");
    expect(slugs).not.toContain("stale-regular");
    expect(slugs).not.toContain("unknown-price");
    expect(slugs).not.toContain("full-price");
  });

  it("carries through the price fields and the cheapest store link", async () => {
    const [top] = await listDiscountedGames();
    expect(top).toMatchObject({
      slug: "eighty-five-off",
      regularPriceCents: 999,
      currentPriceCents: 149,
      percentOff: 85,
      currency: "USD",
      storeName: "GOG",
      storeUrl: "https://gog.com/eighty-five-off",
    });
  });

  it("uses the shared constant as its default floor", async () => {
    const atBar = await listDiscountedGames();
    for (const g of atBar) expect(g.percentOff).toBeGreaterThanOrEqual(DEEP_DISCOUNT_MIN_PERCENT);
  });
});
