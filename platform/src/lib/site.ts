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

export const SITE_TAGLINE = "High-quality free games, actually worth your time";

export const SITE_DESCRIPTION =
  "A deliberately small catalog of free games that are genuinely good. Every title is tested and played before it is added, and clears the PlayBound Bar: genuinely free, finished enough to enjoy, plays reliably, and high quality or showing good potential. One editor's pick every Wednesday.";

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
    title: "Finished enough to enjoy",
    description:
      "Playable and satisfying start to finish today — not a promising alpha you should check back on.",
  },
  {
    key: "activelyMaintained" as const,
    title: "Plays reliably",
    description:
      "We install it, launch it, and play it before it is listed. The game runs and the session holds up — not a crash-on-boot curiosity.",
  },
  {
    key: "highQuality" as const,
    title: "High quality or shows good potential",
    description:
      "Either already excellent, or clearly becoming something worth your time. We do not list filler, shovelware, or games we have not played.",
  },
];

export type QualityCriterionKey = (typeof QUALITY_BAR)[number]["key"];
