/**
 * Phase 2 live-service / classic / community hubs (~16–18 each; mostly external).
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

const everquestMods: ModSeed[] = [
];

const starwarsgalaxiesMods: ModSeed[] = [
];

const starcraftMods: ModSeed[] = [
  m({ slug: 'starcraft-bw-api', title: 'BWAPI', tagline: 'AI research API (advanced).', desc: 'AI research API (advanced).', base: 'starcraft', baseTitle: 'StarCraft', path: 'maps', website: 'https://github.com/bwapi/bwapi', repo: 'bwapi/bwapi', changes: 'AI research API (advanced).', summary: 'AI research API (advanced).' }),
  m({ slug: 'starcraft-openbw', title: 'OpenBW', tagline: 'Open replays research.', desc: 'Open replays research.', base: 'starcraft', baseTitle: 'StarCraft', path: 'maps', website: 'https://github.com/OpenBW/openbw', repo: 'OpenBW/openbw', changes: 'Open replays research.', summary: 'Open replays research.' }),
];

const diablo2Mods: ModSeed[] = [
  m({ slug: 'diablo-2-filter', title: 'Loot filter hubs', tagline: 'Filter discussions and packs.', desc: 'Filter discussions and packs.', base: 'diablo-2', baseTitle: 'Diablo II', path: 'external', website: 'https://github.com/ThoughtfulDev/LootFilter', kind: 'external', changes: 'Filter discussions and packs.', summary: 'Filter discussions and packs.' }),
];

const wolfensteinMods: ModSeed[] = [
  m({ slug: 'wolfenstein-ecwolf-gh', title: 'ECWolf GitHub', tagline: 'Source and releases.', desc: 'Source and releases.', base: 'wolfenstein', baseTitle: 'Wolfenstein', path: 'mods', website: 'https://github.com/ECWolfEngine/ECWolf', repo: 'ECWolfEngine/ECWolf', changes: 'Source and releases.', summary: 'Source and releases.' }),
  m({ slug: 'wolfenstein-sdl', title: 'Wolf4SDL', tagline: 'Alternate port lineage.', desc: 'Alternate port lineage.', base: 'wolfenstein', baseTitle: 'Wolfenstein', path: 'mods', website: 'https://github.com/LinuxDoom/Wolf4SDL', kind: 'external', changes: 'Alternate port lineage.', summary: 'Alternate port lineage.' }),
];

const warthunderMods: ModSeed[] = [
];

const worldoftanksMods: ModSeed[] = [
];

const apexlegendsMods: ModSeed[] = [
];

const hearthstoneMods: ModSeed[] = [
  m({ slug: 'hearthstone-firestone', title: 'Firestone', tagline: 'Overlay tracker (policy check).', desc: 'Overlay tracker (policy check).', base: 'hearthstone', baseTitle: 'Hearthstone', path: 'external', website: 'https://github.com/Zero-to-Heroes/firestone', repo: 'Zero-to-Heroes/firestone', changes: 'Overlay tracker (policy check).', summary: 'Overlay tracker (policy check).' }),
];

const teamfortress2Mods: ModSeed[] = [];
const genshinimpactMods: ModSeed[] = [
];

const dota2Mods: ModSeed[] = [
];

const leagueoflegendsMods: ModSeed[] = [
];

const valorantMods: ModSeed[] = [
];

const counterstrike2Mods: ModSeed[] = [
];

const quakechampionsMods: ModSeed[] = [
];

const pixrevealMods: ModSeed[] = [
];

const gamebuddiesioMods: ModSeed[] = [
];

const holocureMods: ModSeed[] = [
  m({
    slug: "holocure-multiplayer",
    title: "HoloCure Multiplayer",
    tagline: "Online co-op multiplayer mod for HoloCure.",
    desc: "Community multiplayer modification that enables online co-op sessions, custom lobbies, and synchronized wave survival in HoloCure.",
    base: "holocure",
    baseTitle: "HoloCure - Save the Fans!",
    path: "mods",
    website: "https://github.com/Kay-Yu-Mods/HoloCure-Multiplayer",
    repo: "Kay-Yu-Mods/HoloCure-Multiplayer",
    kind: "github-zip",
    pattern: ".*\\.zip$",
    size: 25,
    year: 2024,
    changes: "Enables online multiplayer lobbies, peer-to-peer co-op combat, and shared wave progression.",
    summary: "Brings co-op multiplayer to HoloCure with support for online lobbies and synchronized combat.",
    hint: "Use PlayBound Launcher or PlayBound Edition to automatically configure the multiplayer mod into your HoloCure installation.",
  }),
  m({
    slug: "holocure-sandbox",
    title: "HoloCure Sandbox Mode",
    tagline: "Full testing sandbox for custom spawns, weapons, and builds.",
    desc: "Enables an in-game sandbox menu to test character abilities, spawn arbitrary enemy waves or bosses, instantly max out weapon collabs, and benchmark build synergies.",
    base: "holocure",
    baseTitle: "HoloCure - Save the Fans!",
    path: "mods",
    website: "https://github.com/Kay-Yu-Mods/HoloCure-Sandbox",
    repo: "Kay-Yu-Mods/HoloCure-Sandbox",
    kind: "github-zip",
    pattern: ".*\\.zip$",
    size: 15,
    year: 2024,
    changes: "Adds in-game developer/sandbox panel with spawn controls, god mode toggle, and item grant menus.",
    summary: "Allows instant experimentation with any weapon, item, stamp, or character build.",
    hint: "Toggle the sandbox menu in-game to access developer spawn tools and custom build testing.",
  }),
  m({
    slug: "holocure-character-pack",
    title: "Community Character Expansion",
    tagline: "Adds custom community-created idols with unique skill kits.",
    desc: "Expands the playable roster with community-created characters, featuring custom pixel animations, bespoke signature weapons, three tailored passive skills, and animated Special Attacks.",
    base: "holocure",
    baseTitle: "HoloCure - Save the Fans!",
    path: "mods",
    website: "https://github.com/Kay-Yu-Mods/HoloCure-Character-Creator",
    repo: "Kay-Yu-Mods/HoloCure-Character-Creator",
    kind: "github-zip",
    pattern: ".*\\.zip$",
    size: 35,
    year: 2024,
    changes: "Adds custom character loader supporting additional idol roster slots and custom sprite sheets.",
    summary: "Unlocks additional community-created idol characters with custom movesets.",
    hint: "Access the character selection screen to pick from the expanded community idol roster.",
  }),
  m({
    slug: "holocure-rich-presence",
    title: "Discord Rich Presence",
    tagline: "Real-time Discord status showing idol, stage, and co-op.",
    desc: "Broadcasts active HoloCure run details to Discord, displaying current character portrait, stage name, elapsed survival time, and multiplayer lobby status.",
    base: "holocure",
    baseTitle: "HoloCure - Save the Fans!",
    path: "mods",
    website: "https://github.com/Kay-Yu-Mods/HoloCure-Discord-RPC",
    repo: "Kay-Yu-Mods/HoloCure-Discord-RPC",
    kind: "github-zip",
    pattern: ".*\\.zip$",
    size: 5,
    year: 2024,
    changes: "Connects game lifecycle to Discord Rich Presence for live profile status updates.",
    summary: "Shows your live HoloCure run and co-op details on your Discord profile.",
    hint: "Make sure Discord is running on your PC before launching HoloCure.",
  }),
  m({
    slug: "holocure-qol-toolkit",
    title: "HoloCure QoL Toolkit",
    tagline: "Random character picker, quick restart, and UI tweaks.",
    desc: "Quality-of-life additions including a Random Character button on the select screen, instant stage restart keybinds, and streamlined shop navigation.",
    base: "holocure",
    baseTitle: "HoloCure - Save the Fans!",
    path: "mods",
    website: "https://github.com/Kay-Yu-Mods/HoloCure-QoL",
    repo: "Kay-Yu-Mods/HoloCure-QoL",
    kind: "github-zip",
    pattern: ".*\\.zip$",
    size: 8,
    year: 2024,
    changes: "Adds random character button, quick restart hotkeys, and performance optimizations.",
    summary: "Helpful quality-of-life enhancements for character selection and run management.",
    hint: "Press 'R' on keyboard or Select on controller on the pause screen to quickly restart.",
  }),
];

export const phase2ModsLive: ModSeed[] = [
  everquestMods,
  starwarsgalaxiesMods,
  starcraftMods,
  diablo2Mods,
  wolfensteinMods,
  warthunderMods,
  worldoftanksMods,
  apexlegendsMods,
  hearthstoneMods,
  teamfortress2Mods,
  genshinimpactMods,
  dota2Mods,
  leagueoflegendsMods,
  valorantMods,
  counterstrike2Mods,
  quakechampionsMods,
  pixrevealMods,
  gamebuddiesioMods,
  holocureMods,
].flat();

