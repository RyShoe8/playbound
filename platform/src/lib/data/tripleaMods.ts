/**
 * Curated scenarios, map expansions, and rulesets for TripleA.
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
    developerSlug: d.developerSlug ?? "triplea-team",
    license: d.license ?? "Open Source (GPL-3.0)",
    releaseYear: d.year ?? 2023,
    sizeMB: d.size ?? 25,
    website: d.website,
    githubRepo: d.repo ?? null,
    downloadKind: kind,
    assetPattern: d.pattern ?? null,
    directUrl: d.direct ?? null,
    installRelativePath: d.path,
    compatibility: d.compat ?? "TripleA v2.5+",
    platforms: d.platforms,
    installSteps: d.steps,
    summary: d.summary,
    changes: d.changes,
    installHint: d.hint,
    art: d.art,
  });
}

export const tripleaMods: ModSeed[] = [
  m({
    slug: "triplea-wwii-global-1940",
    title: "World War II Global 1940 Scenario",
    tagline: "The monumental full-scale global WWII grand strategy scenario uniting Europe and Pacific theaters.",
    desc: "The definitive grand strategic World War II scenario for TripleA. Faithfully adapts the Axis & Allies Global 1940 2nd Edition ruleset with complete historical orders of battle, national objective bonuses, political declarations of war, and convoy sea zone interdiction across the entire globe.",
    base: "triplea",
    baseTitle: "TripleA",
    path: "downloadedMaps/world_war_ii_global",
    website: "https://triplea-game.org/maps-list/maps/",
    repo: "triplea-game/triplea",
    kind: "github-zip",
    size: 40,
    year: 2023,
    changes: "Full global theater map with updated unit reliefs, research tech trees, and national victory conditions.",
    summary: "The flagship TripleA grand strategy scenario featuring all major Axis, Allied, and Comintern powers.",
    compat: "TripleA all versions",
    hint: "Install via the in-game 'Download Maps' menu or extract into the downloadedMaps folder.",
    art: { from: "#78350f", to: "#f59e0b", icon: "Compass" },
  }),
  m({
    slug: "triplea-great-war-1914",
    title: "The Great War 1914 Scenario",
    tagline: "World War I grand wargame featuring trench warfare, zeppelins, and dreadnoughts.",
    desc: "A massive, meticulously balanced World War I scenario. Experience bloody European trench stalemates, unrestricted submarine warfare, naval dreadnought clashes in the North Sea, and Ottoman desert campaigns across the Middle East with custom 1914 unit stats.",
    base: "triplea",
    baseTitle: "TripleA",
    path: "downloadedMaps/the_great_war",
    website: "https://triplea-game.org/maps-list/maps/",
    repo: "triplea-game/triplea",
    kind: "github-zip",
    size: 30,
    year: 2023,
    changes: "Custom WWI combat mechanics including artillery barrage defense, trench fortifications, and gas warfare.",
    summary: "Authentic World War I simulation with custom economic models and multi-front tactical stalemates.",
    compat: "TripleA all versions",
    hint: "Select The Great War 1914 in the game selection screen.",
    art: { from: "#374151", to: "#9ca3af", icon: "Shield" },
  }),
  m({
    slug: "triplea-middle-earth",
    title: "War of the Ring: Middle-Earth Scenario",
    tagline: "Epic high-fantasy grand strategy campaign across Tolkien's Middle-Earth.",
    desc: "A sprawling fantasy scenario where the Free Peoples of Middle-Earth (Gondor, Rohan, Elves, Dwarves) clash against the shadow legions of Sauron and Saruman (Mordor, Isengard, Harad, Easterlings). Features siege engines, oliphaunts, Nazgûl, and fellowship mechanics.",
    base: "triplea",
    baseTitle: "TripleA",
    path: "downloadedMaps/middle_earth",
    website: "https://triplea-game.org/maps-list/maps/",
    repo: "triplea-game/triplea",
    kind: "github-zip",
    size: 35,
    year: 2023,
    changes: "Custom high-fantasy map relief, mythical creature unit types, and unique hero unit abilities.",
    summary: "Complete fantasy total war conversion bringing the War of the Ring to the TripleA engine.",
    compat: "TripleA all versions",
    hint: "Download from the in-game map browser or place in downloadedMaps/ directory.",
    art: { from: "#065f46", to: "#34d399", icon: "Sparkles" },
  }),
];
