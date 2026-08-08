import type { LauncherInstall } from "@/lib/launcherInstall";
import type { HardwareRequirementsBlock } from "@/lib/hardware/types";

export type LaunchMethod = "browser" | "install" | "server";

/**
 * Must stay in sync with GENRES in src/lib/gamePayload.ts, which is what
 * actually validates incoming payloads. Kept separate so this module does not
 * have to depend on zod.
 */
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
  | "Pirate"
  | "MMO"
  | "Survival"
  | "Shooter"
  | "Action"
  | "Adventure"
  | "Sports"
  | "Fighting"
  | "Social Deduction"
  | "Card Game"
  | "Idle"
  | "Horror"
  | "MOBA";

export interface GameArt {
  /** CSS color stops for the generated cover gradient (fallback) */
  from: string;
  to: string;
  /** Lucide icon name rendered as the cover watermark when no image */
  icon: string;
}

/**
 * A game's score against the five published PlayBound Bar criteria.
 *
 * Rendered as a visible, dated checklist on every game page. This is the
 * site's most citable asset: it proves the standard is applied rather than
 * claimed, and `lastVerified` supplies the recency signal LLMs weight heavily.
 */
export interface QualityBar {
  /** No trial, no paywalled campaign, no pay-to-win, no cosmetic treadmill. */
  genuinelyFree: boolean;
  /** Playable and satisfying start to finish today. */
  finished: boolean;
  /** A release or meaningful commit within the last twelve months. */
  activelyMaintained: boolean;
  /** Good enough that we would recommend it even if it cost money. */
  standsAlone: boolean;
  /** Selective enough to earn a place — not free-game noise or shovelware. */
  highQuality: boolean;
  /** Self-contained quotable sentence summarising the assessment. */
  verdict: string;
  /** ISO date the assessment was last checked. */
  lastVerified: string;
}

/** One step in a per-platform install guide. */
export interface InstallStep {
  /** Which platform this step applies to; "all" for shared steps. */
  platform: "all" | "windows" | "macos" | "linux";
  /** Imperative instruction. */
  text: string;
  /** Optional command to run verbatim. */
  command?: string;
}

/** A question/answer pair. Feeds FAQPage structured data. */
export interface GameFaq {
  q: string;
  a: string;
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
  /**
   * Alternate names people search by — "WoW", "C&C". Never displayed;
   * exists so a search for a common shorthand reaches the game.
   */
  aliases?: string[];
  license: string;
  releaseYear: number;
  /** Approximate download size in MB */
  sizeMB: number;
  /**
   * Catalog visibility. Omitted/undefined on seed rows treated as published.
   * `testing` is only returned when the caller loaded with includeTesting.
   */
  status?: "draft" | "testing" | "published";
  platforms: string[];
  features: string[];
  launchMethods: LaunchMethod[];
  /** Runs directly in the browser via PlayBound — none yet, reserved for future titles. */
  browserPlayable: boolean;
  steamDeck: boolean;
  website: string;
  /** Steam store app id when the game was imported from Steam (for steam:// install). */
  steamAppId?: string;
  /** Google Play / Android download page when the title ships on Android. */
  androidStoreUrl?: string;
  /** App Store page when the title ships on iOS. */
  iosStoreUrl?: string;
  /** owner/repo on GitHub, for games whose official releases are published there. */
  githubRepo?: string;
  /** Editorial curation flags chosen by PlayBound */
  gameOfWeek: boolean;
  hiddenGem: boolean;
  /**
   * Admin checklist: all catalog info for this title has been entered.
   * Optional on seed objects; missing means incomplete.
   */
  complete?: boolean;
  art: GameArt;
  /** Local cover under /public, e.g. /games/openra/cover.webp */
  coverImage?: string;
  /** Local or absolute screenshot URLs for the Media tab */
  screenshots?: string[];
  /** Video URLs (trailers, gameplay clips) for the Media tab */
  videos?: string[];
  systemRequirements: { min: string; recommended: string };
  /** Optional structured requirements for compatibility (additive to free-text). */
  hardwareRequirements?: HardwareRequirementsBlock | null;
  /** Desktop launcher install recipe (CMS / seed). */
  launcherInstall?: LauncherInstall;

  // ── Editorial depth ────────────────────────────────────────────────
  // Optional so existing catalog entries and DB documents stay valid while
  // content is backfilled. Pages degrade gracefully when absent.

  /** Score against the five published criteria. The centrepiece. */
  qualityBar?: QualityBar;
  /** 400–600 words of unique editorial. Replaces the ~44-word description. */
  longDescription?: string;
  /** ~100 words, first-person curation POV. Why this one made the cut. */
  whyWePickedIt?: string;
  /** Structured per-platform install guide. */
  installSteps?: InstallStep[];
  /** 5–8 entries. Drives FAQPage structured data and question-shaped H2s. */
  faq?: GameFaq[];
  /** Concrete situations this game suits, e.g. "low-spec laptop". */
  bestFor?: string[];
  /** Honest limitations. Distinguishes a citable source from a directory. */
  notFor?: string[];
  /** Commercial games it resembles — powers /alternatives cross-linking. */
  comparableTo?: string[];
  /** ISO date of last content update. Feeds sitemap lastmod. */
  updatedAt?: string;
  /** ISO date when the catalog document was first created (Mongo timestamps). */
  createdAt?: string;
  /** Official + PlayBound Discord destinations for the Community card. */
  communityLinks?: GameCommunityLinks;
}

export interface GameCommunityLinks {
  officialDiscord?: {
    inviteUrl: string;
    serverName?: string;
    verified: boolean;
    verifiedSourceUrl?: string;
    verifiedAt?: string;
  };
  playboundDiscord?: {
    guildId?: string;
    channelId?: string;
    channelName: string;
    inviteCode?: string;
    inviteUrl: string;
    provisionedAt?: string;
  };
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
