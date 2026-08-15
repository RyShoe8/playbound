/**
 * Curated community enhancements, audio packs, and display presets for Gradius Remake.
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
    developerSlug: d.developerSlug ?? "konami-community",
    license: d.license ?? "Freeware / Community",
    releaseYear: d.year ?? 2022,
    sizeMB: d.size ?? 15,
    website: d.website,
    githubRepo: d.repo ?? null,
    downloadKind: kind,
    assetPattern: d.pattern ?? null,
    directUrl: d.direct ?? null,
    installRelativePath: d.path,
    compatibility: d.compat ?? "Gradius Remake PC",
    platforms: d.platforms,
    installSteps: d.steps,
    summary: d.summary,
    changes: d.changes,
    installHint: d.hint,
    art: d.art,
  });
}

export const gradiusRemakeMods: ModSeed[] = [
  m({
    slug: "gradius-arranged-soundtrack",
    title: "Gradius Arranged Stereo OST Pack",
    tagline: "High-fidelity stereo orchestral and synthwave remix soundtrack for all stages.",
    desc: "Replaces the original FM synthesis tracks with premium stereo arranged compositions from Konami Kukeiha Club arrange albums, enhancing every level from Challenger 1985 to the Final Base.",
    base: "gradius-remake",
    baseTitle: "Gradius Remake",
    path: "music/arranged",
    website: "https://archive.org/details/gradius-remake-pc",
    direct: "https://archive.org/download/gradius-remake-pc/GradiusArrangedOST.zip",
    kind: "direct-zip",
    size: 45,
    year: 2022,
    changes: "Replaces stage BGM with stereo CD-quality arranged recordings while keeping original sound effects.",
    summary: "Complete arranged musical score elevating stage atmosphere with rich synthesizer tracks.",
    compat: "Gradius Remake PC v1.0+",
    hint: "Extract contents into the game's audio/ or music/ directory.",
    art: { from: "#1e1b4b", to: "#818cf8", icon: "Sparkles" },
  }),
  m({
    slug: "gradius-arcade-scanlines",
    title: "Classic CRT Scanline & Phosphor Preset",
    tagline: "Authentic arcade cabinet scanline, bloom, and curvature shader profiles.",
    desc: "A custom retro display shader preset that recreates the authentic look of a 15kHz arcade cathode-ray tube (CRT) monitor with subtle phosphor glow, aperture grille scanlines, and slight corner curvature.",
    base: "gradius-remake",
    baseTitle: "Gradius Remake",
    path: "shaders/crt",
    website: "https://github.com/libretro/glsl-shaders",
    repo: "libretro/glsl-shaders",
    kind: "github-zip",
    size: 8,
    year: 2022,
    changes: "Adds configurable scanline density, phosphor glow simulation, and gamma correction.",
    summary: "Authentic 1980s arcade monitor visual recreation with crisp scanlines and zero latency.",
    compat: "OpenGL / DirectX display drivers",
    hint: "Place in the shaders directory or select CRT Filter in the video options menu.",
    art: { from: "#065f46", to: "#34d399", icon: "Sliders" },
  }),
  m({
    slug: "gradius-arcade-stick-config",
    title: "Arcade Fight Stick & Gamepad Preset",
    tagline: "Tournament-grade 8-way joystick mapping and responsive turbo fire profile.",
    desc: "Optimized input configuration profile for Sanwa/Seimitsu arcade joysticks, hitbox controllers, and modern Xbox/PlayStation gamepads with dedicated autofire and thumbstick sensitivity tweaks.",
    base: "gradius-remake",
    baseTitle: "Gradius Remake",
    path: "config/arcade-stick",
    website: "https://archive.org/details/gradius-remake-pc",
    direct: "https://archive.org/download/gradius-remake-pc/GradiusStickProfile.zip",
    kind: "direct-zip",
    size: 2,
    year: 2022,
    changes: "Preconfigured button bindings for 6-button arcade layouts with optional 30Hz autofire toggle.",
    summary: "Tournament-ready arcade control scheme with calibrated 8-way digital deadzones.",
    compat: "DirectInput / XInput USB controllers",
    hint: "Extract config.ini into the root folder to apply arcade layout bindings.",
    art: { from: "#991b1b", to: "#f87171", icon: "Sliders" },
  }),
];
