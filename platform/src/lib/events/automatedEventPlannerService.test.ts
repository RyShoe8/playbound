import { describe, it, expect } from "vitest";
import { pickDiverseAutomatedGame } from "./automatedEventPlannerService";
import type { AutomatedEventGameConfig } from "@/lib/models/AutomatedEventConfig";

describe("pickDiverseAutomatedGame", () => {
  const candidates: AutomatedEventGameConfig[] = [
    { slug: "openra", enabled: true, durationHours: 2, weight: 1 },
    { slug: "warzone-2100", enabled: true, durationHours: 2, weight: 1 },
    { slug: "wolfenstein-enemy-territory", enabled: true, durationHours: 2, weight: 1 },
    { slug: "xonotic", enabled: true, durationHours: 1.5, weight: 1 },
    { slug: "supertuxkart", enabled: true, durationHours: 1.5, weight: 1 },
  ];

  const genresBySlug = new Map<string, string[]>([
    ["openra", ["strategy", "rts"]],
    ["warzone-2100", ["strategy", "rts"]],
    ["wolfenstein-enemy-territory", ["shooter", "fps"]],
    ["xonotic", ["shooter", "fps"]],
    ["supertuxkart", ["racing", "arcade"]],
  ]);

  it("handles empty candidate pool gracefully", () => {
    const result = pickDiverseAutomatedGame([], [], genresBySlug);
    expect(result).toBeNull();
  });

  it("returns the single candidate if only one is enabled", () => {
    const result = pickDiverseAutomatedGame([candidates[0]], ["openra"], genresBySlug);
    expect(result?.slug).toBe("openra");
  });

  it("penalizes immediate previous game from repeating back-to-back", () => {
    // If openra was the last game played, over 100 iterations it should rarely be picked compared to others
    const counts: Record<string, number> = {};
    for (let i = 0; i < 200; i++) {
      const picked = pickDiverseAutomatedGame(candidates, ["openra"], genresBySlug);
      if (picked) {
        counts[picked.slug] = (counts[picked.slug] || 0) + 1;
      }
    }
    // openra was just played, so its pick count should be significantly lower than non-RTS games
    expect(counts["openra"] || 0).toBeLessThan(20);
    expect((counts["supertuxkart"] || 0) + (counts["wolfenstein-enemy-territory"] || 0)).toBeGreaterThan(100);
  });

  it("diversifies away from consecutive same-genre games", () => {
    // If two RTS games were played in a row (warzone-2100, then openra)
    const recentGames = ["openra", "warzone-2100"];
    const counts: Record<string, number> = {};
    for (let i = 0; i < 300; i++) {
      const picked = pickDiverseAutomatedGame(candidates, recentGames, genresBySlug);
      if (picked) {
        counts[picked.slug] = (counts[picked.slug] || 0) + 1;
      }
    }

    const rtsCount = (counts["openra"] || 0) + (counts["warzone-2100"] || 0);
    const nonRtsCount =
      (counts["wolfenstein-enemy-territory"] || 0) +
      (counts["xonotic"] || 0) +
      (counts["supertuxkart"] || 0);

    // Non-RTS games should dominate the selection
    expect(nonRtsCount).toBeGreaterThan(rtsCount * 2);
  });
});
