import type { LauncherInstall } from "@/lib/launcherInstall";
import type { HardwareRequirementsBlock } from "@/lib/hardware/types";
import type { GameAccess } from "@/lib/access/types";

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
  | "MMO"
  | "Survival"
  | "Shooter"
  | "Action"
  | "Adventure"
  | "Sports"
  | "Fighting"
  | "Social Deduction"
  | "Deck Builder"
  | "Idle"
  | "Horror"
  | "Stealth"
  | "Immersive Sim"
  | "MOBA"
  | "Party Game";

export interface GameArt {
  /** CSS color stops for the generated cover gradient (fallback) */
  from: string;
  to: string;
  /** Lucide icon name rendered as the cover watermark when no image */
  icon: string;
}

/**
 * A game's score against the published PlayBound Bar criteria.
 *
 * Rendered as a visible, dated checklist on every game page. This is the
 * site's most citable asset: it proves the standard is applied rather than
 * claimed, and `lastVerified` supplies the recency signal LLMs weight heavily.
 */
export interface QualityBar {
  /** Worth the cost: free or regularly $15 or less, with fair non-pay-to-win monetization. */
  genuinelyFree: boolean;
  /** Playable and satisfying start to finish today. */
  finished: boolean;
  /** Tested in-house: installs, launches, and plays reliably. */
  activelyMaintained: boolean;
  /** Kept for older assessments; no longer a published criterion. */
  standsAlone: boolean;
  /** The game itself is good enough—or promising enough—to recommend. */
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
  status?: "draft" | "watchlist" | "testing" | "published";
  platforms: string[];
  features: string[];
  /** Real max concurrent players in one session. Null until verified — never a guess. */
  maxPlayers?: number | null;
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
   * Overview leads with games, editions, and mods that require owning this
   * copy. Does not change FREE vs VALUE.
   */
  masterCopy?: boolean;
  /**
   * Admin checklist: all catalog info for this title has been entered.
   * Optional on seed objects; missing means incomplete.
   */
  complete?: boolean;
  /**
   * How this game is acquired. Absent means free, which is what the whole
   * catalog was when the field was introduced — so every existing entry keeps
   * behaving exactly as before until it is classified.
   *
   * Never read this to decide Free vs Value. Ask the resolver in
   * `lib/access/resolver.ts`, which accounts for dependencies this field
   * cannot see.
   */
  access?: GameAccess;
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

  /** Score against the published criteria. The centrepiece. */
  qualityBar?: QualityBar;
  /** 400–600 words of unique editorial. Replaces the ~44-word description. */
  longDescription?: string;
  /** ~100 words, first-person curation POV. Why this one made the cut. */
  whyWePickedIt?: string;
  /** The single memorable hook we would excitedly tell a friend about. */
  thatOneThing?: string;
  /** Structured per-platform install guide. */
  installSteps?: InstallStep[];
  /** Optional first-time setup steps (account creation, profile setup, etc.). */
  firstPlaySteps?: InstallStep[];
  /** Optional manual multiplayer joining / server navigation steps. */
  multiplayerGamingSteps?: InstallStep[];
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
  /** ISO date when the game was published on PlayBound. */
  publishedAt?: string | null;
  /** ISO date when the catalog document was first created (Mongo timestamps). */
  createdAt?: string;
  /** Official + PlayBound Discord destinations for the Community card. */
  communityLinks?: GameCommunityLinks;
  /**
   * Whether PlayBound actively supports this game through its launcher,
   * editions, mods, compatibility profiles, etc. Games discovered solely
   * through free promotions enter the catalog as `false`.
   */
  playboundSupported?: boolean;
  /** Epic Games Store product page URL (for matching). */
  epicStoreUrl?: string;
  /** GOG product page URL (for matching). */
  gogStoreUrl?: string;
  /** Store-specific IDs for cross-platform matching. */
  externalIds?: { epic?: string; steam?: string; gog?: string };
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
