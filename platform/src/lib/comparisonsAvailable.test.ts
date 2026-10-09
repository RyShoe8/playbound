import { describe, expect, it, vi } from "vitest";

const listGames = vi.fn();
vi.mock("@/lib/catalog", () => ({ listGames: (...a: unknown[]) => listGames(...a) }));

import { availableComparisons, availableComparisonsFeaturing } from "@/lib/comparisonsAvailable";
import { comparisons } from "@/lib/data/comparisons";

const game = (slug: string) => ({ slug });

describe("availableComparisons", () => {
  it("drops any comparison that features a game that is not public", async () => {
    const [first] = comparisons;
    listGames.mockResolvedValueOnce([game(first.aSlug), game(first.bSlug)]);
    const out = await availableComparisons();
    expect(out.map((c) => c.slug)).toContain(first.slug);
    for (const c of out) {
      expect([first.aSlug, first.bSlug]).toContain(c.aSlug);
    }
    expect(out.length).toBeLessThan(comparisons.length);
  });

  it("keeps a comparison against an external commercial game", async () => {
    const ext = comparisons.find((c) => c.bExternal);
    if (!ext) return;
    listGames.mockResolvedValueOnce([game(ext.aSlug)]);
    expect((await availableComparisons()).map((c) => c.slug)).toContain(ext.slug);
  });

  it("fails open when the catalog cannot be read or is empty", async () => {
    listGames.mockRejectedValueOnce(new Error("db down"));
    expect(await availableComparisons()).toHaveLength(comparisons.length);
    listGames.mockResolvedValueOnce([]);
    expect(await availableComparisons()).toHaveLength(comparisons.length);
  });

  it("only returns comparisons featuring the requested game", async () => {
    const [first] = comparisons;
    listGames.mockResolvedValueOnce([game(first.aSlug), game(first.bSlug)]);
    const out = await availableComparisonsFeaturing(first.aSlug);
    expect(out.length).toBeGreaterThan(0);
    for (const c of out) expect([c.aSlug, c.bSlug]).toContain(first.aSlug);
  });
});
