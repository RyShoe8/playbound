/**
 * Game Editions — shared vocabulary.
 *
 * A Game is the franchise/base title. An Edition is a specific way to play it:
 * the official client, a community server like Turtle WoW, a remaster, a
 * PlayBound-curated build. A Game is never duplicated because it has several
 * editions.
 *
 *     Game  →  Edition  →  Installation
 *
 * Everything here is data rather than control flow on purpose: adding an
 * install method or a verification level should not require touching the
 * schema, the API, or the renderer. See src/lib/editions.ts for the data layer
 * and src/lib/editionInstall.ts for how a method turns into a user action.
 */

import type { HardwareRequirementsBlock } from "@/lib/hardware/types";

/** What kind of experience this edition is. */
export const EDITION_TYPES = [
  "official",
  "community",
  "private",
  "remaster",
  "launcher",
  "enhanced",
] as const;
export type EditionType = (typeof EDITION_TYPES)[number];

export const EDITION_TYPE_LABELS: Record<EditionType, string> = {
  official: "Official",
  community: "Community",
  private: "Private server",
  remaster: "Remaster",
  launcher: "Launcher",
  enhanced: "Enhanced",
};

/** Lifecycle. Distinct from visibility: an archived edition may still be public. */
export const EDITION_STATUSES = ["active", "archived", "deprecated", "coming_soon"] as const;
export type EditionStatus = (typeof EDITION_STATUSES)[number];

export const EDITION_STATUS_LABELS: Record<EditionStatus, string> = {
  active: "Active",
  archived: "Archived",
  deprecated: "Deprecated",
  coming_soon: "Coming soon",
};

/**
 * Who can reach it.
 *   public   — listed and indexable
 *   unlisted — reachable by direct URL, absent from listings and sitemap
 *   hidden   — admin only
 */
export const EDITION_VISIBILITIES = ["public", "hidden", "unlisted"] as const;
export type EditionVisibility = (typeof EDITION_VISIBILITIES)[number];

/**
 * Certification. Ordered weakest → strongest so callers can compare rank
 * without hardcoding names; new levels slot in without breaking comparisons.
 */
export const VERIFICATION_LEVELS = [
  "deprecated",
  "untested",
  "community_verified",
  "playbound_verified",
  "official",
] as const;
export type VerificationLevel = (typeof VERIFICATION_LEVELS)[number];

export const VERIFICATION_LABELS: Record<VerificationLevel, string> = {
  official: "Official",
  playbound_verified: "PlayBound Verified",
  community_verified: "Community Verified",
  untested: "Untested",
  deprecated: "Deprecated",
};

export const VERIFICATION_DESCRIPTIONS: Record<VerificationLevel, string> = {
  official: "Published by the game's own developers.",
  playbound_verified: "Installed and played end to end by the PlayBound team.",
  community_verified: "Vouched for by established community members, not yet PlayBound tested.",
  untested: "Listed but not yet verified by anyone. Install at your own discretion.",
  deprecated: "No longer maintained or recommended.",
};

/** Higher is stronger. Used for sorting and for "is at least" checks. */
export function verificationRank(level: VerificationLevel): number {
  const index = VERIFICATION_LEVELS.indexOf(level);
  return index === -1 ? 0 : index;
}

/**
 * How an edition is installed. Each method carries its own config object
 * (see EditionInstallConfig) so no method's assumptions leak into another.
 */
export const INSTALL_METHODS = [
  "official_download",
  "steam",
  "epic",
  "gog",
  "itch",
  "playbound_installer",
  "external_installer",
  "manual",
  "browser",
  "mobile_store",
] as const;
export type InstallMethod = (typeof INSTALL_METHODS)[number];

export const INSTALL_METHOD_LABELS: Record<InstallMethod, string> = {
  official_download: "Official download",
  steam: "Steam",
  epic: "Epic Games",
  gog: "GOG",
  itch: "itch.io",
  playbound_installer: "PlayBound installer",
  external_installer: "External installer",
  manual: "Manual install",
  browser: "Play in browser",
  mobile_store: "Mobile app store",
};

/** Per-method configuration. Every field optional — validation is per method. */
export interface EditionInstallConfig {
  official_download?: {
    url?: string;
    fileName?: string;
    sizeMB?: number;
    checksum?: string;
    /** Optional per-platform overrides, e.g. { windows: "…", linux: "…" } */
    platformUrls?: Record<string, string>;
  };
  steam?: { appId?: string };
  epic?: { productSlug?: string; launchUrl?: string };
  gog?: { productUrl?: string };
  itch?: { pageUrl?: string };
  /**
   * Reuses the launcher's existing recipe vocabulary so the desktop app needs
   * no new install engine — an edition simply supplies the recipe a game used
   * to supply directly.
   */
  playbound_installer?: {
    kind?: string;
    repo?: string | null;
    assetPattern?: string | null;
    exeHint?: string | null;
    url?: string | null;
    fileName?: string | null;
    versionLabel?: string | null;
    knownExePaths?: string[];
    installRoot?: string | null;
    connectArgs?: string[];
    note?: string | null;
    /** MD5 of a pinned direct zip (hex). */
    checksumMd5?: string | null;
    md5?: string | null;
    /** After zip extract: open Discord for manual patch (Quarm). */
    postInstallDiscord?: string | boolean | null;
    /** Fetch latest eqw.dll from CoastalRedwood/eqw_takp. */
    postInstallEqw?: boolean;
    /** Overlay zip URL for locate-then-zip (P99Files). */
    overlayUrl?: string | null;
    overlayFileName?: string | null;
    /** Prompt user to pick an existing base client folder first. */
    requiresBaseDir?: boolean;
    /** Numbered get-to-playing steps shown on the edition page + launcher. */
    steps?: { platform?: string; text: string; command?: string | null }[];
  };
  external_installer?: { url?: string; instructions?: string };
  manual?: {
    steps?: { platform?: string; text: string; command?: string | null }[];
  };
  browser?: { playUrl?: string };
  mobile_store?: { androidUrl?: string; iosUrl?: string };
}

/** A link out to somewhere the edition lives. */
export interface EditionLinks {
  website?: string;
  discord?: string;
  wiki?: string;
  github?: string;
  forum?: string;
}

export interface EditionBranding {
  logo?: string;
  heroImage?: string;
  screenshots?: string[];
  videos?: string[];
  /** OKLCH hue for generated artwork when no image is supplied. */
  artHue?: number;
}

export interface EditionRequirements {
  min?: string;
  recommended?: string;
  /** Free-form extras, e.g. "Requires a 3.3.5a client". */
  notes?: string;
}

export interface EditionPatchNote {
  version: string;
  date?: string;
  title?: string;
  body?: string;
  url?: string;
}

export interface EditionFaqItem {
  q: string;
  a: string;
}

/**
 * An Edition as the rest of the app sees it.
 *
 * `id` is a string rather than an ObjectId because virtual editions (games
 * with none stored yet) have no document. Those carry `virtual: true` and an
 * id of `virtual:<gameSlug>`; nothing may attempt to persist them.
 */
export interface Edition {
  id: string;
  gameId?: string;
  gameSlug: string;
  slug: string;
  name: string;
  shortDescription: string;
  description: string;

  type: EditionType;
  status: EditionStatus;
  visibility: EditionVisibility;

  /** Ascending. The default edition is pinned first regardless. */
  sortOrder: number;
  isDefault: boolean;

  branding: EditionBranding;
  links: EditionLinks;

  installMethod: InstallMethod;
  installConfig: EditionInstallConfig;

  requirements?: EditionRequirements;
  /** Optional structured HW requirements (overrides/raises game floors). */
  hardwareRequirements?: HardwareRequirementsBlock | null;
  features: string[];
  tags: string[];
  /**
   * Alternate names people actually type. "Turtle", "TWoW" and "Turtle WoW"
   * should all reach the same edition, and none of those belong in the
   * display name or in tags.
   */
  aliases: string[];
  /**
   * The in-game or in-launcher server name, when an edition is a server —
   * often what a player knows it by ("Nordanaar") rather than the project
   * name. Searchable; shown on the edition page when set.
   */
  serverName?: string;
  languages: string[];

  version?: string;
  patchNotes: EditionPatchNote[];
  faq: EditionFaqItem[];

  verified: boolean;
  verificationLevel: VerificationLevel;
  verifiedAt?: string;
  verifiedBy?: string;
  verificationNote?: string;

  /** Reserved for player counts / server listings. Never invented. */
  population?: number | null;

  /** True when synthesized from the parent game rather than stored. */
  virtual: boolean;

  createdAt?: string;
  updatedAt?: string;
}

/** Editions visible to the public, in display order. */
export function isPubliclyVisible(edition: Edition): boolean {
  return edition.visibility === "public";
}

/** Reachable by direct URL — public or unlisted, but not hidden. */
export function isReachable(edition: Edition): boolean {
  return edition.visibility !== "hidden";
}

/**
 * Display order: the default edition first, then sortOrder, then name.
 * Archived and deprecated editions sink below active ones so a dead server
 * never outranks a live one.
 */
export function compareEditions(a: Edition, b: Edition): number {
  if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
  const rank = (e: Edition) =>
    e.status === "active" ? 0 : e.status === "coming_soon" ? 1 : e.status === "deprecated" ? 2 : 3;
  const byStatus = rank(a) - rank(b);
  if (byStatus !== 0) return byStatus;
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.name.localeCompare(b.name);
}
