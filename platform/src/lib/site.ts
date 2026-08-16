/**
 * Canonical site identity. Single source of truth for the public origin.
 *
 * Deliberately does NOT derive from NEXTAUTH_URL or VERCEL_URL: those resolve
 * to preview/staging hosts (e.g. playbound-five.vercel.app) and leak into
 * canonical + Open Graph URLs, telling crawlers the wrong host is authoritative.
 */

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://playbound.club"
).replace(/\/$/, "");

export const SITE_NAME = "PlayBound";

export const SITE_TAGLINE = "Discover. Play. Connect.";

export const SITE_DESCRIPTION =
  "PlayBound is a curated gaming platform built to make finding and playing great free games easier. Every game is tested and played before we add it, with everything you need to get playing—from one-click game and mod installation to hardware compatibility, live multiplayer, parties, events, and cloud saves.";

/** Public Discord invite (sidebar + Organization.sameAs). */
export const SITE_DISCORD_INVITE = "https://discord.gg/yc7WdxATar";

/**
 * True only for a real production deployment.
 *
 * On Vercel, VERCEL_ENV distinguishes production from preview — preview builds
 * must not be indexed. Off Vercel (self-hosting, Docker) VERCEL_ENV is absent,
 * so fall back to NODE_ENV rather than silently blocking all crawlers.
 */
export const IS_PRODUCTION = process.env.VERCEL_ENV
  ? process.env.VERCEL_ENV === "production"
  : process.env.NODE_ENV === "production";

export function absoluteUrl(path = "/"): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Social / entity profiles. Used for Organization.sameAs. */
export const SITE_SAME_AS: string[] = [SITE_DISCORD_INVITE];

/**
 * The published quality standard. Referenced by /standards, game pages,
 * llms.txt and JSON-LD. Changing wording here changes it everywhere.
 */
export const QUALITY_BAR = [
  {
    key: "genuinelyFree" as const,
    title: "Genuinely free",
    description:
      "No trial, no paywalled campaign, no pay-to-win, no cosmetic treadmill. Free means free, forever.",
  },
  {
    key: "finished" as const,
    title: "Ready to play",
    description:
      "Playable and satisfying today — a finished game, or a promising alpha that already plays well. Not a stub you should check back on.",
  },
  {
    key: "activelyMaintained" as const,
    title: "Curated",
    description:
      "We install it, launch it, and play it thoroughly before it is listed. Testing is ours — not a store-page copy.",
  },
  {
    key: "highQuality" as const,
    title: "High quality or strong potential",
    description:
      "Either already excellent, or clearly becoming something worth your time. We do not list filler, shovelware, or games we have not played.",
  },
];

export type QualityCriterionKey = (typeof QUALITY_BAR)[number]["key"];
