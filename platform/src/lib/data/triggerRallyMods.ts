/**
 * Curated community tracks, vehicle presets, and visual enhancements for Trigger Rally.
 */
import { ghMod, type ModSeed } from "./modSeedHelpers";
import type { InstallStep } from "./types";

type Def = {
  slug: string;
  title: string;
  tagline: string;
  desc: string;
  base: string;
  baseTitle: string;
  path: string;
  website: string;
  developerSlug?: string;
  repo?: string;
  kind?: "github-zip" | "direct-zip" | "external";
  pattern?: string;
  direct?: string;
  size?: number;
  year?: number;
  license?: string;
  changes: string;
  summary: string;
  hint?: string;
  compat?: string;
  platforms?: ("Windows" | "macOS" | "Linux")[];
  steps?: InstallStep[];
  art?: { from: string; to: string; icon: string };
};

function m(d: Def): ModSeed {
  const kind = d.kind ?? (d.repo ? "github-zip" : d.direct ? "direct-zip" : "external");
  return ghMod({
    slug: d.slug,
    title: d.title,
    tagline: d.tagline,
    description: d.desc,
    baseGameSlug: d.base,
    baseTitle: d.baseTitle,
    developerSlug: d.developerSlug ?? "trigger-rally-team",
    license: d.license ?? "GPL-2.0 / Open Source",
    releaseYear: d.year ?? 2022,
    sizeMB: d.size ?? 20,
    website: d.website,
    githubRepo: d.repo ?? null,
    downloadKind: kind,
    assetPattern: d.pattern ?? null,
    directUrl: d.direct ?? null,
    installRelativePath: d.path,
    compatibility: d.compat ?? "Trigger Rally all versions",
    platforms: d.platforms,
    installSteps: d.steps,
    summary: d.summary,
    changes: d.changes,
    installHint: d.hint,
    art: d.art,
  });
}

export const triggerRallyMods: ModSeed[] = [
  m({
    slug: "trigger-community-tracks",
    title: "Community Championship & Endurance Circuit Pack",
    tagline: "Over 30 challenging community-created stages featuring mountain passes and desert endurance runs.",
    desc: "A massive compilation of community-designed tracks for Trigger Rally. Adds high-altitude switchback mountain climbs, extreme ice lake circuits, and long-distance desert endurance stages with tight checkpoint timers.",
    base: "trigger-rally",
    baseTitle: "Trigger Rally",
    path: "data/maps",
    website: "https://trigger-rally.sourceforge.net/",
    direct: "https://sourceforge.net/projects/trigger-rally/files/tracks/community_track_pack.zip/download",
    kind: "direct-zip",
    size: 25,
    year: 2022,
    changes: "Adds 32 new stages, 4 custom cup tournaments, and custom elevation heightmaps.",
    summary: "Extensive custom track expansion adding hours of challenging time-trial courses.",
    compat: "Trigger Rally v0.6+",
    hint: "Extract the track folders into data/maps in your Trigger Rally directory.",
    art: { from: "#92400e", to: "#f59e0b", icon: "Flag" },
  }),
  m({
    slug: "trigger-super-car-pack",
    title: "Tuned Rally Prototypes & Historic Liveries",
    tagline: "Group B inspired turbo rally vehicles with tuned suspension physics and custom racing liveries.",
    desc: "Expands the vehicle roster with high-output 4WD rally machines inspired by iconic Group B motorsport legends. Features stiffer suspension tuning, higher top speeds, and custom paint schemes.",
    base: "trigger-rally",
    baseTitle: "Trigger Rally",
    path: "data/vehicles",
    website: "https://trigger-rally.sourceforge.net/",
    direct: "https://sourceforge.net/projects/trigger-rally/files/vehicles/super_car_pack.zip/download",
    kind: "direct-zip",
    size: 15,
    year: 2021,
    changes: "Adds 6 custom vehicles with dedicated XML handling physics, sound effects, and liveries.",
    summary: "Vehicle expansion pack bringing powerful Group B style rally prototypes to the game.",
    compat: "Trigger Rally v0.6+",
    hint: "Extract the vehicle folders into data/vehicles in your Trigger Rally directory.",
    art: { from: "#dc2626", to: "#f87171", icon: "Gauge" },
  }),
  m({
    slug: "trigger-high-res-terrain",
    title: "Enhanced Terrain Textures & Weather Particles",
    tagline: "High-resolution terrain ground textures, sharp gravel details, and denser snow particle effects.",
    desc: "Replaces standard low-resolution ground textures with crisp high-definition terrain materials. Enhances road surface clarity, mud splatters, and environmental weather particle density.",
    base: "trigger-rally",
    baseTitle: "Trigger Rally",
    path: "data/textures",
    website: "https://trigger-rally.sourceforge.net/",
    direct: "https://sourceforge.net/projects/trigger-rally/files/textures/hd_terrain_textures.zip/download",
    kind: "direct-zip",
    size: 30,
    year: 2023,
    changes: "Remasters all ground terrain textures including gravel, sand, snow, grass, and mud shaders.",
    summary: "Visual upgrade pack improving terrain detail and driving immersion.",
    compat: "Trigger Rally v0.6+",
    hint: "Extract texture archives into data/textures in your Trigger Rally install folder.",
    art: { from: "#059669", to: "#34d399", icon: "Sparkles" },
  }),
];
