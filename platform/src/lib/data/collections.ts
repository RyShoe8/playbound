import type { Collection } from "./types";

export const collections: Collection[] = [
  {
    slug: "best-rts-games",
    title: "Best Free RTS Games",
    description:
      "Command, conquer, and never pay a cent. The finest real-time strategy the free world has to offer, from thousand-unit slugfests to classic base-building.",
    curator: "PlayBound",
    curatorType: "playbound",
    gameSlugs: ["openra", "beyond-all-reason", "0ad", "zero-k", "warzone-2100"],
    followers: 8420,
    updatedAgo: "3 days ago",
  },
  {
    slug: "best-browser-games",
    title: "Best Browser Games",
    description:
      "Zero installs, zero excuses. Click play and you're in — the best games on PlayBound that run entirely in your browser tab.",
    curator: "PlayBound",
    curatorType: "playbound",
    gameSlugs: ["capsule-clash", "gridlock-royale", "word-foundry", "star-sweeper"],
    followers: 12100,
    updatedAgo: "yesterday",
  },
  {
    slug: "lan-party-favorites",
    title: "LAN Party Favorites",
    description:
      "Dust off the ethernet switch. These games were born for a room full of friends, pizza boxes, and trash talk.",
    curator: "PlayBound",
    curatorType: "playbound",
    gameSlugs: ["xonotic", "supertuxkart", "openra", "hedgewars", "openttd"],
    followers: 6740,
    updatedAgo: "1 week ago",
  },
  {
    slug: "games-under-500mb",
    title: "Games Under 500MB",
    description:
      "Big fun, small footprint. Every game here downloads in minutes on any connection and fits on the oldest laptop in the house.",
    curator: "PlayBound",
    curatorType: "playbound",
    gameSlugs: ["mindustry", "openttd", "shattered-pixel-dungeon", "hedgewars", "luanti", "endless-sky", "naev", "supertux"],
    followers: 5390,
    updatedAgo: "2 weeks ago",
  },
  {
    slug: "best-couch-coop",
    title: "Best Couch Co-op",
    description:
      "One screen, many controllers, guaranteed arguments. The best free games for playing side by side.",
    curator: "PlayBound",
    curatorType: "playbound",
    gameSlugs: ["supertuxkart", "hedgewars", "supertux"],
    followers: 4180,
    updatedAgo: "1 month ago",
  },
  {
    slug: "hidden-gems",
    title: "Hidden Gems",
    description:
      "Criminally underplayed. Each of these deserves ten times its player count — get in before everyone else does.",
    curator: "PlayBound",
    curatorType: "playbound",
    gameSlugs: ["endless-sky", "zero-k", "naev", "warzone-2100", "unvanquished"],
    followers: 7920,
    updatedAgo: "5 days ago",
  },
  {
    slug: "games-like-age-of-empires",
    title: "Games Like Age of Empires",
    description:
      "Missing the villager hum? These free RTS games scratch the civilization-building, army-massing itch.",
    curator: "PlayBound",
    curatorType: "playbound",
    gameSlugs: ["0ad", "openra", "warzone-2100"],
    followers: 9650,
    updatedAgo: "4 days ago",
  },
  {
    slug: "games-like-diablo",
    title: "Games Like Diablo",
    description:
      "Loot, levels, and the endless descent. Free games for when you need numbers to go up and monsters to go down.",
    curator: "PlayBound",
    curatorType: "playbound",
    gameSlugs: ["veloren", "shattered-pixel-dungeon", "battle-for-wesnoth"],
    followers: 8110,
    updatedAgo: "1 week ago",
  },
  {
    slug: "games-like-halo",
    title: "Games Like Halo",
    description: "Fast guns, sci-fi arenas, and that one friend who's suspiciously good. Free shooters worth your reflexes.",
    curator: "PlayBound",
    curatorType: "playbound",
    gameSlugs: ["xonotic", "unvanquished"],
    followers: 5870,
    updatedAgo: "2 weeks ago",
  },
  {
    slug: "90s-classics-reborn",
    title: "90s Classics, Reborn",
    description:
      "The games you grew up with — open-sourced, modernized, and better than you remember. Community-curated nostalgia that actually holds up.",
    curator: "RetroRhys",
    curatorType: "community",
    gameSlugs: ["openra", "warzone-2100", "openttd", "hedgewars"],
    followers: 3240,
    updatedAgo: "6 days ago",
  },
  {
    slug: "commute-killers",
    title: "Commute Killers",
    description:
      "Community-picked games that fit in a lunch break: quick sessions, instant launches, no commitment.",
    curator: "sofia_plays",
    curatorType: "community",
    gameSlugs: ["word-foundry", "star-sweeper", "shattered-pixel-dungeon", "capsule-clash"],
    followers: 2180,
    updatedAgo: "2 days ago",
  },
  {
    slug: "veloren-starter-pack",
    title: "The Veloren Starter Pack",
    description:
      "Everything the Veloren team recommends alongside their game — for when you've gliided every peak and want more open worlds.",
    curator: "Veloren Team",
    curatorType: "developer",
    gameSlugs: ["veloren", "luanti", "endless-sky"],
    followers: 1560,
    updatedAgo: "3 weeks ago",
  },
];

export const collectionsBySlug = new Map(collections.map((c) => [c.slug, c]));
