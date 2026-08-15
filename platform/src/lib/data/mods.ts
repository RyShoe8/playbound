/**
 * Curated seed catalog of community mods for games with Mod Support.
 * Seeded into Mongo via scripts/seed-mods.ts (upsert by slug).
 *
 * Waves: fossModsWave (7 FOSS titles) + phase2 remasters/live hubs.
 */
import type { ModSeed } from "./modSeedHelpers";
import { fossModsWave } from "./fossModsWave";
import { phase2ModsRemasters } from "./phase2ModsRemasters";
import { phase2ModsLive } from "./phase2ModsLive";
import { verifiedModsWave } from "./verifiedModsWave";
import { wave1Mods } from "./wave1Mods";
import { tf2Mods } from "./tf2Mods";
import { daggerfallMods } from "./daggerfallMods";
import { wolfensteinMods } from "./wolfensteinMods";
import { asheronMods } from "./asheronMods";
import { openlaraMods } from "./openlaraMods";
import { cs2Mods } from "./cs2Mods";
import { valorantMods } from "./valorantMods";
import { warthunderMods } from "./warthunderMods";
import { swgMods } from "./swgMods";
import { geminiGoldMods } from "./geminiGoldMods";
import { quakeChampionsMods } from "./quakeChampionsMods";
import { leagueOfLegendsMods } from "./leagueOfLegendsMods";
import { dota2Mods } from "./dota2Mods";

export type { ModSeed } from "./modSeedHelpers";

/** Preserve previously hosted local covers when the wave reuses a slug. */
const COVER_OVERRIDES: Record<string, string> = {
  "openra-tiberian-dawn-hd": "/mods/openra-tiberian-dawn-hd/cover.webp",
  "openra-opene2140": "/mods/openra-opene2140/cover.webp",
  "openra-combined-arms": "/mods/openra-combined-arms/cover.webp",
};

export const mods: ModSeed[] = [
  ...fossModsWave,
  ...phase2ModsRemasters,
  ...phase2ModsLive,
  ...verifiedModsWave,
  ...wave1Mods,
  ...tf2Mods,
  ...daggerfallMods,
  ...wolfensteinMods,
  ...asheronMods,
  ...openlaraMods,
  ...cs2Mods,
  ...valorantMods,
  ...warthunderMods,
  ...swgMods,
  ...geminiGoldMods,
  ...quakeChampionsMods,
  ...leagueOfLegendsMods,
  ...dota2Mods,
].map((m) =>
  COVER_OVERRIDES[m.slug] ? { ...m, coverImage: COVER_OVERRIDES[m.slug] } : m
);

export const modsBySlug = new Map(mods.map((m) => [m.slug, m]));

export function modsForBaseGame(baseGameSlug: string): ModSeed[] {
  const norm = baseGameSlug === "alephone" ? "marathon-2" : baseGameSlug;
  return mods.filter(
    (m) =>
      m.baseGameSlug === baseGameSlug ||
      (norm === "marathon-2" && (m.baseGameSlug === "alephone" || m.baseGameSlug === "marathon-2"))
  );
}
