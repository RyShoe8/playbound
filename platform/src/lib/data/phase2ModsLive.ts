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

const teamfortress2Mods: ModSeed[] = [
  m({ slug: 'team-fortress-2-cfg', title: 'mastercoms cfg', tagline: 'Popular FPS configs.', desc: 'Popular FPS configs.', base: 'team-fortress-2', baseTitle: 'Team Fortress 2', path: 'external', website: 'https://github.com/mastercoms/mastercomfig', repo: 'mastercoms/mastercomfig', changes: 'Popular FPS configs.', summary: 'Popular FPS configs.' }),
  m({ slug: 'team-fortress-2-mastercomfig', title: 'mastercomfig releases', tagline: 'Performance config packs.', desc: 'mastercomfig GitHub release zips for FPS configs.', base: 'team-fortress-2', baseTitle: 'Team Fortress 2', path: 'tf/cfg', website: 'https://github.com/mastercoms/mastercomfig', repo: 'mastercoms/mastercomfig', pattern: '\\.zip$', size: 15, changes: 'Drop-in cfg presets.', summary: 'mastercomfig release packages.' }),
];
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
  gamebuddiesioMods
].flat();
