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
];
