import { describe, expect, it } from "vitest";
import { PENDING_DEDICATED_GAMES, isPendingDedicatedGame, isPendingDedicatedProfile } from "./pendingGames";
import { publicGames } from "./publicTier";
import type { HostingTier } from "./tier";

describe("planned Dedicated games", () => {
  it("shows all five blocked games with a requirement and excludes Witchbrook", () => {
    expect(PENDING_DEDICATED_GAMES.map((game) => game.gameSlug)).toEqual([
      "aneurism-iv", "risk-of-rain-2", "starbound", "stardew-valley", "vintage-story",
    ]);
    expect(PENDING_DEDICATED_GAMES.every((game) => game.requirement.length > 30)).toBe(true);
    expect(isPendingDedicatedGame("witchbrook")).toBe(false);
  });

  it("blocks base and edition profiles for pending games", () => {
    for (const game of PENDING_DEDICATED_GAMES) {
      expect(isPendingDedicatedProfile(`${game.gameSlug}:base`)).toBe(true);
      expect(isPendingDedicatedProfile(`${game.gameSlug}:modded`)).toBe(true);
    }
    expect(isPendingDedicatedProfile("factorio:base")).toBe(false);
  });

  it("keeps planned games off clickable hosting pages even if a tier row was enabled", () => {
    const tier = {
      maxSlotsSold: 32,
      games: ["starbound", "factorio"].map((slug) => ({
        profileKey: `${slug}:base`, enabled: true, newServerCreationEnabled: true, maxSlots: 8,
      })),
    } as HostingTier;
    expect(publicGames(tier).map((game) => game.gameSlug)).toEqual(["factorio"]);
  });
});
