import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  NEW_EDITION_KEYS,
  NEW_GAME_SLUGS,
  NEW_MOD_SLUGS,
  PATCH_EDITION_FIELDS,
  PATCH_GAME_FIELDS,
  PATCH_MOD_FIELDS,
  RETIRE_EDITION_KEYS,
} from "../../scripts/insert-catalog-wave.allowlist";
import { editions } from "@/lib/data/editions";
import { gamesBySlug } from "@/lib/data/games";
import { correctionsFor } from "@/lib/data/catalogCorrections";
import { developersBySlug } from "@/lib/data/developers";
import { modAuthorsBySlug } from "@/lib/data/modAuthors";
import { attributionFor, MOD_ATTRIBUTIONS } from "@/lib/data/modAttributions";
import { editorial } from "@/lib/data/editorial";
import { FREETRAIN_SLUG, freetrainLauncherInstall } from "@/lib/data/freetrainCatalog";
import {
  IDLE_SLAYER_SLUG,
  idleSlayerAndroidStoreUrl,
  idleSlayerIosStoreUrl,
  idleSlayerPatchSource,
} from "@/lib/data/idleSlayerCatalog";
import {
  SEVEN_KINGDOMS_SLUG,
  sevenKingdomsLauncherInstall,
} from "@/lib/data/sevenKingdomsCatalog";
import {
  HOLOCURE_RICH_PRESENCE_SLUG,
  holocureRichPresencePatchSource,
} from "@/lib/data/holocureRichPresenceCatalog";
import {
  SKY_CHILDREN_SLUG,
  skyChildrenAndroidStoreUrl,
  skyChildrenIosStoreUrl,
  skyChildrenPatchSource,
} from "@/lib/data/skyChildrenCatalog";
import {
  SLAPSHOT_REBOUND_SLUG,
  slapshotReboundPatchSource,
} from "@/lib/data/slapshotReboundCatalog";
import { TEEWORLDS_SLUG, teeworldsPatchSource } from "@/lib/data/teeworldsCatalog";
import {
  THE_DARK_MOD_SLUG,
  theDarkModPatchSource,
} from "@/lib/data/theDarkModCatalog";
import {
  UNKNOWN_HORIZONS_SLUG,
  unknownHorizonsPatchSource,
} from "@/lib/data/unknownHorizonsCatalog";
import {
  SPIKE_CROSS_SLUG,
  spikeCrossPatchSource,
} from "@/lib/data/spikeCrossCatalog";
import {
  ALIEN_SWARM_SLUG,
  alienSwarmPatchSource,
} from "@/lib/data/alienSwarmCatalog";
import {
  SUPER_NOVA_STRIKE_SLUG,
  superNovaStrikeAndroidStoreUrl,
  superNovaStrikeIosStoreUrl,
  superNovaStrikePatchSource,
} from "@/lib/data/superNovaStrikeCatalog";
import { ASSAULTCUBE_SLUG } from "@/lib/data/assaultCubeSpecs";
import { mods } from "@/lib/data/mods";
import { getMultiplayerAdapter } from "@/lib/multiplayer/adapters";

/**
 * Deploy insert:catalog-wave must stay scoped. The August 2026 bug was an
 * allowlist that existed in the file but never gated the loops — so a deploy
 * could create every missing seed edition/mod. These checks pin the contract.
 */
describe("insert-catalog-wave allowlists", () => {
  it("only names the batch games we intend to create", () => {
    expect([...NEW_GAME_SLUGS].sort()).toEqual(
      [
        "baseball-stars-2",
        "castlevania-revamped",
        "earth-2140-trilogy",
        "final-fantasy-xi",
        "flatout-2",
        "hypersomnia",
        "hawken-hawkening",
        "lovers-in-a-dangerous-spacetime",
        "outrun",
        "pokemon-blaze-online",
        "pokemmo",
        "populous-the-beginning",
        "quake-ii",
        "relic-hunters-zero-remix",
        "s-t-a-l-k-e-r-clear-sky",
        "soccer-brawl",
        "srb2kart",
        "stalker-anomaly",
        "super-sidekicks",
        "the-spike-cross",
        "tmnt-rescue-palooza",
        "trackmania",
        "x-men-arcade-remake",
      ].sort()
    );
  });

  it("only names the batch editions we intend to create", () => {
    expect([...NEW_EDITION_KEYS].sort()).toEqual(
      [
        "castlevania-revamped/official",
        "earth-2140-trilogy/official",
        "earth-2140-trilogy/opene2140",
        "final-fantasy-xi/horizon",
        "hawken-hawkening/official",
        "pokemon-blaze-online/official",
        "pokemon-blaze-online/windows-32",
        "pokemmo/official",
        "populous-the-beginning/official",
        "populous-the-beginning/populous-reincarnated",
        "s-t-a-l-k-e-r-clear-sky/official",
        "s-t-a-l-k-e-r-shadow-of-chernobyl/lost-alpha",
        "s-t-a-l-k-e-r-shadow-of-chernobyl/official",
        "s-t-a-l-k-e-r-shadow-of-chernobyl/true-stalker",
        "stalker-anomaly/gamma",
        "stalker-anomaly/official",
      ].sort()
    );
  });

  it("creates no mods in this wave", () => {
    expect(NEW_MOD_SLUGS).toEqual([]);
  });

  it("retires redundant default editions and misplaced CoP editions", () => {
    expect([...RETIRE_EDITION_KEYS].sort()).toEqual(
      [
        "baseball-stars-2/official",
        "soccer-brawl/official",
        "super-sidekicks/official",
      ].sort()
    );
  });

  it("patches the allowlisted games only", () => {
    expect(Object.keys(PATCH_GAME_FIELDS).sort()).toEqual(
      [
        "alien-swarm",
        "castlevania-revamped",
        "dune-legacy",
        "freetrain",
        "hawken-hawkening",
        "hurry-curry",
        "idle-slayer",
        "morrowind",
        "pokemmo",
        "pokemon-blaze-online",
        "relic-hunters-zero-remix",
        "s-t-a-l-k-e-r-clear-sky",
        "s-t-a-l-k-e-r-shadow-of-chernobyl",
        "seven-kingdoms-ancient-adversaries",
        "sky-children-of-the-light",
        "slapshot-rebound",
        "space-station-14",
        "stalker-anomaly",
        "super-nova-strike",
        "teeworlds",
        "the-dark-mod",
        "the-spike-cross",
        "unknown-horizons",
        "x-men-arcade-remake",
        "tmnt-rescue-palooza",
        // releaseYear audit, 2026-09-22 — see catalogCorrections.ts.
        "thief-gold",
        "mrboom",
        "rollercoaster-tycoon",
        "thief-2-the-metal-age",
        "stronghold-crusader-hd",
        "triplea",
        "star-wars-knights-of-the-old-republic",
        "star-wars-knights-of-the-old-republic-ii-the-sith-lords",
        "red-eclipse",
        "openclonk",
        "renegade-x",
        "c-dogs-sdl",
        "next-gen-chess",
        // PlayBound Controls wave-1, 2026-09-23 — see the allowlist's own comment.
        "openttd",
        "shattered-pixel-dungeon",
        "lincity-ng",
        "heroes-of-might-and-magic-3-complete",
        "dungeon-keeper-gold",
        "outrun",
        // PlayBound Controls wave-2, 2026-09-23 — see the allowlist's own comment.
        "old-school-runescape",
        "wolfenstein-enemy-territory",
        "openciv3",
        "tes-arena",
        "star-wars-galaxies",
        "freeciv",
        "warzone-2100",
        "0ad",
        "battle-for-wesnoth",
        "openra",
        "bzflag",
        // Testing-catalog cleanup pass, 2026-09-25 — see the allowlist's own comment.
        "quake-ii",
        "hypersomnia",
        "final-fantasy-xi",
        "theme-hospital",
        // Published-catalog cleanup pass, 2026-09-25 — see the allowlist's own comment.
        "gamebuddies-io",
        "marathon-2",
        "pixreveal",
        "deadeus",
        "assaultcube",
        "opentyrian-2000",
        "widelands",
        "the-legend-of-zelda-book-of-mudora",
        "the-legend-of-zelda-xd2-mercuris-chess",
        "yarntown",
        "panzer-marshal",
        "stalker-lost-alpha",
        // Published-catalog installSteps fix, 2026-09-25 — same defect,
        // no seed field for other reasons — see the allowlist's own comment.
        "freedoom",
        "supertux",
        "luanti",
        "endless-sky",
        "supertuxkart",
        "unvanquished",
        "mindustry",
        "xonotic",
        "holocure",
        "beyond-all-reason",
        "veloren",
        "zero-k",
        "naev",
        "hedgewars",
        "flightgear",
        "daggerfall",
        "starcraft",
        "team-fortress-2",
        "alephone",
        "valorant",
        "counter-strike-2",
        "asherons-call",
        "asphalt-legends",
        "brawlhalla",
        "cataclysm-dda",
        "everquest",
        "gradius-remake",
        "jfsw",
        "mega-man-unlimited",
        "metal-slug-remake",
        "openmohaa",
        "srb2",
        "star-wars-the-old-republic",
        "stunt-rally",
        "the-ur-quan-masters",
        "tinywind-pixel-pirate-sailing-game",
        "torcs",
        "war-thunder",
        "warframe",
        "world-of-sea-battle",
        "yorg",
        "beneath-a-steel-sky",
        "freelancer",
        "airforce",
        "marathon",
        "bombsquad",
        "re-volt-rvgl",
        "wipeout-rewrite",
        "openhv",
        // "Previously Free" promo games with sizeMB stuck at 0 and
        // releaseYear stuck at the year added to PlayBound — see
        // catalogCorrections.ts.
        "deponia",
        "caravan-sandwitch",
      ].sort()
    );
    expect(PATCH_GAME_FIELDS["super-nova-strike"]).toContain("androidStoreUrl");
    expect(PATCH_GAME_FIELDS["super-nova-strike"]).toContain("iosStoreUrl");
    expect(PATCH_GAME_FIELDS["super-nova-strike"]).toContain("qualityBar");
    expect(PATCH_GAME_FIELDS["super-nova-strike"]).toContain("longDescription");
    expect(PATCH_GAME_FIELDS["sky-children-of-the-light"]).toContain("installSteps");
    expect(PATCH_GAME_FIELDS["alien-swarm"]).toContain("longDescription");
    expect(PATCH_GAME_FIELDS["alien-swarm"]).not.toContain("launcherInstall");
    expect(PATCH_GAME_FIELDS["unknown-horizons"]).toContain("launcherInstall");
    expect(PATCH_GAME_FIELDS["x-men-arcade-remake"]).toEqual([
      "launcherInstall",
      "firstPlaySteps",
      "multiplayerGamingSteps",
    ]);
    expect(PATCH_GAME_FIELDS["tmnt-rescue-palooza"]).toEqual([
      "title",
      "aliases",
      "status",
      "maxPlayers",
      "launcherInstall",
      "firstPlaySteps",
      "multiplayerGamingSteps",
    ]);
    expect(PATCH_GAME_FIELDS.morrowind).toContain("launcherInstall");
    expect(PATCH_GAME_FIELDS.morrowind).toContain("qualityBar");
    expect(PATCH_GAME_FIELDS.morrowind).toContain("thatOneThing");
    expect(PATCH_GAME_FIELDS["dune-legacy"]).toEqual(["launcherInstall", "features", "thatOneThing"]);
    expect(PATCH_GAME_FIELDS["the-spike-cross"]).toContain("androidStoreUrl");
    expect(PATCH_GAME_FIELDS["slapshot-rebound"]).toContain("hardwareRequirements");
    expect(PATCH_GAME_FIELDS["space-station-14"]).toEqual([
      "launcherInstall",
      "installSteps",
      "releaseYear",
      "faq",
      "thatOneThing",
    ]);
    expect(PATCH_GAME_FIELDS.teeworlds).toContain("launcherInstall");
    expect(PATCH_GAME_FIELDS["the-dark-mod"]).toContain("platforms");
    expect(PATCH_GAME_FIELDS["pokemon-blaze-online"]).toContain("qualityBar");
    expect(PATCH_GAME_FIELDS["pokemon-blaze-online"]).toContain("longDescription");
    expect(PATCH_GAME_FIELDS["pokemon-blaze-online"]).toContain("features");
    expect(PATCH_GAME_FIELDS["pokemon-blaze-online"]).toContain("tags");
    expect(PATCH_GAME_FIELDS["pokemon-blaze-online"]).toContain("sizeMB");
    expect(PATCH_GAME_FIELDS.pokemmo).toContain("qualityBar");
    expect(PATCH_GAME_FIELDS.pokemmo).toContain("longDescription");
    expect(PATCH_GAME_FIELDS.pokemmo).toContain("features");
    expect(PATCH_GAME_FIELDS.pokemmo).toContain("tags");
    expect(PATCH_GAME_FIELDS.pokemmo).toContain("sizeMB");
    expect(PATCH_GAME_FIELDS["castlevania-revamped"]).not.toContain("coverImage");
  });

  it("patches CoP/SoC/Anomaly/Clear Sky editions + OpenMW/TES3MP/Lost Alpha recipes", () => {
    expect(Object.keys(PATCH_EDITION_FIELDS).sort()).toEqual(
      [
        "castlevania-revamped/official",
        "dune-legacy/modern-engine",
        "dune-legacy/playbound-edition",
        "hawken-hawkening/official",
        "morrowind/openmw",
        "morrowind/tes3mp",
        "pokemon-blaze-online/official",
        "pokemon-blaze-online/windows-32",
        "pokemmo/official",
        "s-t-a-l-k-e-r-clear-sky/official",
        "s-t-a-l-k-e-r-shadow-of-chernobyl/lost-alpha",
        "s-t-a-l-k-e-r-shadow-of-chernobyl/official",
        "s-t-a-l-k-e-r-shadow-of-chernobyl/true-stalker",
        "shattered-pixel-dungeon/official",
        "stalker-anomaly/gamma",
        "stalker-anomaly/official",
      ].sort()
    );
    expect(PATCH_EDITION_FIELDS["morrowind/openmw"]).toEqual(["installConfig"]);
    expect(PATCH_EDITION_FIELDS["morrowind/tes3mp"]).toEqual(["installConfig"]);
    expect(PATCH_EDITION_FIELDS["shattered-pixel-dungeon/official"]).toEqual(["installConfig"]);
    expect(PATCH_EDITION_FIELDS["pokemon-blaze-online/official"]).toEqual([
      "features",
      "tags",
      "installConfig",
    ]);
    expect(PATCH_EDITION_FIELDS["pokemon-blaze-online/windows-32"]).toEqual([
      "features",
      "tags",
      "installConfig",
    ]);
    expect(PATCH_EDITION_FIELDS["pokemmo/official"]).toEqual([
      "features",
      "tags",
      "installConfig",
    ]);
    expect(PATCH_EDITION_FIELDS["stalker-anomaly/gamma"]).toEqual([
      "name",
      "description",
      "shortDescription",
      "aliases",
      "links",
      "installMethod",
      "installConfig",
      "requirements",
      "hardwareRequirements",
    ]);
    expect(PATCH_EDITION_FIELDS["s-t-a-l-k-e-r-shadow-of-chernobyl/lost-alpha"]).toEqual([
      "name",
      "description",
      "shortDescription",
      "aliases",
      "requirements",
      "hardwareRequirements",
      "installMethod",
      "installConfig",
    ]);
    expect(PATCH_EDITION_FIELDS["s-t-a-l-k-e-r-shadow-of-chernobyl/true-stalker"]).toEqual([
      "name",
      "description",
      "shortDescription",
      "aliases",
      "requirements",
      "hardwareRequirements",
      "installConfig",
    ]);
    expect(PATCH_EDITION_FIELDS["dune-legacy/modern-engine"]).toEqual(["installConfig"]);
    expect(PATCH_EDITION_FIELDS["dune-legacy/playbound-edition"]).toEqual(["installConfig"]);
  });

  it("still patches holocure-rich-presence to draft", () => {
    expect(HOLOCURE_RICH_PRESENCE_SLUG).toBe("holocure-rich-presence");
    expect(holocureRichPresencePatchSource).toEqual({ status: "draft", published: false });
    expect(PATCH_MOD_FIELDS["holocure-rich-presence"]).toContain("status");
    expect(PATCH_MOD_FIELDS["holocure-rich-presence"]).toContain("published");
  });

  it("has a resolvable source for every allowlisted mod field", () => {
    /*
     * The mod patch path had no default source, so this used to be trivially
     * true — only holocure was listed. With 194 attribution fixes the wave
     * throws on the first field it cannot fill, and that throw would land
     * mid-deploy, so the check belongs here instead.
     */
    for (const slug of Object.keys(PATCH_MOD_FIELDS)) {
      const seedMod = mods.find((m) => m.slug === slug);
      let source: Record<string, unknown> =
        slug === HOLOCURE_RICH_PRESENCE_SLUG
          ? { ...holocureRichPresencePatchSource }
          : { ...((seedMod ?? {}) as unknown as Record<string, unknown>) };
      const attributed = attributionFor(slug);
      if (attributed) {
        source = {
          ...source,
          developerSlug: attributed,
          developerName:
            developersBySlug.get(attributed)?.name ??
            modAuthorsBySlug.get(attributed)?.name ??
            null,
        };
      }
      for (const field of PATCH_MOD_FIELDS[slug]!) {
        expect(source[field], `${slug}.${field} has no source`).toBeDefined();
      }
    }
  });

  it("never attributes a mod to a name nobody can resolve", () => {
    // A slug that resolves to neither a studio nor a mod author would write
    // developerName: null, which is what the three "community" mods did.
    for (const [modSlug, devSlug] of Object.entries(MOD_ATTRIBUTIONS)) {
      const known =
        developersBySlug.has(devSlug) || modAuthorsBySlug.has(devSlug);
      expect(known, `${modSlug} -> "${devSlug}" is in neither registry`).toBe(true);
    }
  });

  it("leaves the genuinely unverifiable mods alone", () => {
    /*
     * mod.io, ModDB and SourceForge were resolved in a second pass, so only
     * three remain: two whose ModDB pages publish no author field at all, and
     * one whose ModDB page no longer exists. They keep indie-web rather than
     * a guess.
     */
    for (const slug of [
      "openra-anthras-horizon",
      "openra-ymca",
      "openra-apocalyptic-doom",
    ]) {
      expect(MOD_ATTRIBUTIONS[slug]).toBeUndefined();
    }
  });

  it("has patch sources for Sky, Slapshot, Teeworlds, Dark Mod, UH, Spike, Alien Swarm, SS14", () => {
    expect(SKY_CHILDREN_SLUG).toBe("sky-children-of-the-light");
    expect(skyChildrenPatchSource.platforms).toEqual(["Android", "iOS"]);
    expect(skyChildrenPatchSource.androidStoreUrl).toBe(skyChildrenAndroidStoreUrl);
    expect(skyChildrenPatchSource.iosStoreUrl).toBe(skyChildrenIosStoreUrl);
    expect(skyChildrenPatchSource.launcherInstall.enabled).toBe(false);
    expect(skyChildrenPatchSource.installSteps?.length).toBeGreaterThan(0);

    expect(SLAPSHOT_REBOUND_SLUG).toBe("slapshot-rebound");
    expect(slapshotReboundPatchSource.features).toContain("Controller Support");
    expect(slapshotReboundPatchSource.hardwareRequirements.min.ramMB).toBe(4096);
    expect(getMultiplayerAdapter("slapshot-rebound").adapterType).toBe("official");

    expect(TEEWORLDS_SLUG).toBe("teeworlds");
    expect(teeworldsPatchSource.platforms).toEqual(["Windows", "macOS", "Linux"]);
    expect(teeworldsPatchSource.launcherInstall.assetPatternMac).toMatch(/osx/);
    expect(teeworldsPatchSource.launcherInstall.assetPatternLinux).toMatch(/linux_x86_64/);

    expect(THE_DARK_MOD_SLUG).toBe("the-dark-mod");
    expect(theDarkModPatchSource.platforms).toEqual(["Windows", "macOS", "Linux"]);
    expect(theDarkModPatchSource.launcherInstall.urlLinux).toMatch(/linux64/);
    expect(theDarkModPatchSource.features).toContain("PlayBound Controller Support");
    expect(theDarkModPatchSource.features).not.toContain("Controller Support");
    expect(
      (theDarkModPatchSource.launcherInstall as { urlMac?: string }).urlMac
    ).toBeUndefined();
    expect(
      theDarkModPatchSource.launcherInstall.knownExePaths.some((p) =>
        String(p).includes("COMPAT_PREFIXES")
      )
    ).toBe(true);

    expect(UNKNOWN_HORIZONS_SLUG).toBe("unknown-horizons");
    expect(unknownHorizonsPatchSource.launcherInstall.exeHint).toBe("run_uh");
    expect(unknownHorizonsPatchSource.launcherInstall.kind).toBe("direct-installer");
    expect(unknownHorizonsPatchSource.platforms).toEqual(["Windows", "macOS", "Linux"]);
    expect(
      unknownHorizonsPatchSource.launcherInstall.knownExePaths.some((p) =>
        String(p).includes("run_uh.bat")
      )
    ).toBe(true);
    expect(theDarkModPatchSource.launcherInstall.exeHint).not.toMatch(/tdm_installer/);

    expect(SPIKE_CROSS_SLUG).toBe("the-spike-cross");
    expect(spikeCrossPatchSource.platforms).toEqual(["Windows", "Android", "iOS"]);
    expect(spikeCrossPatchSource.androidStoreUrl).toMatch(/thespikerm/);

    expect(ALIEN_SWARM_SLUG).toBe("alien-swarm");
    expect(alienSwarmPatchSource.thatOneThing).toBeTruthy();
    expect(alienSwarmPatchSource.hardwareRequirements.min.storageMB).toBe(2560);

    const ss14 = gamesBySlug.get("space-station-14");
    expect(ss14?.launcherInstall?.assetPatternMac).toMatch(/macOS/);
    expect(ss14?.launcherInstall?.assetPatternLinux).toMatch(/Linux/);
    expect(editorial["space-station-14"]?.installSteps?.some((s) => /PlayBound/i.test(s.text))).toBe(
      true
    );

    expect(FREETRAIN_SLUG).toBe("freetrain");
    expect(freetrainLauncherInstall.needsDirectDrawWrapper).toBe(true);
    expect(IDLE_SLAYER_SLUG).toBe("idle-slayer");
    expect(idleSlayerPatchSource.androidStoreUrl).toBe(idleSlayerAndroidStoreUrl);
    expect(idleSlayerPatchSource.iosStoreUrl).toBe(idleSlayerIosStoreUrl);
    expect(SEVEN_KINGDOMS_SLUG).toBe("seven-kingdoms-ancient-adversaries");
    expect(sevenKingdomsLauncherInstall.knownExePaths).toContain("7kaa.exe");
    expect(sevenKingdomsLauncherInstall.knownExePaths.some((p) => p.includes("%PROGRAMFILES"))).toBe(
      true
    );
    expect(sevenKingdomsLauncherInstall.registryTitles).toContain("Seven Kingdoms AA");

    expect(SUPER_NOVA_STRIKE_SLUG).toBe("super-nova-strike");
    expect(superNovaStrikePatchSource.platforms).toEqual(["Android", "iOS"]);
    expect(superNovaStrikePatchSource.androidStoreUrl).toBe(superNovaStrikeAndroidStoreUrl);
    expect(superNovaStrikePatchSource.iosStoreUrl).toBe(superNovaStrikeIosStoreUrl);
    expect(superNovaStrikePatchSource.launcherInstall.enabled).toBe(false);
    expect(superNovaStrikePatchSource.installSteps.length).toBeGreaterThan(0);
    expect(superNovaStrikePatchSource.qualityBar.genuinelyFree).toBe(true);
    expect(superNovaStrikePatchSource.faq.length).toBeGreaterThanOrEqual(4);
    expect(superNovaStrikePatchSource.developerSlug).toBe("borgmobile");
  });

  it("keeps CoP official only; Anomaly is its own game with GAMMA edition; SoC keeps Lost Alpha + True Stalker", () => {
    const cop = editions.filter((e) => e.gameSlug === "s-t-a-l-k-e-r-call-of-pripyat");
    expect(cop.map((e) => e.slug).sort()).toEqual(["official"]);
    expect(gamesBySlug.has("stalker-anomaly")).toBe(true);
    expect(gamesBySlug.has("s-t-a-l-k-e-r-clear-sky")).toBe(true);
    const anomaly = editions.filter((e) => e.gameSlug === "stalker-anomaly");
    expect(anomaly.map((e) => e.slug).sort()).toEqual(["gamma", "official"]);
    const anomalyOfficial = anomaly.find((e) => e.slug === "official");
    expect(anomalyOfficial?.isDefault).toBe(true);
    const gamma = anomaly.find((e) => e.slug === "gamma");
    expect(gamma?.isDefault).toBe(false);
    expect(gamma?.shortDescription).toMatch(/Requires Anomaly/i);
    expect(gamma?.installMethod).toBe("playbound_installer");
    expect(gamma?.installConfig?.playbound_installer?.url).toMatch(
      /Grokitach\/Stalker_GAMMA/
    );
    expect(gamma?.links?.github).toBe("https://github.com/Grokitach/Stalker_GAMMA");
    const clearSky = editions.filter((e) => e.gameSlug === "s-t-a-l-k-e-r-clear-sky");
    expect(clearSky.map((e) => e.slug)).toEqual(["official"]);
    const soc = editions.filter((e) => e.gameSlug === "s-t-a-l-k-e-r-shadow-of-chernobyl");
    expect(soc.map((e) => e.slug).sort()).toEqual(["lost-alpha", "official", "true-stalker"]);
    const lostAlpha = soc.find((e) => e.slug === "lost-alpha");
    expect(lostAlpha?.name).toMatch(/Standalone/i);
    expect(lostAlpha?.shortDescription).toMatch(/no Shadow of Chornobyl GOG/i);
    expect(lostAlpha?.installMethod).toBe("playbound_installer");
    expect(lostAlpha?.installConfig?.playbound_installer?.knownExePaths).toContain(
      "bins\\XR_3DA.exe"
    );
    const trueStalker = soc.find((e) => e.slug === "true-stalker");
    expect(trueStalker?.name).toMatch(/Standalone/i);
    expect(trueStalker?.shortDescription).toMatch(/no Shadow of Chornobyl GOG/i);
  });

  it("keeps holocure-rich-presence unpublished in seed", () => {
    const mod = mods.find((m) => m.slug === "holocure-rich-presence");
    expect(mod?.published).toBe(false);
  });

  it("has default-path patch sources for every allowlisted game and edition field", () => {
    // Dedicated patch objects in insert-catalog-wave.ts (covered by other tests).
    const specialCasedGamePatches = new Set([
      ALIEN_SWARM_SLUG,
      ASSAULTCUBE_SLUG,
      FREETRAIN_SLUG,
      IDLE_SLAYER_SLUG,
      SEVEN_KINGDOMS_SLUG,
      SKY_CHILDREN_SLUG,
      SLAPSHOT_REBOUND_SLUG,
      "space-station-14",
      TEEWORLDS_SLUG,
      THE_DARK_MOD_SLUG,
      SPIKE_CROSS_SLUG,
      SUPER_NOVA_STRIKE_SLUG,
      UNKNOWN_HORIZONS_SLUG,
    ]);
    for (const slug of Object.keys(PATCH_GAME_FIELDS)) {
      if (specialCasedGamePatches.has(slug)) continue;
      const fields = PATCH_GAME_FIELDS[slug]!;
      const seed = gamesBySlug.get(slug);
      const ed = editorial[slug];
      // A CMS-only game has no seed row, so its values come from
      // catalogCorrections.ts instead. Still a hard requirement that *some*
      // source exists — the point of this test is that the wave can never
      // reach a $set with nothing behind it.
      const corrections = correctionsFor(slug);
      expect(
        seed || ed || corrections,
        `no seed/editorial/correction for default-path patch ${slug}`
      ).toBeTruthy();
      const source = {
        ...(seed as unknown as Record<string, unknown> | undefined),
        ...((ed ?? {}) as unknown as Record<string, unknown>),
        ...((corrections ?? {}) as Record<string, unknown>),
      };
      for (const field of fields) {
        // launcherInstall may live only on launcherInstallBySlug for some games;
        // those use the default seed.launcherInstall ?? overlay path at apply time.
        if (field === "launcherInstall" && source[field] === undefined) continue;
        expect(source[field], `${slug}.${field}`).not.toBeUndefined();
      }
    }
    for (const key of Object.keys(PATCH_EDITION_FIELDS)) {
      const [gameSlug, editionSlug] = key.split("/");
      const seed = editions.find((e) => e.gameSlug === gameSlug && e.slug === editionSlug);
      expect(seed, `missing edition seed ${key}`).toBeTruthy();
      const source: Record<string, unknown> = {
        name: seed!.name,
        description: seed!.description,
        version: seed!.version,
        installConfig: seed!.installConfig,
        shortDescription: seed!.shortDescription,
        visibility: seed!.visibility,
        status: seed!.status,
        installMethod: seed!.installMethod,
        requirements: seed!.requirements,
        hardwareRequirements: seed!.hardwareRequirements,
        aliases: seed!.aliases,
        links: seed!.links,
        features: seed!.features,
        tags: seed!.tags,
      };
      for (const field of PATCH_EDITION_FIELDS[key]!) {
        expect(source[field], `${key}.${field}`).not.toBeUndefined();
      }
    }
  });

  it("has seed rows for every allowlisted insert game and edition", () => {
    for (const slug of NEW_GAME_SLUGS) {
      expect(gamesBySlug.has(slug), `missing seed game ${slug}`).toBe(true);
    }
    const editionKeys = new Set(editions.map((e) => `${e.gameSlug}/${e.slug}`));
    for (const key of NEW_EDITION_KEYS) {
      expect(editionKeys.has(key), `missing seed edition ${key}`).toBe(true);
    }
  });

  it("gates edition and mod loops on the allowlists in source", () => {
    const src = readFileSync(join(process.cwd(), "scripts/insert-catalog-wave.ts"), "utf8");
    expect(src).toMatch(/allowedEditions\.has\(key\)/);
    expect(src).toMatch(/allowedMods\.has\(seed\.slug\)/);
    expect(src).toMatch(/PATCH_GAME_FIELDS/);
    expect(src).toMatch(/SKY_CHILDREN_SLUG/);
    expect(src).toMatch(/SLAPSHOT_REBOUND_SLUG/);
    expect(src).toMatch(/TEEWORLDS_SLUG/);
    expect(src).toMatch(/THE_DARK_MOD_SLUG/);
    expect(src).toMatch(/UNKNOWN_HORIZONS_SLUG/);
    expect(src).toMatch(/SPIKE_CROSS_SLUG/);
    expect(src).toMatch(/ALIEN_SWARM_SLUG/);
    expect(src).toMatch(/SUPER_NOVA_STRIKE_SLUG/);
    expect(src).toMatch(/space-station-14/);
    expect(src).toContain('from "./insert-catalog-wave.allowlist"');
  });
});
