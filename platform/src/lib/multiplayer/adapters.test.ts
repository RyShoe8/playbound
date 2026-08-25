import { describe, it, expect } from "vitest";
import {
  getMultiplayerAdapter,
  getMultiplayerTier,
  getVirtualLanConfig,
  isPlayBoundManagedMultiplayer,
  MULTIPLAYER_ADAPTERS,
} from "./adapters";

describe("PlayBound Multiplayer Adapter Framework", () => {
  it("correctly identifies Tier 1 PlayBound Multiplayer Editions", () => {
    /*
     * HoloCure is virtual-lan, not playbound-native: the mod we ship has no
     * room codes and no connect target, only LAN discovery on a chosen
     * adapter. Asserting the absence of a room code keeps the copy and the
     * adapter honest about that.
     */
    const holocure = getMultiplayerAdapter("holocure");
    expect(holocure.adapterType).toBe("virtual-lan");
    expect(holocure.tier).toBe("tier1_improved");
    expect(isPlayBoundManagedMultiplayer("holocure")).toBe(true);
    expect(holocure.client?.requiresRoomCode).toBeFalsy();
    expect(getVirtualLanConfig("holocure")?.requiresBroadcast).toBe(true);
    expect(getVirtualLanConfig("holocure")?.adapterFile).toBe(
      "MultiplayerMod/lastUsedNetworkAdapter"
    );
    // Managed games with a local host port can also ride Connect when the
    // leader chooses self-hosting, even when they need no game-specific file.
    expect(getVirtualLanConfig("openra")).toEqual({});

    const keeper = getMultiplayerAdapter("keeperfx");
    expect(keeper.adapterType).toBe("direct-ip");
    expect(keeper.tier).toBe("tier1_improved");
    expect(keeper.client?.launchArguments).toContain("-connect");

    const openra = getMultiplayerAdapter("openra");
    expect(openra.adapterType).toBe("managed-server");
    expect(openra.tier).toBe("tier1_improved");
    /*
     * Both arguments, not a positional check. OpenRA needs the mod named as
     * well as the address — a client that omits Game.Mod joins with whatever
     * it last had open and the server rejects it as an incompatible mod.
     */
    const openraArgs = openra.client?.launchArguments ?? [];
    expect(openraArgs.some((a) => a.includes("Launch.Connect="))).toBe(true);
    expect(openraArgs.some((a) => a.includes("Game.Mod="))).toBe(true);

    const wesnoth = getMultiplayerAdapter("battle-for-wesnoth");
    expect(wesnoth.adapterType).toBe("direct-ip");
    expect(wesnoth.client?.launchArguments).toContain("--host");

    for (const slug of [
      "heroes-of-might-and-magic-3-complete",
      "ground-control-anthology",
      "ground-control-2-operation-exodus",
      "stronghold-crusader-hd",
      "s-t-a-l-k-e-r-shadow-of-chernobyl",
      "s-t-a-l-k-e-r-call-of-pripyat",
    ]) {
      expect(getMultiplayerAdapter(slug).adapterType).toBe("virtual-lan");
      expect(getVirtualLanConfig(slug)?.requiresBroadcast).toBe(true);
    }
  });

  it("correctly identifies Tier 2 automated server titles", () => {
    const ss14 = getMultiplayerAdapter("space-station-14");
    expect(ss14.tier).toBe("tier2_automated_server");
    expect(isPlayBoundManagedMultiplayer("space-station-14")).toBe(true);

    const cs2 = getMultiplayerAdapter("counter-strike-2");
    expect(cs2.tier).toBe("tier2_automated_server");
    expect(cs2.adapterType).toBe("managed-server");
    expect(isPlayBoundManagedMultiplayer("counter-strike-2")).toBe(true);
  });

  it("correctly treats Tier 3 official proprietary games as untouched networking", () => {
    const lol = getMultiplayerAdapter("league-of-legends");
    expect(lol.tier).toBe("tier3_official");
    expect(lol.adapterType).toBe("official");
    expect(isPlayBoundManagedMultiplayer("league-of-legends")).toBe(false);

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
