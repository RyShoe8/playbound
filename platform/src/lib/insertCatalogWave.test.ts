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
        "earth-2140-trilogy",
        "flatout-2",
        "lovers-in-a-dangerous-spacetime",
        "populous-the-beginning",
        "relic-hunters-zero-remix",
        "soccer-brawl",
        "srb2kart",
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
        "baseball-stars-2/official",
        "earth-2140-trilogy/official",
        "earth-2140-trilogy/opene2140",
        "populous-the-beginning/official",
        "populous-the-beginning/populous-reincarnated",
        "s-t-a-l-k-e-r-call-of-pripyat/anomaly",
        "s-t-a-l-k-e-r-call-of-pripyat/official",
        "s-t-a-l-k-e-r-shadow-of-chernobyl/lost-alpha",
        "s-t-a-l-k-e-r-shadow-of-chernobyl/official",
        "s-t-a-l-k-e-r-shadow-of-chernobyl/true-stalker",
        "soccer-brawl/official",
        "super-sidekicks/official",
      ].sort()
    );
  });

  it("creates no mods in this wave", () => {
    expect(NEW_MOD_SLUGS).toEqual([]);
  });

  it("retires CoP gamma/gunslinger only (Anomaly restored)", () => {
    expect([...RETIRE_EDITION_KEYS].sort()).toEqual(
      [
        "s-t-a-l-k-e-r-call-of-pripyat/gamma",
        "s-t-a-l-k-e-r-call-of-pripyat/gunslinger",
      ].sort()
    );
  });

  it("patches the allowlisted games only", () => {
    expect(Object.keys(PATCH_GAME_FIELDS).sort()).toEqual(
      [
        "alien-swarm",
        "freetrain",
        "hurry-curry",
        "idle-slayer",
        "s-t-a-l-k-e-r-call-of-pripyat",
        "seven-kingdoms-ancient-adversaries",
        "sky-children-of-the-light",
        "slapshot-rebound",
        "space-station-14",
        "teeworlds",
        "the-dark-mod",
        "the-spike-cross",
        "unknown-horizons",
        "x-men-arcade-remake",
        "tmnt-rescue-palooza",
      ].sort()
    );
    expect(PATCH_GAME_FIELDS["sky-children-of-the-light"]).toContain("installSteps");
    expect(PATCH_GAME_FIELDS["alien-swarm"]).toContain("longDescription");
    expect(PATCH_GAME_FIELDS["alien-swarm"]).not.toContain("launcherInstall");
    expect(PATCH_GAME_FIELDS["unknown-horizons"]).toContain("launcherInstall");
    expect(PATCH_GAME_FIELDS["x-men-arcade-remake"]).toEqual(["launcherInstall"]);
    expect(PATCH_GAME_FIELDS["tmnt-rescue-palooza"]).toEqual(["launcherInstall"]);
    expect(PATCH_GAME_FIELDS["the-spike-cross"]).toContain("androidStoreUrl");
    expect(PATCH_GAME_FIELDS["slapshot-rebound"]).toContain("hardwareRequirements");
    expect(PATCH_GAME_FIELDS["space-station-14"]).toEqual(["launcherInstall", "installSteps"]);
    expect(PATCH_GAME_FIELDS.teeworlds).toContain("launcherInstall");
    expect(PATCH_GAME_FIELDS["the-dark-mod"]).toContain("platforms");
  });

  it("patches CoP official + restores Anomaly edition", () => {
    expect(Object.keys(PATCH_EDITION_FIELDS).sort()).toEqual(
      [
        "s-t-a-l-k-e-r-call-of-pripyat/anomaly",
        "s-t-a-l-k-e-r-call-of-pripyat/official",
      ].sort()
    );
    expect(PATCH_EDITION_FIELDS["s-t-a-l-k-e-r-call-of-pripyat/anomaly"]).toContain(
      "visibility"
    );
    expect(PATCH_EDITION_FIELDS["s-t-a-l-k-e-r-call-of-pripyat/anomaly"]).toContain(
      "hardwareRequirements"
    );
  });

  it("patches holocure-rich-presence to draft only", () => {
    expect(Object.keys(PATCH_MOD_FIELDS)).toEqual(["holocure-rich-presence"]);
    expect(HOLOCURE_RICH_PRESENCE_SLUG).toBe("holocure-rich-presence");
    expect(holocureRichPresencePatchSource).toEqual({ status: "draft", published: false });
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
    expect(theDarkModPatchSource.features).toContain("Controller Support");
    expect(
      (theDarkModPatchSource.launcherInstall as { urlMac?: string }).urlMac
    ).toBeUndefined();
    expect(
      theDarkModPatchSource.launcherInstall.knownExePaths.some((p) =>
        String(p).includes("COMPAT_PREFIXES")
      )
    ).toBe(true);

    expect(UNKNOWN_HORIZONS_SLUG).toBe("unknown-horizons");
    expect(unknownHorizonsPatchSource.launcherInstall.exeHint).toBe("unknownhorizons");
    expect(unknownHorizonsPatchSource.launcherInstall.kind).toBe("direct-installer");
    expect(unknownHorizonsPatchSource.platforms).toEqual(["Windows", "macOS", "Linux"]);

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
  });

  it("keeps CoP official + Anomaly in seed; keeps SoC Lost Alpha + True Stalker", () => {
    const cop = editions.filter((e) => e.gameSlug === "s-t-a-l-k-e-r-call-of-pripyat");
    expect(cop.map((e) => e.slug).sort()).toEqual(["anomaly", "official"]);
    const anomaly = cop.find((e) => e.slug === "anomaly");
    expect(anomaly?.visibility).toBe("public");
    expect(anomaly?.status).toBe("active");
    const soc = editions.filter((e) => e.gameSlug === "s-t-a-l-k-e-r-shadow-of-chernobyl");
    expect(soc.map((e) => e.slug).sort()).toEqual(["lost-alpha", "official", "true-stalker"]);
  });

  it("keeps holocure-rich-presence unpublished in seed", () => {
    const mod = mods.find((m) => m.slug === "holocure-rich-presence");
    expect(mod?.published).toBe(false);
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
    expect(src).toMatch(/space-station-14/);
    expect(src).toContain('from "./insert-catalog-wave.allowlist"');
  });
});
