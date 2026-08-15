/**
 * Curated community enhancements, music packs, and controller layouts for Mr. Boom.
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
    developerSlug: d.developerSlug ?? "javanaise",
    license: d.license ?? "Open Source (GPL-3.0)",
    releaseYear: d.year ?? 2023,
    sizeMB: d.size ?? 10,
    website: d.website,
    githubRepo: d.repo ?? null,
    downloadKind: kind,
    assetPattern: d.pattern ?? null,
    directUrl: d.direct ?? null,
    installRelativePath: d.path,
    compatibility: d.compat ?? "Mr. Boom v5.0+",
    platforms: d.platforms,
    installSteps: d.steps,
    summary: d.summary,
    changes: d.changes,
    installHint: d.hint,
    art: d.art,
  });
}

export const mrboomMods: ModSeed[] = [
  m({
    slug: "mrboom-classic-ost",
    title: "Classic Amiga & DOS Tracker Music Pack",
    tagline: "High-energy retro tracker MOD/XM music and voice samples from the 1999 original.",
    desc: "The authentic retro tracker audio suite for Mr. Boom. Restores original 1999 FastTracker II MOD tunes and classic French voice lines alongside modern stereo arrangements.",
    base: "mrboom",
    baseTitle: "Mr. Boom",
    path: "audio/music",
    website: "https://github.com/Javanaise/mrboom-libretro",
    repo: "Javanaise/mrboom-libretro",
    kind: "github-zip",
    size: 25,
    year: 2023,
    changes: "Enables retro audio profile with 9 classic tracker modules and original bomb announcer voice clips.",
    summary: "Authentic retro soundtrack bringing classic 1990s tracker chiptune energy to every match.",
    compat: "Mr. Boom PC / Steam Deck",
    hint: "Place in the audio/ directory to enable retro tracker playlist.",
    art: { from: "#dc2626", to: "#f87171", icon: "Sparkles" },
  }),
  m({
    slug: "mrboom-retro-arenas",
    title: "Classic Retro Arenas & Hazard Grid Pack",
    tagline: "Expanded collection of custom arena layouts with conveyor belts and warp portals.",
    desc: "Adds 12 competitive grid arenas inspired by Saturn Bomberman and Neo Geo battle stages, featuring moving conveyor belts, warp doors, bouncing springs, and destructible ice blocks.",
    base: "mrboom",
    baseTitle: "Mr. Boom",
    path: "data/levels",
    website: "https://github.com/Javanaise/mrboom-libretro",
    repo: "Javanaise/mrboom-libretro",
    kind: "github-zip",
    size: 15,
    year: 2023,
    changes: "Adds 12 tournament-tested arena layouts with custom hazard tiles and interactive stage gimmicks.",
    summary: "Expanded stage pack featuring diverse obstacle types and dynamic sudden-death zones.",
    compat: "Mr. Boom all platforms",
    hint: "Select Custom Stages in the arena selection screen.",
    art: { from: "#059669", to: "#34d399", icon: "Grid" },
  }),
  m({
    slug: "mrboom-8player-controller-preset",
    title: "8-Player Party Gamepad & Joy-Con Layout",
    tagline: "Plug-and-play mapping profiles for 8 simultaneous Xbox, PlayStation, and Switch controllers.",
    desc: "Pre-calibrated multi-gamepad configuration profile designed for large living room gatherings. Seamlessly maps single Nintendo Switch Joy-Cons, DualShock 4, DualSense, Xbox Wireless, and 8BitDo gamepads without button conflicts.",
    base: "mrboom",
    baseTitle: "Mr. Boom",
    path: "config/controllers",
    website: "https://github.com/Javanaise/mrboom-libretro",
    repo: "Javanaise/mrboom-libretro",
    kind: "github-zip",
    size: 2,
    year: 2023,
    changes: "Auto-assigns up to 8 individual gamepads to player slots 1 through 8 with zero overlap.",
    summary: "Essential configuration file for hassle-free 8-player local couch tournaments.",
    compat: "DirectInput / XInput / SDL2",
    hint: "Copy to user configuration folder to enable instant 8-player controller detection.",
    art: { from: "#7c3aed", to: "#a78bfa", icon: "Sliders" },
  }),
];
