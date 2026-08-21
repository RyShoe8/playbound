/**
 * Curated custom campaigns, level packs, and texture overhauls for KeeperFX.
 * 1-click install into KeeperFX campgns / levels directory.
 */
import { ghMod, type ModSeed } from "./modSeedHelpers";

const KEEPERFX_HINT =
  "Install via PlayBound 1-click directly into KeeperFX's campgns or levels directory, then select from the in-game Campaign menu.";

export const keeperfxMods: ModSeed[] = [
  ghMod({
    slug: "keeperfx-ancient-keeper",
    title: "Ancient Keeper Campaign Remake",
    tagline: "The legendary, brutal classic Keeper campaign remade with KeeperFX features.",
    description:
      "The definitive community expansion for Dungeon Keeper. Features 25 challenging levels that push your dungeon design, trap placement, spellcasting, and creature possession skills to the maximum.",
    baseGameSlug: "keeperfx",
    developerSlug: "indie-web",
    baseTitle: "KeeperFX",
    license: "Freeware / Community",
    releaseYear: 2020,
    sizeMB: 35,
    website: "https://github.com/dkfans/keeperfx",
    githubRepo: "dkfans/keeperfx",
    downloadKind: "github-zip",
    installRelativePath: "campgns/ancntkpr",
    art: { from: "#450a0a", to: "#991b1b", icon: "Skull" },
    summary:
      "Considered the gold standard of Dungeon Keeper custom campaigns with intricate puzzle maps, rival Keeper wars, and elite hero incursions.",
    changes:
      "Adds the 25-level Ancient Keeper campaign with custom voice lines, briefing scrolls, and unique victory objectives.",
    installHint: KEEPERFX_HINT,
  }),
  ghMod({
    slug: "keeperfx-japanese-campaign",
    title: "The Japanese Campaign (Dungeon Keeper Premium)",
    tagline: "Official Japan-exclusive 1998 campaign ported and remastered for KeeperFX.",
    description:
      "Originally released only in Japan as Dungeon Keeper Premium, this 20-level official expansion features creative subterranean layouts, difficult Lord of the Land encounters, and Japanese narration options.",
    baseGameSlug: "keeperfx",
    developerSlug: "indie-web",
    baseTitle: "KeeperFX",
    license: "Freeware / Community",
    releaseYear: 2019,
    sizeMB: 28,
    website: "https://github.com/dkfans/keeperfx",
    githubRepo: "dkfans/keeperfx",
    downloadKind: "github-zip",
    installRelativePath: "campgns/japanese",
    art: { from: "#312e81", to: "#4f46e5", icon: "Scroll" },
    summary:
      "Preserves the rare official Japanese release with full modern compatibility and high-resolution briefings.",
    changes:
      "Adds the complete 20-level Japanese campaign with remastered briefing audio and level scripts.",
    installHint: KEEPERFX_HINT,
  }),
  ghMod({
    slug: "keeperfx-heart-of-gold",
    title: "Heart of Gold Campaign",
    tagline: "Story-driven single-player campaign centered around gold extraction and greed.",
    description:
      "A 15-scenario narrative campaign that pits your dungeon against gold-hungry dwarven miners, mercenary rival Keepers, and treacherous underground catacombs.",
    baseGameSlug: "keeperfx",
    developerSlug: "indie-web",
    baseTitle: "KeeperFX",
    license: "Freeware / Community",
    releaseYear: 2021,
    sizeMB: 24,
    website: "https://github.com/dkfans/keeperfx",
    githubRepo: "dkfans/keeperfx",
    downloadKind: "github-zip",
    installRelativePath: "campgns/heartgold",
    art: { from: "#713f12", to: "#eab308", icon: "Coins" },
    summary:
      "Rich economic and combat campaign introducing new custom level objectives and unique trap synergies.",
    changes:
      "Adds the 15-level Heart of Gold campaign with custom script events, dwarf fortress assaults, and boss encounters.",
    installHint: KEEPERFX_HINT,
  }),
  ghMod({
    slug: "keeperfx-creature-quest",
    title: "Creature Quest Campaign",
    tagline: "RPG-style campaign focusing on individual creature progression and possession.",
    description:
      "A unique campaign emphasizing creature possession mode. Control a single Horned Reaper, Vampire, or Mistress navigating hazardous trap corridors and hero fortresses.",
    baseGameSlug: "keeperfx",
    developerSlug: "indie-web",
    baseTitle: "KeeperFX",
    license: "Freeware / Community",
    releaseYear: 2022,
    sizeMB: 20,
    website: "https://github.com/dkfans/keeperfx",
    githubRepo: "dkfans/keeperfx",
    downloadKind: "github-zip",
    installRelativePath: "campgns/crtrqst",
    art: { from: "#3b0764", to: "#9333ea", icon: "Eye" },
    summary:
      "Action-RPG inspired dungeon exploration requiring direct first-person creature control and tactical spell management.",
    changes:
      "Adds 12 first-person possession scenarios with custom enemy patrol AI and hero stronghold dungeons.",
    installHint: KEEPERFX_HINT,
  }),
  ghMod({
    slug: "keeperfx-hd-sprite-overhaul",
    title: "KeeperFX HD Sprite & Creature Pack",
    tagline: "High-definition upscaled creature sprites and dungeon tile textures.",
    description:
      "Remasters the original 1997 sprites with clean high-resolution renders, enhanced room floor tiles (Treasure Room, Torture Chamber, Library), and smoother spell particle animations.",
    baseGameSlug: "keeperfx",
    developerSlug: "indie-web",
    baseTitle: "KeeperFX",
    license: "Freeware / Community",
    releaseYear: 2023,
    sizeMB: 65,
    website: "https://github.com/dkfans/keeperfx",
    githubRepo: "dkfans/keeperfx",
    downloadKind: "github-zip",
    installRelativePath: "fxdata/hd_sprites",
    art: { from: "#1c1917", to: "#78716c", icon: "Sparkles" },
    summary:
      "Modern visual upgrade bringing crisp creature animations and room textures to high-resolution monitors.",
    changes:
      "Replaces creature, room, and trap sprite sheets with HD remastered graphics while maintaining classic art direction.",
    installHint: "PlayBound extracts this HD pack directly into KeeperFX's fxdata folder.",
  }),
];
