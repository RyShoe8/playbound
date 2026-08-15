/**
 * Curated open-source community tools, shader frameworks, and build optimizers for Genshin Impact.
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
    developerSlug: d.developerSlug ?? "community",
    license: d.license ?? "Open Source / MIT",
    releaseYear: d.year ?? 2024,
    sizeMB: d.size ?? 25,
    website: d.website,
    githubRepo: d.repo ?? null,
    downloadKind: kind,
    assetPattern: d.pattern ?? null,
    directUrl: d.direct ?? null,
    installRelativePath: d.path,
    compatibility: d.compat ?? "Genshin Impact PC (DirectX 11)",
    platforms: d.platforms,
    installSteps: d.steps,
    summary: d.summary,
    changes: d.changes,
    installHint: d.hint,
    art: d.art,
  });
}

export const genshinImpactMods: ModSeed[] = [
  m({
    slug: "genshin-gimi-framework",
    title: "3DMigoto GIMI (Model Importer)",
    tagline: "Open-source 3DMigoto modding framework for custom character skins and shaders.",
    desc: "The standard open-source client-side shader and 3D model injector for Genshin Impact. Loads custom character textures, interface skins, and custom lighting models into memory without altering original game files.",
    base: "genshin-impact",
    baseTitle: "Genshin Impact",
    path: "tools/gimi",
    website: "https://github.com/SilentNightSound/GI-Model-Importer",
    repo: "SilentNightSound/GI-Model-Importer",
    kind: "github-zip",
    size: 35,
    year: 2024,
    changes: "Enables in-memory 3DMigoto shader injection, hot-reloading (F10), and custom mesh replacement.",
    summary: "Essential mod loader for community character models, texture packs, and UI modifications.",
    compat: "Windows 10 / 11 64-bit",
    hint: "Extract to a dedicated directory and run 3DMigoto Loader.exe before starting the game client.",
    art: { from: "#0e7490", to: "#38bdf8", icon: "Sliders" },
  }),
  m({
    slug: "genshin-optimizer",
    title: "Genshin Optimizer",
    tagline: "Open-source character build optimizer, artifact inventory scanner, and damage calculator.",
    desc: "A comprehensive open-source tool for Genshin Impact players. Parses artifact inventories, optimizes character builds across millions of artifact permutations, calculates theoretical team DPS, and accounts for conditional weapon/talent buffs.",
    base: "genshin-impact",
    baseTitle: "Genshin Impact",
    path: "tools/optimizer",
    website: "https://github.com/frzyc/genshin-optimizer",
    repo: "frzyc/genshin-optimizer",
    kind: "github-zip",
    size: 20,
    year: 2024,
    changes: "Automated artifact OCR scanning, damage simulation, and optimal gear calculation engine.",
    summary: "The definitive open-source build optimizer to find the highest DPS gear configurations.",
    compat: "Desktop and Web",
    hint: "Launch the local web dashboard or scan your artifact bag with the OCR scanner.",
    art: { from: "#047857", to: "#34d399", icon: "Sparkles" },
  }),
  m({
    slug: "genshin-combat-sim",
    title: "gcsim (Genshin Combat Simulator)",
    tagline: "Open-source programmable team rotation simulator and DPS calculation engine.",
    desc: "A powerful Monte Carlo rotation simulator for Genshin Impact theorycrafters. Simulates frame-accurate character action rotations, energy particle generation, elemental ICD (internal cooldown) mechanics, and teamwide DPS output.",
    base: "genshin-impact",
    baseTitle: "Genshin Impact",
    path: "tools/gcsim",
    website: "https://github.com/genshinsim/gcsim",
    repo: "genshinsim/gcsim",
    kind: "github-zip",
    size: 40,
    year: 2024,
    changes: "Frame-accurate combat engine simulating team rotations, energy particles, and elemental gauge theory.",
    summary: "The competitive standard for theorycrafting rotation efficiency and DPS benchmarks.",
    compat: "Windows, Linux, macOS",
    hint: "Run simulation configs or explore verified rotation scripts through the gcsim desktop tool.",
    art: { from: "#6b21a8", to: "#c084fc", icon: "Zap" },
  }),
];
