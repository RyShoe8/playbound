import { describe, it, expect } from "vitest";
import { games } from "@/lib/data/games";
import { editions } from "@/lib/data/editions";
import { launcherInstallBySlug } from "@/lib/data/launcherInstall";
import {
  editionSupportsMultiplayer,
  gameSupportsParty,
} from "./support";

describe("Library party button support for games and editions", () => {
  it("enables Start Party for multiplayer games with external install recipes", () => {
    const externalSlugs = [
      "starcraft",
      "diablo-2",
      "dota-2",
      "valorant",
      "apex-legends",
      "earth-2140-trilogy",
      "populous-the-beginning",
      "super-sidekicks",
      "flatout-2",
      "pixreveal",
      "gamebuddies-io",
    ];

    for (const slug of externalSlugs) {
      const g = games.find((x) => x.slug === slug);
      expect(g, `Game ${slug} should exist in catalog`).toBeDefined();
      const fullGame = {
        ...g!,
        launcherInstall: g!.launcherInstall || launcherInstallBySlug[slug],
      };
      expect(
        gameSupportsParty(fullGame),
        `Multiplayer game ${slug} should support starting a party from library`
      ).toBe(true);
    }
  });

  it("enables Start Party for games that have multiplayer editions even if base game has no MP tags", () => {
    // HoloCure has "HoloCure: Multiplayer (Experimental)" edition
    const holocure = games.find((g) => g.slug === "holocure");
    expect(holocure).toBeDefined();
    const holocureEds = editions.filter((e) => e.gameSlug === "holocure");
    expect(gameSupportsParty(holocure, holocureEds)).toBe(true);

    // Tomb Raider 1+2+3 has OpenLara Desktop edition with Local Co-Op & Split-Screen
    const tr = games.find((g) => g.slug === "tomb-raider-123");
    expect(tr).toBeDefined();
    const trEds = editions.filter((e) => e.gameSlug === "tomb-raider-123");
    expect(gameSupportsParty(tr, trEds)).toBe(true);
  });

  it("rejects strictly singleplayer games without multiplayer editions", () => {
    const spSlugs = [
      "castlevania-revamped",
      "shattered-pixel-dungeon",
      "the-ur-quan-masters",
      "trigger-rally",
      "wipeout-rewrite",
      "tes-arena",
    ];

    for (const slug of spSlugs) {
      const g = games.find((x) => x.slug === slug);
      expect(g, `Game ${slug} should exist`).toBeDefined();
      const eds = editions.filter((e) => e.gameSlug === slug);
      expect(
        gameSupportsParty(g, eds),
        `Singleplayer game ${slug} must not show start party button`
      ).toBe(false);
    }
  });

  it("distinguishes multiplayer editions from strictly singleplayer editions", () => {
    // Freedoom: Zandronum is MP, Ashes 2063 and DSDA-Doom are SP
    const zandronum = editions.find((e) => e.gameSlug === "freedoom" && e.slug === "zandronum");
    const ashes = editions.find((e) => e.gameSlug === "freedoom" && e.slug === "ashes-2063");
    const dsda = editions.find((e) => e.gameSlug === "freedoom" && e.slug === "dsda-doom");
    const freedoom = games.find((g) => g.slug === "freedoom");

    expect(editionSupportsMultiplayer(zandronum, freedoom)).toBe(true);
    expect(editionSupportsMultiplayer(ashes, freedoom)).toBe(false);
    expect(editionSupportsMultiplayer(dsda, freedoom)).toBe(false);

    // Dungeon Keeper Gold: KeeperFX is MP, Classic DOS is SP
    const keeperfx = editions.find((e) => e.gameSlug === "dungeon-keeper-gold" && e.slug === "keeperfx");
    const classicDos = editions.find((e) => e.gameSlug === "dungeon-keeper-gold" && e.slug === "classic-dos");
    const dkg = games.find((g) => g.slug === "dungeon-keeper-gold");

    expect(editionSupportsMultiplayer(keeperfx, dkg)).toBe(true);
    expect(editionSupportsMultiplayer(classicDos, dkg)).toBe(false);

    // StarCraft: ShieldBattery has rollback netcode & ranked ladder
    const shieldbattery = editions.find((e) => e.gameSlug === "starcraft" && e.slug === "shieldbattery");
    const starcraft = games.find((g) => g.slug === "starcraft");
    expect(editionSupportsMultiplayer(shieldbattery, starcraft)).toBe(true);

    // Team Fortress 2 editions
    const tf2Official = editions.find((e) => e.gameSlug === "team-fortress-2" && e.slug === "official");
    const tf2Classic = editions.find((e) => e.gameSlug === "team-fortress-2" && e.slug === "tf2-classic");
    const tf2 = games.find((g) => g.slug === "team-fortress-2");
    expect(editionSupportsMultiplayer(tf2Official, tf2)).toBe(true);
    expect(editionSupportsMultiplayer(tf2Classic, tf2)).toBe(true);
  });
});
