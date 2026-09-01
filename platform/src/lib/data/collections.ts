import type { Collection } from "./types";

/** Editorial collections curated by PlayBound — groupings of real catalog games. */
export const collections: Collection[] = [
  {
    slug: "best-party-games",
    title: "Best Free Party Games",
    description:
      "Bring the crowd, plug in the gamepads, and start the chaos. The best pick-up-and-play multiplayer games for friends, game nights, and local party sessions.",
    gameSlugs: ["mrboom", "brawlhalla", "supertuxkart", "hedgewars", "strikers-club", "ysoccer"],
  },
  {
    slug: "best-sports-and-racing",
    title: "Best Free Sports & Racing Games",
    description:
      "From lightning-fast arcade rally tracks to 11v11 pitch tactics and aftertouch curve screamers — the finest free sports and racing games on PC.",
    gameSlugs: ["strikers-club", "ysoccer", "trigger-rally", "supertuxkart"],
  },
  {
    slug: "competitive-arenas-and-mobas",
    title: "Competitive Arenas & MOBAs",
    description:
      "High-skill ceilings, intense ranked matchmaking, and dedicated esports circuits. Free-to-play competitive combat at the highest tier.",
    gameSlugs: ["dota-2", "league-of-legends", "brawlhalla", "quake-champions", "xonotic"],
  },
  {
    slug: "space-flight-and-sci-fi",
    title: "Space Flight & Sci-Fi Simulators",
    description:
      "Engage warp drives, trade across frontier sectors, and command capital fleets in deep space with zero subscription fees.",
    gameSlugs: ["privateer-gemini-gold", "microsoft-allegiance", "endless-sky", "naev"],
  },
  {
    slug: "grand-strategy-and-tactics",
    title: "Grand Strategy & Turn-Based Tactics",
    description:
      "Deep strategic planning, calculated turns, and global conquest. Rule empires and command armies at your own pace.",
    gameSlugs: ["triplea", "battle-for-wesnoth", "0ad", "mindustry"],
  },
  {
    slug: "best-rts-games",
    title: "Best Free RTS Games",
    description:
      "Command, conquer, and never pay a cent. The finest real-time strategy the free world has to offer, from thousand-unit slugfests to classic base-building.",
    gameSlugs: ["openra", "beyond-all-reason", "0ad", "zero-k", "warzone-2100", "triplea", "microsoft-allegiance"],
  },
  {
    slug: "lan-party-favorites",
    title: "LAN Party Favorites",
    description:
      "Dust off the ethernet switch. These games were born for a room full of friends, pizza boxes, and trash talk.",
    gameSlugs: ["xonotic", "supertuxkart", "openra", "hedgewars", "openttd", "mrboom", "brawlhalla", "strikers-club", "ysoccer"],
  },
  {
    slug: "games-under-500mb",
    title: "Games Under 500MB",
    description:
      "Big fun, small footprint. Every game here downloads in minutes on any connection and fits on the oldest laptop in the house.",
    gameSlugs: ["mindustry", "openttd", "shattered-pixel-dungeon", "hedgewars", "luanti", "endless-sky", "naev", "supertux", "trigger-rally", "mrboom", "gradius-remake", "ysoccer"],
  },
  {
    slug: "best-couch-coop",
    title: "Best Couch Co-op",
    description: "One screen, many controllers, guaranteed arguments. The best free games for playing side by side.",
    gameSlugs: ["supertuxkart", "hedgewars", "supertux", "mrboom", "brawlhalla", "ysoccer"],
  },
  {
    slug: "hidden-gems",
    title: "Hidden Gems",
    description:
      "Criminally underplayed. Each of these deserves ten times its player count — get in before everyone else does.",
    gameSlugs: ["endless-sky", "zero-k", "naev", "warzone-2100", "unvanquished", "privateer-gemini-gold", "gradius-remake", "microsoft-allegiance", "trigger-rally", "ysoccer"],
  },
  {
    slug: "games-like-age-of-empires",
    title: "Games Like Age of Empires",
    description: "Missing the villager hum? These free RTS games scratch the civilization-building, army-massing itch.",
    gameSlugs: ["0ad", "openra", "warzone-2100", "triplea"],
  },
  {
    slug: "games-like-diablo",
    title: "Games Like Diablo",
    description: "Loot, levels, and the endless descent. Free games for when you need numbers to go up and monsters to go down.",
    gameSlugs: ["veloren", "shattered-pixel-dungeon", "battle-for-wesnoth", "genshin-impact"],
  },
  {
    slug: "90s-classics-reborn",
    title: "90s Classics, Reborn",
    description:
      "The games you grew up with — open-sourced, modernized, and better than you remember.",
    gameSlugs: ["openra", "warzone-2100", "openttd", "hedgewars", "privateer-gemini-gold", "gradius-remake", "mrboom", "triplea", "ysoccer"],
  },
  {
    slug: "under-15",
    title: "Best PC Games Under $15",
    description:
      "Exceptional games that respect your wallet. Outstanding classic and community-enhanced titles regularly available for $15 or less, with zero pay-to-win mechanics.",
    gameSlugs: [
      "morrowind",
      "star-wars-knights-of-the-old-republic",
      "star-wars-knights-of-the-old-republic-ii-the-sith-lords",
      "heroes-of-might-and-magic-3-complete",
      "s-t-a-l-k-e-r-shadow-of-chernobyl",
      "thief-gold",
      "dungeon-keeper-gold",
    ],
  },
  {
    slug: "free-with-friends",
    title: "Best Free Games to Play With Friends",
    description:
      "No purchase required, no barrier to entry. The finest genuinely free multiplayer games to jump into with friends tonight, from quick party brawlers to deep co-op campaigns.",
    gameSlugs: [
      "openra",
      "supertuxkart",
      "xonotic",
      "brawlhalla",
      "mindustry",
      "hedgewars",
      "veloren",
      "mrboom",
      "warzone-2100",
    ],
  },
];

export const collectionsBySlug = new Map(collections.map((c) => [c.slug, c]));
