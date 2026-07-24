import type { Collection } from "./types";

/** Editorial collections curated by PlayBound — groupings of real catalog games. */
export const collections: Collection[] = [
  {
    slug: "best-rts-games",
    title: "Best Free RTS Games",
    description:
      "Command, conquer, and never pay a cent. The finest real-time strategy the free world has to offer, from thousand-unit slugfests to classic base-building.",
    gameSlugs: ["openra", "beyond-all-reason", "0ad", "zero-k", "warzone-2100"],
  },
  {
    slug: "lan-party-favorites",
    title: "LAN Party Favorites",
    description:
      "Dust off the ethernet switch. These games were born for a room full of friends, pizza boxes, and trash talk.",
    gameSlugs: ["xonotic", "supertuxkart", "openra", "hedgewars", "openttd"],
  },
  {
    slug: "games-under-500mb",
    title: "Games Under 500MB",
    description:
      "Big fun, small footprint. Every game here downloads in minutes on any connection and fits on the oldest laptop in the house.",
    gameSlugs: ["mindustry", "openttd", "shattered-pixel-dungeon", "hedgewars", "luanti", "endless-sky", "naev", "supertux"],
  },
  {
    slug: "best-couch-coop",
    title: "Best Couch Co-op",
    description: "One screen, many controllers, guaranteed arguments. The best free games for playing side by side.",
    gameSlugs: ["supertuxkart", "hedgewars", "supertux"],
  },
  {
    slug: "hidden-gems",
    title: "Hidden Gems",
    description:
      "Criminally underplayed. Each of these deserves ten times its player count — get in before everyone else does.",
    gameSlugs: ["endless-sky", "zero-k", "naev", "warzone-2100", "unvanquished"],
  },
  {
    slug: "games-like-age-of-empires",
    title: "Games Like Age of Empires",
    description: "Missing the villager hum? These free RTS games scratch the civilization-building, army-massing itch.",
    gameSlugs: ["0ad", "openra", "warzone-2100"],
  },
  {
    slug: "games-like-diablo",
    title: "Games Like Diablo",
    description: "Loot, levels, and the endless descent. Free games for when you need numbers to go up and monsters to go down.",
    gameSlugs: ["veloren", "shattered-pixel-dungeon", "battle-for-wesnoth"],
  },
  {
    slug: "90s-classics-reborn",
    title: "90s Classics, Reborn",
    description:
      "The games you grew up with — open-sourced, modernized, and better than you remember.",
    gameSlugs: ["openra", "warzone-2100", "openttd", "hedgewars"],
  },
];

export const collectionsBySlug = new Map(collections.map((c) => [c.slug, c]));
