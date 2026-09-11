import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  NEW_EDITION_KEYS,
  NEW_GAME_SLUGS,
  NEW_MOD_SLUGS,
  PATCH_EDITION_FIELDS,
  PATCH_GAME_FIELDS,
} from "../../scripts/insert-catalog-wave.allowlist";
import { editions } from "@/lib/data/editions";
import { gamesBySlug } from "@/lib/data/games";
import { launcherInstallBySlug } from "@/lib/data/launcherInstall";
import { ASSAULTCUBE_SLUG } from "@/lib/data/assaultCubeSpecs";

/**
 * Deploy insert:catalog-wave must stay scoped. The August 2026 bug was an
 * allowlist that existed in the file but never gated the loops — so a deploy
 * could create every missing seed edition/mod. These checks pin the contract.
 */
describe("insert-catalog-wave allowlists", () => {
  it("only names the batch games we intend to create", () => {
    expect([...NEW_GAME_SLUGS].sort()).toEqual(
      [
        "earth-2140-trilogy",
        "populous-the-beginning",
        "the-spike-cross",
        "trackmania",
      ].sort()
    );
  });

  it("only names the batch editions we intend to create", () => {
    expect([...NEW_EDITION_KEYS].sort()).toEqual(
      [
        "earth-2140-trilogy/official",
        "earth-2140-trilogy/opene2140",
        "populous-the-beginning/official",
        "populous-the-beginning/populous-reincarnated",
        "s-t-a-l-k-e-r-call-of-pripyat/official",
        "s-t-a-l-k-e-r-shadow-of-chernobyl/official",
      ].sort()
    );
  });

  it("creates no mods in this wave", () => {
    expect(NEW_MOD_SLUGS).toEqual([]);
  });

  it("patches only BombSquad and AssaultCube game fields", () => {
    expect(Object.keys(PATCH_GAME_FIELDS).sort()).toEqual(["assaultcube", "bombsquad"]);
    expect(PATCH_GAME_FIELDS.bombsquad).toEqual([
      "launcherInstall",
      "platforms",
      "androidStoreUrl",
    ]);
    expect(PATCH_GAME_FIELDS.assaultcube).toEqual([
      "launcherInstall",
      "systemRequirements",
      "hardwareRequirements",
    ]);
  });

  it("patches only the BombSquad desktop edition fields", () => {
    expect(Object.keys(PATCH_EDITION_FIELDS)).toEqual(["bombsquad/standalone-pc"]);
    expect(PATCH_EDITION_FIELDS["bombsquad/standalone-pc"]).toEqual([
      "name",
      "description",
      "version",
      "installConfig.playbound_installer",
    ]);
  });

  it("has seed or recipe sources for every patched game and edition", () => {
    expect(gamesBySlug.has("bombsquad")).toBe(true);
    expect(launcherInstallBySlug[ASSAULTCUBE_SLUG]).toBeDefined();
    const editionKeys = new Set(editions.map((e) => `${e.gameSlug}/${e.slug}`));
    for (const key of Object.keys(PATCH_EDITION_FIELDS)) {
      expect(editionKeys.has(key), `missing seed edition ${key}`).toBe(true);
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
    expect(src).toMatch(/for \(const slug of NEW_GAME_SLUGS\)/);
    expect(src).toMatch(/PATCH_GAME_FIELDS/);
    expect(src).toMatch(/PATCH_EDITION_FIELDS/);
    expect(src).toContain('from "./insert-catalog-wave.allowlist"');
    expect(src).not.toMatch(/\$set:\s*seed\b/);
    expect(src).not.toMatch(/findOneAndUpdate/);
  });
});
