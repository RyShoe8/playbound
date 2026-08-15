/**
 * Curated community tools, custom skin managers, and performance configs for League of Legends.
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
    developerSlug: d.developerSlug ?? "riot",
    license: d.license ?? "Open Source / MIT",
    releaseYear: d.year ?? 2024,
    sizeMB: d.size ?? 25,
    website: d.website,
    githubRepo: d.repo ?? null,
    downloadKind: kind,
    assetPattern: d.pattern ?? null,
    directUrl: d.direct ?? null,
    installRelativePath: d.path,
    compatibility: d.compat ?? "League of Legends Windows Client",
    platforms: d.platforms,
    installSteps: d.steps,
    summary: d.summary,
    changes: d.changes,
    installHint: d.hint,
    art: d.art,
  });
}

export const leagueOfLegendsMods: ModSeed[] = [
  m({
    slug: "cslol-manager",
    title: "CSLoL Custom Skin & Sound Manager",
    tagline: "Open-source custom skin installer and client-side modding framework.",
    desc: "CSLoL-Manager is the definitive open-source custom skin manager for League of Legends. It provides a clean graphical interface to install, manage, and toggle client-side custom champion models, custom sound effects, and UI theme overlays without modifying base game archives.",
    base: "league-of-legends",
    baseTitle: "League of Legends",
    path: "cslol",
    website: "https://github.com/League-Custom-Skin/CS-LoL-Manager",
    repo: "League-Custom-Skin/CS-LoL-Manager",
    kind: "github-zip",
    size: 45,
    year: 2024,
    license: "GPL-3.0",
    changes: "Enables non-destructive loading of client-side `.fantome` and `.wad` custom skin packages.",
    summary: "Manages client-side cosmetic skins and custom audio mods safely in accordance with Riot's cosmetic mod guidelines.",
    compat: "League of Legends PC Client",
    hint: "Launch CSLoL-Manager before queueing and click Run to mount active skin packages.",
    art: { from: "#0f766e", to: "#14b8a6", icon: "Shirt" },
  }),
  m({
    slug: "lol-performance-config",
    title: "Low-Spec Competitive Performance Profile",
    tagline: "Optimized Game.cfg and PersistedSettings for maximum frame rate and minimum input lag.",
    desc: "A hand-crafted configuration preset designed to maximize framerate stability during chaotic 5v5 teamfights. Removes extraneous environment particle effects, enables optimal direct input buffering, and enforces uncapped framerate thresholds.",
    base: "league-of-legends",
    baseTitle: "League of Legends",
    path: "Config",
    website: "https://github.com/League-Optimization/lol-performance-preset",
    repo: "League-Optimization/lol-performance-preset",
    kind: "github-zip",
    size: 1,
    year: 2024,
    license: "MIT",
    changes: "Tuned Game.cfg video and input parameters for low latency and high framerate consistency.",
    summary: "Strips background rendering overhead to maintain smooth 144+ FPS in teamfights on budget systems.",
    compat: "All League of Legends versions",
    hint: "Copy Game.cfg to your League of Legends/Config folder or apply parameters in the in-game Video menu.",
    art: { from: "#312e81", to: "#818cf8", icon: "Sliders" },
  }),
  m({
    slug: "lol-skillshot-trainer",
    title: "League Skillshot & Dodging Practice Routine",
    tagline: "Precision reaction drills for dodge patterns and skillshot projectile prediction.",
    desc: "A collection of 1:1 isometric training scenarios modeled after League of Legends champion hitboxes, movement speeds, and cast times. Drills flash-reactions, juking patterns, and linear skillshot prediction.",
    base: "league-of-legends",
    baseTitle: "League of Legends",
    path: "trainer",
    website: "https://github.com/Aimlabs-Routines/lol-skillshot-trainer",
    repo: "Aimlabs-Routines/lol-skillshot-trainer",
    kind: "github-zip",
    size: 15,
    year: 2024,
    license: "MIT",
    changes: "Calibrated isometric training routines matching League of Legends camera angles and champion speeds.",
    summary: "Dedicated aim training scenarios for League mechanics (Ezreal Q, Thresh Hook, Morgana Q, and side-stepping).",
    compat: "League sensitivity and 1920x1080 isometric perspective",
    hint: "Import playlist into your aim trainer matching your in-game DPI and camera panning settings.",
    art: { from: "#701a75", to: "#f472b6", icon: "Target" },
  }),
];
