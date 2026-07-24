export type LaunchMethod = "browser" | "install" | "server";

export type Genre =
  | "Strategy"
  | "RTS"
  | "FPS"
  | "Racing"
  | "Puzzle"
  | "RPG"
  | "Roguelike"
  | "Simulation"
  | "Platformer"
  | "Sandbox"
  | "Tower Defense"
  | "Space"
  | "Arcade"
  | "Card & Board";

export interface GameArt {
  /** CSS color stops for the generated cover gradient */
  from: string;
  to: string;
  /** Lucide icon name rendered as the cover watermark */
  icon: string;
}

export interface Game {
  slug: string;
  title: string;
  tagline: string;
  description: string;
  developerSlug: string;
  genres: Genre[];
  tags: string[];
  license: string;
  releaseYear: number;
  lastUpdate: string;
  sizeMB: number | null; // null = browser only
  platforms: string[];
  features: string[];
  launchMethods: LaunchMethod[];
  firstParty: boolean;
  browserPlayable: boolean;
  rating: number;
  ratingCount: number;
  playersOnline: number;
  activeServers: number;
  achievementsCount: number;
  modsCount: number;
  weeklyGrowth: number; // percent, can be negative
  hiddenGem: boolean;
  gameOfWeek: boolean;
  isNewRelease: boolean;
  steamDeck: boolean;
  art: GameArt;
  systemRequirements: { min: string; recommended: string };
}

export interface Developer {
  slug: string;
  name: string;
  tagline: string;
  about: string;
  founded: number;
  location: string;
  website: string;
  discord: string | null;
  followers: number;
  firstParty: boolean;
  artHue: number;
}

export interface Collection {
  slug: string;
  title: string;
  description: string;
  curator: string;
  curatorType: "playbound" | "developer" | "community";
  gameSlugs: string[];
  followers: number;
  updatedAgo: string;
}

export interface PlatformEvent {
  slug: string;
  title: string;
  type:
    | "Tournament"
    | "Community Night"
    | "Dev Livestream"
    | "Speedrun"
    | "LAN Weekend"
    | "Seasonal Challenge";
  gameSlug: string;
  startsIn: string; // human-readable, e.g. "in 2 days"
  when: string; // e.g. "Sat, Jul 26 · 7:00 PM"
  description: string;
  registered: number;
  host: string;
}

export type PresenceStatus =
  | "Online"
  | "Playing"
  | "Hosting Server"
  | "Away"
  | "Looking for Group"
  | "Watching Replay";

export interface Player {
  handle: string;
  name: string;
  avatarHue: number;
  status: PresenceStatus;
  currentGameSlug: string | null;
  level: number;
  hoursPlayed: number;
  isFriend: boolean;
}

export type ActivityKind =
  | "started"
  | "achievement"
  | "server"
  | "collection"
  | "review"
  | "guide"
  | "milestone"
  | "tournament"
  | "mod";

export interface ActivityItem {
  kind: ActivityKind;
  text: string;
  gameSlug: string | null;
  playerHandle: string | null;
  timeAgo: string;
}

export interface Review {
  gameSlug: string;
  author: string;
  rating: number;
  title: string;
  body: string;
  helpful: number;
  timeAgo: string;
}

export interface Guide {
  gameSlug: string;
  title: string;
  author: string;
  kind: "Beginner" | "Advanced" | "Walkthrough" | "Build Order" | "Controls" | "FAQ";
  views: number;
  trending: boolean;
  timeAgo: string;
}

export interface Mod {
  gameSlug: string;
  name: string;
  summary: string;
  author: string;
  downloads: number;
  rating: number;
  updatedAgo: string;
}

export interface GameServer {
  gameSlug: string;
  name: string;
  map: string;
  players: number;
  maxPlayers: number;
  region: string;
  createdAgo: string;
}

export interface Discussion {
  gameSlug: string;
  title: string;
  author: string;
  replies: number;
  lastActive: string;
}

export interface NewsPost {
  gameSlug: string | null; // null = platform news
  title: string;
  summary: string;
  date: string;
  kind: "Update" | "News" | "Devlog" | "Editorial";
}

export interface Achievement {
  gameSlug: string;
  name: string;
  description: string;
  rarity: number; // % of players who have it
  xp: number;
}

export interface LibraryEntry {
  gameSlug: string;
  installed: boolean;
  favorite: boolean;
  completed: boolean;
  lastPlayed: string;
  hoursPlayed: number;
  achievementsEarned: number;
  updateAvailable: boolean;
}
