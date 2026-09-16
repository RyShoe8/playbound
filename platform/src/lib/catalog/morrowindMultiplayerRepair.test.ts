import { describe, it, expect } from "vitest";
import { repairMorrowindMultiplayerFromSeed } from "./morrowindMultiplayerRepair";
import { supportsMultiplayer, supportsLauncherParty } from "@/lib/multiplayer/support";

const SEED = {
  features: ["Singleplayer", "Multiplayer", "Dedicated Servers", "Mod Support"],
  tags: ["Open World", "Fantasy", "Singleplayer", "Multiplayer"],
  launchMethods: ["install", "server"],
  platforms: ["Windows", "Linux", "macOS"],
  steamDeck: true,
};

describe("repairMorrowindMultiplayerFromSeed", () => {
  it("restores multiplayer markers wiped from the live catalog row", () => {
    const broken = {
      slug: "morrowind",
      features: ["Singleplayer", "Mod Support", "Community Content", "Story Campaign"],
      tags: ["Classic", "Mods", "Open World", "Fantasy"],
      launchMethods: ["install"],
      platforms: ["Windows"],
      steamDeck: false,
      launcherInstall: { enabled: true, kind: "github-installer" as const },
    };
    expect(supportsMultiplayer(broken)).toBe(false);

    const fixed = repairMorrowindMultiplayerFromSeed(broken, SEED);
    expect(supportsMultiplayer(fixed)).toBe(true);
    expect(supportsLauncherParty(fixed)).toBe(true);
    expect(fixed.launchMethods).toContain("server");
    expect(fixed.features).toEqual(
      expect.arrayContaining(["Multiplayer", "Dedicated Servers"])
    );
    expect(fixed.platforms).toEqual(expect.arrayContaining(["Windows", "Linux", "macOS"]));
    expect(fixed.steamDeck).toBe(true);
  });

  it("leaves non-morrowind games alone", () => {
    const game = {
      slug: "openra",
      features: ["Singleplayer"],
      tags: [],
      launchMethods: ["install"],
    };
    expect(repairMorrowindMultiplayerFromSeed(game, SEED)).toBe(game);
  });
});
