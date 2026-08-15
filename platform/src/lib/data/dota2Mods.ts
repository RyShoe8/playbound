/**
 * Curated Steam Workshop custom games and Arcade mods for Dota 2.
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
    developerSlug: d.developerSlug ?? "valve",
    license: d.license ?? "Steam Workshop / Free",
    releaseYear: d.year ?? 2023,
    sizeMB: d.size ?? 50,
    website: d.website,
    githubRepo: d.repo ?? null,
    downloadKind: kind,
    assetPattern: d.pattern ?? null,
    directUrl: d.direct ?? null,
    installRelativePath: d.path,
    compatibility: d.compat ?? "Dota 2 Steam / Source 2 Arcade",
    platforms: d.platforms,
    installSteps: d.steps,
    summary: d.summary,
    changes: d.changes,
    installHint: d.hint,
    art: d.art,
  });
}

export const dota2Mods: ModSeed[] = [
  m({
    slug: "dota-auto-chess",
    title: "Dota Auto Chess",
    tagline: "The original 8-player tactical drafting auto-battler created by Drodo Studio.",
    desc: "The genre-defining custom game that spawned the auto-battler phenomenon. 8 players draft, upgrade, and position chess pieces (Dota heroes) on an 8x8 board, triggering class and species synergy buffs to survive waves of neutral monsters and player duels.",
    base: "dota-2",
    baseTitle: "Dota 2",
    path: "arcade/autochess",
    website: "https://steamcommunity.com/sharedfiles/filedetails/?id=1613886175",
    kind: "external",
    size: 250,
    year: 2019,
    changes: "Adds complete 8-player auto-battler drafting, economy management, and board combat systems.",
    summary: "The foundational auto-battler mod featuring hero synergies, courier economics, and round-based PvP rounds.",
    compat: "Dota 2 Arcade tab",
    hint: "Click Subscribe on Steam Workshop or launch directly from the in-game Arcade tab.",
    art: { from: "#854d0e", to: "#facc15", icon: "Grid" },
  }),
  m({
    slug: "dota-overthrow-3",
    title: "Overthrow 3.0",
    tagline: "Fast-paced multi-team arena brawler with Midas throne and item crates.",
    desc: "The community-maintained remaster of Valve's classic Overthrow arena game mode. Multiple teams (2v2v2v2, 3v3v3, 5v5v5, or Free For All) battle around the central Midas throne for XP/gold bonuses and falling item delivery crates in accelerated 15-minute brawls.",
    base: "dota-2",
    baseTitle: "Dota 2",
    path: "arcade/overthrow",
    website: "https://steamcommunity.com/sharedfiles/filedetails/?id=2882236302",
    kind: "external",
    size: 180,
    year: 2023,
    changes: "Multi-team arena brawler with central king-of-the-hill throne, bonus neutral drops, and accelerated kill objectives.",
    summary: "Instant-action teamfight brawler perfect for quick 15-minute matches without laning or farming phases.",
    compat: "Dota 2 Steam client",
    hint: "Launch from the in-game Arcade custom games lobby.",
    art: { from: "#991b1b", to: "#f87171", icon: "Swords" },
  }),
  m({
    slug: "dota-custom-hero-chaos",
    title: "Custom Hero Chaos",
    tagline: "Roguelike ability drafting arena with betting, wave defense, and PvP duels.",
    desc: "A massive custom game mode where players choose a base hero model and draft custom active/passive ability combinations across rounds. Players defend against increasingly difficult PvE creep waves, place bets on automated 1v1 duels, and fight to be the last survivor standing.",
    base: "dota-2",
    baseTitle: "Dota 2",
    path: "arcade/chc",
    website: "https://steamcommunity.com/sharedfiles/filedetails/?id=1841893245",
    kind: "external",
    size: 200,
    year: 2023,
    changes: "Adds random ability draft pools, PvE defense waves, duel gambling systems, and custom scaling items.",
    summary: "One of the most popular roguelike ability draft modes in the Dota 2 Arcade with endless build variety.",
    compat: "Dota 2 Arcade tab",
    hint: "Subscribe on Steam Workshop and select Custom Hero Chaos in the Arcade browser.",
    art: { from: "#581c87", to: "#a855f7", icon: "Sparkles" },
  }),
];
