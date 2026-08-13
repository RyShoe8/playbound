/**
 * Phase 2 remaster / FOSS catch-up mods (~16–18 per base).
 */
import { ghMod, type ModSeed } from "./modSeedHelpers";

type Def = {
  slug: string;
  title: string;
  tagline: string;
  desc: string;
  base: string;
  baseTitle: string;
  path: string;
  website: string;
  repo?: string;
  kind?: "github-zip" | "direct-zip" | "external";
  pattern?: string;
  size?: number;
  year?: number;
  changes: string;
  summary: string;
  hint?: string;
};

function m(d: Def): ModSeed {
  const kind = d.kind ?? (d.repo ? "github-zip" : "external");
  return ghMod({
    slug: d.slug,
    title: d.title,
    tagline: d.tagline,
    description: d.desc,
    baseGameSlug: d.base,
    baseTitle: d.baseTitle,
    developerSlug: "indie-web",
    license: "Community / External hub",
    releaseYear: d.year ?? 2024,
    sizeMB: d.size ?? 40,
    website: d.website,
    githubRepo: d.repo ?? null,
    downloadKind: kind,
    assetPattern: kind === "github-zip" ? d.pattern ?? "\\.zip$" : null,
    installRelativePath: d.path,
    art: { from: "#1e293b", to: "#64748b", icon: "Package" },
    summary: d.summary,
    changes: d.changes,
    installHint: d.hint,
  });
}

const freecivMods: ModSeed[] = [
  m({ slug: 'freeciv-civ2civ3-earth', title: 'Civ2Civ3 Earth', tagline: 'Earth-tuned Civ2Civ3 ruleset.', desc: 'Fork of civ2civ3 optimized for Earth maps with amplio_earth tiles.', base: 'freeciv', baseTitle: 'Freeciv', path: 'data', website: 'https://github.com/dftec-es/civ2civ3_earth', repo: 'dftec-es/civ2civ3_earth', size: 80, changes: 'Earth map balance and tilesets.', summary: 'Earth-tuned Civ2Civ3 ruleset pack.' }),
  m({ slug: 'freeciv-ampliolt', title: 'AmplioLT tileset', tagline: 'Longturn-tuned Amplio tiles.', desc: 'Isosquare tileset tweaks popular on Longturn.net.', base: 'freeciv', baseTitle: 'Freeciv', path: 'data', website: 'https://github.com/daavko/amplioLT', repo: 'daavko/amplioLT', size: 60, changes: 'Clearer units and HP bars.', summary: 'Amplio variant for Longturn play.' }),
];

const flightgearMods: ModSeed[] = [
  m({ slug: 'flightgear-c172p', title: 'Cessna 172P', tagline: 'Detailed C172 training aircraft.', desc: 'Detailed C172 training aircraft.', base: 'flightgear', baseTitle: 'FlightGear', path: 'Aircraft', website: 'https://github.com/c172p-team/c172p', repo: 'c172p-team/c172p', changes: 'Training workhorse.', summary: 'Detailed C172 training aircraft.' }),
];

const freedoomMods: ModSeed[] = [
  m({ slug: 'freedoom-dsda', title: 'DSDA-Doom', tagline: 'Recommended source port.', desc: 'Recommended source port.', base: 'freedoom', baseTitle: 'Freedoom', path: 'mods', website: 'https://github.com/kraflab/dsda-doom', repo: 'kraflab/dsda-doom', changes: 'Play Freedoom WADs.', summary: 'Recommended source port.' }),
  m({ slug: 'freedoom-gzdoom', title: 'GZDoom', tagline: 'Feature-rich Doom port.', desc: 'Feature-rich Doom port.', base: 'freedoom', baseTitle: 'Freedoom', path: 'mods', website: 'https://github.com/ZDoom/gzdoom', repo: 'ZDoom/gzdoom', changes: 'Hardware renderer.', summary: 'Feature-rich Doom port.' }),
  m({ slug: 'freedoom-brutal', title: 'Brutal Doom hub', tagline: 'Popular gameplay overhaul (external).', desc: 'Popular gameplay overhaul (external).', base: 'freedoom', baseTitle: 'Freedoom', path: 'mods', website: 'https://www.moddb.com/mods/brutal-doom', kind: 'external', changes: 'Action overhaul.', summary: 'Popular gameplay overhaul (external).' }),
  m({ slug: 'freedoom-obaddon', title: 'ObAddon', tagline: 'Procedural map addons.', desc: 'Procedural map addons.', base: 'freedoom', baseTitle: 'Freedoom', path: 'mods', website: 'https://github.com/caligari87/ObAddon', repo: 'caligari87/ObAddon', changes: 'Endless layouts.', summary: 'Procedural map addons.' }),
  m({ slug: 'freedoom-launcher', title: 'Doom Launcher', tagline: 'WAD organizer tool.', desc: 'WAD organizer tool.', base: 'freedoom', baseTitle: 'Freedoom', path: 'mods', website: 'https://github.com/nickpasquale89/DoomLauncher', kind: 'external', changes: 'Manage PWAD sets.', summary: 'WAD organizer tool.' }),
];

const lincityMods: ModSeed[] = [
];

const tesArenaMods: ModSeed[] = [
  m({ slug: 'tes-arena-dosbox', title: 'DOSBox Staging', tagline: 'Run classic Arena in DOSBox.', desc: 'Run classic Arena in DOSBox.', base: 'tes-arena', baseTitle: 'The Elder Scrolls: Arena', path: 'mods', website: 'https://github.com/dosbox-staging/dosbox-staging', repo: 'dosbox-staging/dosbox-staging', changes: 'DOS emulator.', summary: 'Run classic Arena in DOSBox.' }),
];

/** Quake III–style FPS — not related to Elder Scrolls: Arena. */
const openarenaMods: ModSeed[] = [
];

const daggerfallMods: ModSeed[] = [
];

/** OpenCiv3 (C7) — early remake; ecosystem hubs + tools more than total-conversion mods. */
const openciv3Mods: ModSeed[] = [
];

export const phase2ModsRemasters: ModSeed[] = [
  freecivMods,
  flightgearMods,
  freedoomMods,
  lincityMods,
  tesArenaMods,
  openarenaMods,
  daggerfallMods,
  openciv3Mods,
].flat();
