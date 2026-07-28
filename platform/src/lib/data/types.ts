import type { LauncherInstall } from "@/lib/launcherInstall";

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
  | "Pirate";

export interface GameArt {
  /** CSS color stops for the generated cover gradient (fallback) */
  from: string;
  to: string;
  /** Lucide icon name rendered as the cover watermark when no image */
  icon: string;
}

/**
 * Catalog entry for a real, free game. Everything here is factual or clearly
 * editorial (curation flags) — no fabricated metrics.
 */
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
  /** Approximate download size in MB */
  sizeMB: number;
  platforms: string[];
  features: string[];
  launchMethods: LaunchMethod[];
  /** Runs directly in the browser via PlayBound — none yet, reserved for future titles. */
  browserPlayable: boolean;
  steamDeck: boolean;
  website: string;
  /** Steam store app id when the game was imported from Steam (for steam:// install). */
  steamAppId?: string;
  /** owner/repo on GitHub, for games whose official releases are published there. */
  githubRepo?: string;
  /** Editorial curation flags chosen by PlayBound */
  gameOfWeek: boolean;
  hiddenGem: boolean;
  art: GameArt;
  /** Local cover under /public, e.g. /games/openra/cover.jpg */
  coverImage?: string;
  /** Local or absolute screenshot URLs for the Media tab */
  screenshots?: string[];
  /** Video URLs (trailers, gameplay clips) for the Media tab */
  videos?: string[];
  systemRequirements: { min: string; recommended: string };
  /** Desktop launcher install recipe (CMS / seed). */
  launcherInstall?: LauncherInstall;
}

export interface Developer {
  slug: string;
  name: string;
  tagline: string;
  about: string;
  founded: number;
  location: string;
  website: string;
  artHue: number;
}

/** Editorial collection curated by PlayBound. */
export interface Collection {
  slug: string;
  title: string;
  description: string;
  gameSlugs: string[];
}
