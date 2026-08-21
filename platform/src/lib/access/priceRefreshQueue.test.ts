import { describe, it, expect } from "vitest";
import { orderByStalest, stalestCheckedAt } from "./priceRefreshQueue";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const STALE_MS = 12 * HOUR;

type Game = { slug: string; offers: { lastCheckedAt: string | null }[] };

describe("stalestCheckedAt", () => {
  it("reports the oldest offer, not the newest", () => {
    const fresh = new Date(1_000_000).toISOString();
    const old = new Date(10).toISOString();
    expect(stalestCheckedAt([{ lastCheckedAt: fresh }, { lastCheckedAt: old }])).toBe(10);
  });

  it("puts never-checked offers at the very front", () => {
    // An offer with no price yet is more urgent than one priced yesterday.
    expect(stalestCheckedAt([{ lastCheckedAt: null }])).toBe(0);
    expect(stalestCheckedAt([])).toBe(0);
    expect(stalestCheckedAt([{ lastCheckedAt: "not a date" }])).toBe(0);
  });
});

/**
 * The property the ordering exists for: a run that can only afford N lookups
 * must eventually price the whole catalog, not the same N every night.
 *
 * Simulates the real loop closely enough to be meaningful — a daily cron, a
 * 12h stale window, a hard per-run budget — and asserts on coverage over time
 * rather than on the sort call itself.
 */
function simulate(opts: { games: number; budget: number; runs: number; ordered: boolean }) {
  const catalog: Game[] = Array.from({ length: opts.games }, (_, i) => ({
    slug: `game-${i}`,
    offers: [{ lastCheckedAt: null }],
  }));

  let clock = DAY;
  const everPriced = new Set<string>();

  for (let run = 0; run < opts.runs; run += 1) {
    // The fix under test: least-recently-priced first, or natural order.
    const queue = opts.ordered
      ? orderByStalest(catalog, (g) => g.offers)
      : catalog;

    let spent = 0;
    for (const game of queue) {
      for (const offer of game.offers) {
        const checked = offer.lastCheckedAt ? new Date(offer.lastCheckedAt).getTime() : 0;
        if (clock - checked < STALE_MS) continue; // still fresh
        if (spent >= opts.budget) continue; // out of budget this run
        spent += 1;
        offer.lastCheckedAt = new Date(clock).toISOString();
        everPriced.add(game.slug);
      }
    }
    clock += DAY; // the cron runs once a day
  }

  return everPriced;
}

describe("a capped run over a catalog larger than its budget", () => {
  it("starves everything past the budget in natural order", () => {
    // The behaviour this replaced. Kept as a test so the regression is visible
    // rather than described: the tail is never priced, however long it runs.
    const priced = simulate({ games: 40, budget: 25, runs: 30, ordered: false });
    expect(priced.size).toBe(25);
    expect(priced.has("game-39")).toBe(false);
  });

  it("covers the whole catalog when ordered by staleness", () => {
    const priced = simulate({ games: 40, budget: 25, runs: 30, ordered: true });
    expect(priced.size).toBe(40);
    expect(priced.has("game-39")).toBe(true);
  });

  it("covers a catalog several times its budget within a few runs", () => {
    // 100 games, 25 a night: everything should have a price inside four runs.
    const priced = simulate({ games: 100, budget: 25, runs: 4, ordered: true });
    expect(priced.size).toBe(100);
  });

  it("keeps rotating rather than settling on one set", () => {
    /*
     * Two runs deep into a catalog it cannot cover in one pass, the second run
     * must price a different set than the first — otherwise the ordering is
     * doing nothing and the cap is still a starvation cap.
     */
    const first = simulate({ games: 40, budget: 25, runs: 1, ordered: true });
    const two = simulate({ games: 40, budget: 25, runs: 2, ordered: true });
    expect(first.size).toBe(25);
    expect(two.size).toBe(40);
  });
});
