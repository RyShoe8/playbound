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
  "Great games don't have to cost $70. PlayBound finds exceptional free and affordable games, tests them, improves them with the best community tools and mods, and makes them easier to install and play together.";

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
    title: "Worth the cost",
    description:
      "Free, or regularly available for $15 or less. Good developers deserve to be paid, and optional cosmetics, expansions, and premium extras are welcome. But we won't list games that sell competitive advantages, disguise a trial as free, or charge again to finish the core experience.",
  },
  {
    key: "finished" as const,
    title: "Ready to play",
    description:
      "Playable and satisfying today. It can be unfinished; it cannot be unfun. We love supporting indie developers, but prototypes, broken releases, and promises of a future game do not make the cut.",
  },
  {
    key: "activelyMaintained" as const,
    title: "Tested by PlayBound",
    description:
      "We install it, launch it, and play it ourselves. We've spent hours building definitive editions and making multiplayer work, because a store-page claim is not the same as a game we can confidently put in front of you.",
  },
  {
    key: "highQuality" as const,
    title: "That One Thing",
    description:
      "Every game needs that one thing we'd excitedly tell our friends about. It might be the mechanics, story, art, soundtrack, controls, community, or the way it brings people together. If it doesn't have one, it doesn't make the catalog.",
  },
];

export type QualityCriterionKey = (typeof QUALITY_BAR)[number]["key"];
