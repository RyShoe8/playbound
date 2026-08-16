import { describe, it, expect } from "vitest";
import {
  getMultiplayerAdapter,
  getMultiplayerTier,
  isPlayBoundManagedMultiplayer,
  MULTIPLAYER_ADAPTERS,
} from "./adapters";

describe("PlayBound Multiplayer Adapter Framework", () => {
  it("correctly identifies Tier 1 PlayBound Multiplayer Editions", () => {
    const holocure = getMultiplayerAdapter("holocure");
    expect(holocure.adapterType).toBe("playbound-native");
    expect(holocure.protocol).toBe("gns");
    expect(holocure.tier).toBe("tier1_improved");
    expect(isPlayBoundManagedMultiplayer("holocure")).toBe(true);

    const keeper = getMultiplayerAdapter("keeperfx");
    expect(keeper.adapterType).toBe("direct-ip");
    expect(keeper.tier).toBe("tier1_improved");
    expect(keeper.client?.launchArguments).toContain("-connect");

    const openra = getMultiplayerAdapter("openra");
    expect(openra.adapterType).toBe("managed-server");
    expect(openra.tier).toBe("tier1_improved");
    expect(openra.client?.launchArguments?.[0]).toContain("Launch.Connect=");

    const wesnoth = getMultiplayerAdapter("battle-for-wesnoth");
    expect(wesnoth.adapterType).toBe("managed-server");
    expect(wesnoth.client?.launchArguments).toContain("--host");
  });

  it("correctly identifies Tier 2 automated server titles", () => {
    const ss14 = getMultiplayerAdapter("space-station-14");
    expect(ss14.tier).toBe("tier2_automated_server");
    expect(isPlayBoundManagedMultiplayer("space-station-14")).toBe(true);
  });

  it("correctly treats Tier 3 official proprietary games as untouched networking", () => {
    const cs2 = getMultiplayerAdapter("counter-strike-2");
    expect(cs2.tier).toBe("tier3_official");
    expect(cs2.adapterType).toBe("official");
    expect(isPlayBoundManagedMultiplayer("counter-strike-2")).toBe(false);

    const valorant = getMultiplayerAdapter("valorant");
    expect(valorant.tier).toBe("tier3_official");
    expect(isPlayBoundManagedMultiplayer("valorant")).toBe(false);

    const brawlhalla = getMultiplayerAdapter("brawlhalla");
    expect(brawlhalla.tier).toBe("tier3_official");
    expect(isPlayBoundManagedMultiplayer("brawlhalla")).toBe(false);

    const unknownGame = getMultiplayerAdapter("some-random-game");
    expect(unknownGame.tier).toBe("tier3_official");
    expect(unknownGame.adapterType).toBe("official");
    expect(isPlayBoundManagedMultiplayer("some-random-game")).toBe(false);
  });
});
