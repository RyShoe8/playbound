/**
 * Curated community league databases, retro pitch packs, and tactics expansions for YSoccer.
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
    developerSlug: d.developerSlug ?? "ysoccer-team",
    license: d.license ?? "GPL-3.0 / Open Source",
    releaseYear: d.year ?? 2023,
    sizeMB: d.size ?? 15,
    website: d.website,
    githubRepo: d.repo ?? null,
    downloadKind: kind,
    assetPattern: d.pattern ?? null,
    directUrl: d.direct ?? null,
    installRelativePath: d.path,
    compatibility: d.compat ?? "YSoccer all versions",
    platforms: d.platforms,
    installSteps: d.steps,
    summary: d.summary,
    changes: d.changes,
    installHint: d.hint,
    art: d.art,
  });
}

export const ysoccerMods: ModSeed[] = [
  m({
    slug: "ysoccer-classic-world-cup-pack",
    title: "Historic World Cup & Retro Club Roster Expansion (1970–2006)",
    tagline: "Over 60 legendary historical national and club squads with authentic kits and player skills.",
    desc: "A massive historical database expansion for YSoccer. Adds iconic World Cup squads—from Pele's 1970 Brazil and Maradona's 1986 Argentina to Zidane's 1998 France—alongside legendary European club sides with historically accurate kits, face styles, and skill ratings.",
    base: "ysoccer",
    baseTitle: "YSoccer",
    path: "data/teams",
    website: "https://ysoccer.sourceforge.io/",
    direct: "https://sourceforge.net/projects/ysoccer/files/teams/classic_world_cup_pack.zip/download",
    kind: "direct-zip",
    size: 20,
    year: 2023,
    changes: "Adds 64 historic national and club teams spanning international tournament history with accurate kits and rosters.",
    summary: "Essential retro database pack bringing legendary football eras to life in custom tournaments.",
    compat: "YSoccer v19+",
    hint: "Extract team JSON files into the data/teams folder in your YSoccer directory.",
    art: { from: "#15803d", to: "#84cc16", icon: "Trophy" },
  }),
  m({
    slug: "ysoccer-retro-stadiums-pitches",
    title: "Classic Amiga 16-Bit Pitch Surfaces & Dynamic Weather Remaster",
    tagline: "High-contrast checkerboard pitches, muddy winter turf, and custom stadium grass textures.",
    desc: "Revitalizes match presentation with authentic 16-bit pitch surfaces inspired by classic Amiga sports games. Features crisp cross-cut mowed patterns, heavy mud-trodden turf, and dynamic winter pitch textures that pair with rain and snow weather settings.",
    base: "ysoccer",
    baseTitle: "YSoccer",
    path: "data/pitches",
    website: "https://ysoccer.sourceforge.io/",
    direct: "https://sourceforge.net/projects/ysoccer/files/graphics/retro_pitches_pack.zip/download",
    kind: "direct-zip",
    size: 15,
    year: 2023,
    changes: "Remasters all standard pitch textures with classic checkerboard, diamond-cut, and weather-worn grass shaders.",
    summary: "Visual grass and stadium overhaul enhancing on-pitch contrast and ball visibility.",
    compat: "YSoccer v19+",
    hint: "Extract pitch graphics into data/pitches in your YSoccer directory.",
    art: { from: "#047857", to: "#10b981", icon: "Sparkles" },
  }),
  m({
    slug: "ysoccer-swos-tactics-suite",
    title: "Sensible World of Soccer Legendary Tactics & Custom Playbooks",
    tagline: "Over 25 classic SWOS formations including 4-3-3 Total Football, Catenaccio, and 3-5-2 Wingbacks.",
    desc: "Brings the tactical mastery of Sensible World of Soccer into YSoccer. Includes calibrated custom tactical presets that dictate intelligent off-the-ball AI runs, high-pressing defensive traps, and rapid counter-attacking wing overloads.",
    base: "ysoccer",
    baseTitle: "YSoccer",
    path: "data/tactics",
    website: "https://ysoccer.sourceforge.io/",
    direct: "https://sourceforge.net/projects/ysoccer/files/tactics/swos_tactics_suite.zip/download",
    kind: "direct-zip",
    size: 5,
    year: 2024,
    changes: "Adds 28 custom tactical formation files with specialized attacking and defensive zone assignments.",
    summary: "Comprehensive tactical playbook collection recreating iconic strategic systems in football history.",
    compat: "YSoccer v19+",
    hint: "Extract tactics files into data/tactics.",
    art: { from: "#1d4ed8", to: "#60a5fa", icon: "LayoutGrid" },
  }),
];
