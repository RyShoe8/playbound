import type { MetadataRoute } from "next";
import { SITE_URL, IS_PRODUCTION } from "@/lib/site";

/**
 * AI crawlers are allowed explicitly. PlayBound's growth thesis is *being the
 * cited authority* in the free-games niche, so opting content into grounding
 * and training corpora is a deliberate trade, not an oversight.
 */
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
  "cohere-ai",
  "Meta-ExternalAgent",
  "Bytespider",
];

// Longer, more specific Allow rules win over Disallow in Google's and Bing's
// implementations, so the public data endpoints stay crawlable despite /api/.
const ALLOWED = ["/", "/api/public/"];

const DISALLOWED = [
  "/admin",
  "/api/",
  "/library",
  "/profile",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/launcher/auth",
  /*
   * callbackUrl stays. It is an auth round-trip parameter that appears on
   * pages already disallowed by path, and it carries a return destination
   * rather than a view of any content.
   */
  "/*?callbackUrl=",
];

/*
 * ?tab=, ?sort=, ?category= and ?filter= used to be listed above, and removing
 * them is deliberate.
 *
 * Those views already carry a rel="canonical" pointing at the clean URL —
 * /games/[slug] collapses all nine ?tab= variants that way. Disallowing them
 * defeated that: a disallowed URL is never fetched, so the canonical on it is
 * never read, and a crawler that finds the link elsewhere can still index the
 * URL with no title and no snippet because it was never permitted to see the
 * page that would have consolidated it.
 *
 * Crawling them and reading the canonical is the outcome we want. The only
 * cost is crawl budget on a handful of variants that resolve to one URL.
 */

export default function robots(): MetadataRoute.Robots {
  // Preview and development deployments must never be indexed.
  if (!IS_PRODUCTION) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  return {
    rules: [
      { userAgent: "*", allow: ALLOWED, disallow: DISALLOWED },
      ...AI_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: ALLOWED,
        disallow: DISALLOWED,
      })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
