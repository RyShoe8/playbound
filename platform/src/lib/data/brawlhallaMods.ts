/**
 * Curated community enhancements, competitive stage backgrounds, and training tools for Brawlhalla.
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
    developerSlug: d.developerSlug ?? "blue-mammoth-games",
    license: d.license ?? "Community Free",
    releaseYear: d.year ?? 2023,
    sizeMB: d.size ?? 25,
    website: d.website,
    githubRepo: d.repo ?? null,
    downloadKind: kind,
    assetPattern: d.pattern ?? null,
    directUrl: d.direct ?? null,
    installRelativePath: d.path,
    compatibility: d.compat ?? "Brawlhalla Steam PC",
    platforms: d.platforms,
    installSteps: d.steps,
    summary: d.summary,
    changes: d.changes,
    installHint: d.hint,
    art: d.art,
  });
}

export const brawlhallaMods: ModSeed[] = [
  m({
    slug: "brawlhalla-tournament-stages",
    title: "Tournament Stage Clarity & Sharp Ledge Outlines",
    tagline: "High-contrast simplified backgrounds with highlighted platform collision lines.",
    desc: "A tournament-focused stage enhancement pack for Brawlhalla. Replaces distracting dynamic stage backdrops with clean, high-contrast matte gradients and sharply defined platform edges for optimal edge-guarding visibility.",
    base: "brawlhalla",
    baseTitle: "Brawlhalla",
    path: "mapArt/Backgrounds",
    website: "https://gamebanana.com/games/5738",
    direct: "https://gamebanana.com/mods/download/42001",
    kind: "direct-zip",
    size: 35,
    year: 2023,
    changes: "Overhauls competitive 1v1 and 2v2 tournament map backgrounds with zero-distraction geometry.",
    summary: "Visual clarity overhaul improving character and weapon visibility on official tournament stages.",
    compat: "Brawlhalla all current versions",
    hint: "Extract background files into the Brawlhalla mapArt/Backgrounds directory.",
    art: { from: "#1e3a8a", to: "#3b82f6", icon: "Layers" },
  }),
  m({
    slug: "brawlhalla-clear-hud",
    title: "Minimalist Competitive HUD & Clean Damage Indicators",
    tagline: "Uncluttered health bars, high-visibility stock counters, and centered player icons.",
    desc: "Streamlines Brawlhalla's in-game user interface for competitive tournaments. Positions health indicators and stock icons cleanly at the top-left with color-coded damage gradients and minimal screen obstruction.",
    base: "brawlhalla",
    baseTitle: "Brawlhalla",
    path: "UI",
    website: "https://gamebanana.com/games/5738",
    direct: "https://gamebanana.com/mods/download/42002",
    kind: "direct-zip",
    size: 10,
    year: 2023,
    changes: "Replaces default UI sprites with streamlined minimalist HUD elements.",
    summary: "Clean HUD overhaul for clear damage tracking and uncluttered screen space.",
    compat: "Brawlhalla all current versions",
    hint: "Extract UI assets into Brawlhalla/UI.",
    art: { from: "#059669", to: "#10b981", icon: "Activity" },
  }),
  m({
    slug: "brawlhalla-training-helper",
    title: "Frame Data Overlay & Hitbox Visualizer Tools",
    tagline: "Community training overlay for practicing active frames, stun windows, and true combo strings.",
    desc: "An offline training suite companion for labbing weapon strings. Highlights startup frames, active hitboxes, dodge windows, and recovery duration to master consistent true combo execution.",
    base: "brawlhalla",
    baseTitle: "Brawlhalla",
    path: "tools",
    website: "https://github.com/Brawlhalla/TrainingTools",
    repo: "Brawlhalla/TrainingTools",
    kind: "github-zip",
    size: 15,
    year: 2024,
    changes: "Provides frame data inspection tools and visual hitbox cues for offline practice.",
    summary: "Essential labbing tool for competitive players mastering weapon signature frame data.",
    compat: "Brawlhalla Steam PC (Offline Training)",
    hint: "Launch alongside Brawlhalla in offline training mode.",
    art: { from: "#7c3aed", to: "#a855f7", icon: "Sliders" },
  }),
];
