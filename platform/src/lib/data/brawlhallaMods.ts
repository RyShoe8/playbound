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
