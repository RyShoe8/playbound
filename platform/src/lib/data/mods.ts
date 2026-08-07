/**
 * Curated seed catalog of community mods for games with Mod Support.
 * Seeded into Mongo via scripts/seed-mods.ts (upsert by slug).
 *
 * Wave content lives in fossModsWave.ts (~20–25 mods per FOSS title).
 */
import type { ModSeed } from "./modSeedHelpers";
import { fossModsWave } from "./fossModsWave";

export type { ModSeed } from "./modSeedHelpers";

/** Preserve previously hosted local covers when the wave reuses a slug. */
const COVER_OVERRIDES: Record<string, string> = {
  "openra-tiberian-dawn-hd": "/mods/openra-tiberian-dawn-hd/cover.webp",
  "openra-opene2140": "/mods/openra-opene2140/cover.webp",
  "openra-combined-arms": "/mods/openra-combined-arms/cover.webp",
};

export const mods: ModSeed[] = fossModsWave.map((m) =>
  COVER_OVERRIDES[m.slug] ? { ...m, coverImage: COVER_OVERRIDES[m.slug] } : m
);

export const modsBySlug = new Map(mods.map((m) => [m.slug, m]));

export function modsForBaseGame(baseGameSlug: string): ModSeed[] {
  return mods.filter((m) => m.baseGameSlug === baseGameSlug);
}
