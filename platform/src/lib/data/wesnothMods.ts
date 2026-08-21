/**
 * Curated add-ons and campaigns for The Battle for Wesnoth.
 * Available via Wesnoth Add-on Server API / in-game manager and GitHub releases.
 */
import { ghMod, type ModSeed } from "./modSeedHelpers";

const WESNOTH_HINT =
  "Install directly via 1-click launcher extraction or inside Wesnoth via Main Menu → Add-ons → Connect.";

export const wesnothMods: ModSeed[] = [
  ghMod({
    slug: "wesnoth-invasion-from-the-unknown",
    title: "Invasion from the Unknown",
    tagline: "Epic story campaign with bespoke unit lines and custom soundtrack.",
    description:
      "A flagship community campaign set generations after the Golden Age of Wesnoth. Features unique unit advancements, original portraits, custom terrain sprites, and an orchestral soundtrack.",
    baseGameSlug: "battle-for-wesnoth",
    developerSlug: "wesnoth-project",
    baseTitle: "The Battle for Wesnoth",
    license: "GPL-2.0-or-later",
    releaseYear: 2006,
    sizeMB: 48,
    website: "https://github.com/project-ethea/Invasion_from_the_Unknown",
    githubRepo: "project-ethea/Invasion_from_the_Unknown",
    downloadKind: "external",
    installRelativePath: "data/add-ons/Invasion_from_the_Unknown",
    art: { from: "#1e1b4b", to: "#4338ca", icon: "ShieldAlert" },
    summary:
      "Iris Morelle's campaign is one of the most celebrated Wesnoth sagas, fully updated for Wesnoth 1.18 with complete tactical scenarios.",
    changes:
      "Adds a full multi-chapter single-player campaign, new unit lines, custom terrain textures, and original musical tracks.",
    installHint: WESNOTH_HINT,
  }),
  ghMod({
    slug: "wesnoth-after-the-storm",
    title: "After the Storm",
    tagline: "Direct three-episode sequel to Invasion from the Unknown.",
    description:
      "The epic continuation of Invasion from the Unknown. Spans three full episodes with custom factions, new characters, cinematic story cutscenes, and challenging tactical boss battles.",
    baseGameSlug: "battle-for-wesnoth",
    developerSlug: "wesnoth-project",
    baseTitle: "The Battle for Wesnoth",
    license: "GPL-2.0-or-later",
    releaseYear: 2008,
    sizeMB: 65,
    website: "https://github.com/project-ethea/After_the_Storm",
    githubRepo: "project-ethea/After_the_Storm",
    downloadKind: "external",
    installRelativePath: "data/add-ons/After_the_Storm",
    art: { from: "#311042", to: "#701a75", icon: "Flame" },
    summary:
      "Continuation of the Ethea saga spanning three full episodes with dozens of challenging scenarios and custom unit trees.",
    changes:
      "Adds 30+ story scenarios across three distinct episodes, custom Shaxthal and Chaos factions, and original orchestral music.",
    installHint: WESNOTH_HINT,
  }),
  ghMod({
    slug: "wesnoth-legend-of-the-invincibles",
    title: "Legend of the Invincibles",
    tagline: "Massive 200-scenario RPG campaign with item loot and skill trees.",
    description:
      "The largest single-player campaign ever made for Wesnoth: 200 scenarios across two massive parts, layering an extensive RPG item drop, equipment socketing, and character skill tree system.",
    baseGameSlug: "battle-for-wesnoth",
    developerSlug: "wesnoth-project",
    baseTitle: "The Battle for Wesnoth",
    license: "GPL-3.0-only",
    releaseYear: 2016,
    sizeMB: 55,
    website: "https://github.com/Dugy/Legend_of_the_Invincibles",
    githubRepo: "Dugy/Legend_of_the_Invincibles",
    downloadKind: "external",
    installRelativePath: "data/add-ons/Legend_of_the_Invincibles",
    art: { from: "#0f172a", to: "#3b82f6", icon: "Swords" },
    summary:
      "Legend of the Invincibles turns Wesnoth into a sprawling tactical RPG with over two hundred scenarios and deep equipment crafting.",
    changes:
      "Adds a 200-scenario campaign, hundreds of equippable weapons and armor, recipe crafting, and unlimited unit advancement paths.",
    installHint: WESNOTH_HINT,
  }),
  ghMod({
    slug: "wesnoth-era-of-magic",
    title: "Era of Magic",
    tagline: "Complete faction overhaul with high-fantasy spellcasters and summons.",
    description:
      "A premier multiplayer and skirmish era overhaul introducing 8 completely new factions (Kharos, Runemasters, Tharis, Al-Kamija, Sky Kingdom, Barbarians, Dark Blood Tribe, Windsong) with hundreds of custom animations.",
    baseGameSlug: "battle-for-wesnoth",
    developerSlug: "wesnoth-project",
    baseTitle: "The Battle for Wesnoth",
    license: "GPL-2.0-or-later",
    releaseYear: 2009,
    sizeMB: 78,
    website: "https://github.com/inferno8/Era_of_Magic",
    githubRepo: "inferno8/Era_of_Magic",
    downloadKind: "external",
    installRelativePath: "data/add-ons/Era_of_Magic",
    art: { from: "#1c1917", to: "#d97706", icon: "Wand2" },
    summary:
      "Inferno8's visual and mechanical masterpiece brings 8 high-magic factions with spectacular animated spell effects to Wesnoth.",
    changes:
      "Adds 8 complete factions with hundreds of unique animated unit sprites, magical abilities, teleportation, and summoner mechanics.",
    installHint: WESNOTH_HINT,
  }),
  ghMod({
    slug: "wesnoth-to-lands-unknown",
    title: "To Lands Unknown",
    tagline: "Story campaign set in the Era of Magic universe with cinematic battles.",
    description:
      "A cinematic story campaign set in the Era of Magic universe. Follow Mehir through desert lands and mystical dimensions with animated cutscenes and custom tactical objectives.",
    baseGameSlug: "battle-for-wesnoth",
    developerSlug: "wesnoth-project",
    baseTitle: "The Battle for Wesnoth",
    license: "GPL-2.0-or-later",
    releaseYear: 2011,
    sizeMB: 62,
    website: "https://github.com/inferno8/To_Lands_Unknown",
    githubRepo: "inferno8/To_Lands_Unknown",
    downloadKind: "external",
    installRelativePath: "data/add-ons/To_Lands_Unknown",
    art: { from: "#451a03", to: "#b45309", icon: "Compass" },
    summary:
      "Story-driven desert campaign utilizing the Era of Magic engine with richly animated cutscenes and grand boss encounters.",
    changes:
      "Adds a full single-player campaign with animated dialogue scenes, custom desert terrain, and boss fight mechanics.",
    installHint: WESNOTH_HINT,
  }),
  ghMod({
    slug: "wesnoth-ageless-era",
    title: "Ageless Era",
    tagline: "The definitive multiplayer era mega-pack with dozens of factions.",
    description:
      "The largest faction compilation in Wesnoth history. Combines over 50 community eras and factions into a single balanced multiplayer and skirmish package with thousands of units.",
    baseGameSlug: "battle-for-wesnoth",
    developerSlug: "wesnoth-project",
    baseTitle: "The Battle for Wesnoth",
    license: "GPL-2.0-or-later",
    releaseYear: 2010,
    sizeMB: 120,
    website: "https://github.com/Ageless-Era/Ageless_Era",
    githubRepo: "Ageless-Era/Ageless_Era",
    downloadKind: "external",
    installRelativePath: "data/add-ons/Ageless_Era",
    art: { from: "#064e3b", to: "#059669", icon: "Users" },
    summary:
      "The definitive Wesnoth multiplayer compilation bundling virtually every community-created faction into one unified era.",
    changes:
      "Adds over 50 custom factions, hundreds of unit progression lines, and custom balance profiles for competitive and casual multiplayer.",
    installHint: WESNOTH_HINT,
  }),
  ghMod({
    slug: "wesnoth-survival-extreme",
    title: "Survival Extreme",
    tagline: "Wave-defense cooperative multiplayer maps with intense boss rushes.",
    description:
      "A thrilling co-op survival mode where up to 4 players build fortifications, recruit defensive lines, and withstand relentless waves of enemy monsters and end-level bosses.",
    baseGameSlug: "battle-for-wesnoth",
    developerSlug: "wesnoth-project",
    baseTitle: "The Battle for Wesnoth",
    license: "GPL-2.0-or-later",
    releaseYear: 2012,
    sizeMB: 8,
    website: "https://github.com/wesnoth/wesnoth",
    githubRepo: "wesnoth/wesnoth",
    downloadKind: "external",
    installRelativePath: "data/add-ons/Survival_Extreme",
    art: { from: "#7f1d1d", to: "#dc2626", icon: "Castle" },
    summary:
      "Classic 1-4 player co-op wave survival map pack featuring customizable difficulty tiers, boss modifiers, and team gold sharing.",
    changes:
      "Adds cooperative wave defense scenarios with automated enemy spawn waves, bonus gold rewards, and escalating boss encounters.",
    installHint: WESNOTH_HINT,
  }),
  ghMod({
    slug: "wesnoth-orocia",
    title: "Orocia Multiplayer Survival",
    tagline: "Fast-paced circular arena co-op survival map.",
    description:
      "The most played cooperative survival map in Wesnoth multiplayer history. Defend the central keep against converging forces from all four directions.",
    baseGameSlug: "battle-for-wesnoth",
    developerSlug: "wesnoth-project",
    baseTitle: "The Battle for Wesnoth",
    license: "GPL-2.0-or-later",
    releaseYear: 2008,
    sizeMB: 4,
    website: "https://github.com/wesnoth/wesnoth",
    githubRepo: "wesnoth/wesnoth",
    downloadKind: "external",
    installRelativePath: "data/add-ons/Orocia",
    art: { from: "#14532d", to: "#22c55e", icon: "Crosshair" },
    summary:
      "Fast, intense 4-player co-op battleground where players must coordinate hero placement to prevent hordes from breaching the center.",
    changes:
      "Adds the iconic Orocia survival arena with dynamic round modifiers, scaling unit strengths, and quick restart options.",
    installHint: WESNOTH_HINT,
  }),
];
