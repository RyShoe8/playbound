/**
 * Curated competitive configs, crosshair packs, and practice tools for Quake Champions.
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
    developerSlug: d.developerSlug ?? "id-software",
    license: d.license ?? "Community Config / Free",
    releaseYear: d.year ?? 2023,
    sizeMB: d.size ?? 5,
    website: d.website,
    githubRepo: d.repo ?? null,
    downloadKind: kind,
    assetPattern: d.pattern ?? null,
    directUrl: d.direct ?? null,
    installRelativePath: d.path,
    compatibility: d.compat ?? "Quake Champions Steam / PC",
    platforms: d.platforms,
    installSteps: d.steps,
    summary: d.summary,
    changes: d.changes,
    installHint: d.hint,
    art: d.art,
  });
}

export const quakeChampionsMods: ModSeed[] = [
  m({
    slug: "qc-competitive-config",
    title: "Competitive Pro Config & Settings Optimizer",
    tagline: "Uncapped frame rates, reduced input latency, and clean visual clarity settings.",
    desc: "A curated performance and input configuration based on settings used by Quake Pro League finalists. Disables post-processing bloom, motion blur, and ambient clutter while tuning raw mouse input and high-refresh frame targets.",
    base: "quake-champions",
    baseTitle: "Quake Champions",
    path: "config",
    website: "https://steamcommunity.com/sharedfiles/filedetails/?id=1496924823",
    kind: "external",
    size: 2,
    year: 2023,
    changes: "Disables depth of field, bloom, and motion blur; tunes raw mouse input and enables high-contrast enemy outlines.",
    summary: "Optimizes in-game video and input settings for competitive play and maximum frame rate consistency on high-refresh monitors.",
    compat: "All current Quake Champions versions",
    hint: "Apply launch parameters or configure through the in-game Settings menu.",
    art: { from: "#7f1d1d", to: "#f87171", icon: "Sliders" },
  }),
  m({
    slug: "qc-crosshair-hud-pack",
    title: "High-Visibility Custom Crosshair & Color Pack",
    tagline: "High-contrast reticle styles and per-weapon crosshair assignments.",
    desc: "A comprehensive crosshair and HUD guide featuring optimal color palettes (cyan, magenta, lime green) and reticle dot/cross configurations matched to weapon roles (Railgun, Lightning Gun, Rocket Launcher).",
    base: "quake-champions",
    baseTitle: "Quake Champions",
    path: "hud",
    website: "https://steamcommunity.com/sharedfiles/filedetails/?id=1384074213",
    kind: "external",
    size: 1,
    year: 2023,
    changes: "Color-coded per-weapon reticle assignments and high-visibility HUD scaling profiles.",
    summary: "Provides distinct crosshair geometries for flick hitscan vs continuous tracking weapons to improve aim precision.",
    compat: "Quake Champions Steam client",
    hint: "Configure crosshair shapes and colors in the in-game HUD and Weapon Settings tab.",
    art: { from: "#0f766e", to: "#2dd4bf", icon: "Crosshair" },
  }),
  m({
    slug: "qc-aim-training-routines",
    title: "Quake Arena Aim & Movement Training Routines",
    tagline: "Dedicated tracking and projectile prediction drills for aim trainers.",
    desc: "A set of customized aim training scenarios and movement routines calibrated to Quake Champions FOV scales, Lightning Gun tracking speeds, and Rocket juggle flick angles.",
    base: "quake-champions",
    baseTitle: "Quake Champions",
    path: "practice",
    website: "https://steamcommunity.com/sharedfiles/filedetails/?id=2849204859",
    kind: "external",
    size: 10,
    year: 2024,
    changes: "Practice playlists for fast strafe tracking, railgun flicking, and vertical rocket prediction.",
    summary: "Calibrated 1:1 training drills designed to build mechanical tracking stamina and flick accuracy for Quake Champions duelists.",
    compat: "Aim trainers with Quake sensitivity conversion",
    hint: "Load playlist codes in your aim trainer of choice matching your Quake Champions in-game sensitivity.",
    art: { from: "#3b0764", to: "#c084fc", icon: "Target" },
  }),
];
