import type { MetadataRoute } from "next";
import { listGames, collections } from "@/lib/catalog";
import { listAllPublicEditions } from "@/lib/editions";
import { listDevelopers } from "@/lib/developers";
import { listMods } from "@/lib/mods";
import { alternativePages } from "@/lib/data/alternatives";
import { comparisons } from "@/lib/data/comparisons";
import { listWeeklyIssues } from "@/lib/weekly";
import { listPublishedGear } from "@/lib/gear";
import { listPublicEvents } from "@/lib/events/service";
import { MULTIPLAYER_ADAPTERS } from "@/lib/multiplayer/adapters";
import { SITE_URL } from "@/lib/site";
import { lastMod, newestUpdate } from "@/lib/sitemapDates";

/**
 * Sourced from the live catalog so it stays correct as games are added weekly.
 *
 * Deliberately excludes /games/[slug]/play — it is a launch interstitial with
 * no standalone value that would compete with the game page itself.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [games, mods, weekly, editions, gear, events] = await Promise.all([
    listGames(),
    listMods({ view: "card" }),
    listWeeklyIssues(),
    listAllPublicEditions(),
    listPublishedGear(),
    listPublicEvents({ limit: 100, includePast: false }),
  ]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1.0 },
    { url: `${SITE_URL}/standards`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/free-games`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/weekly`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/discover`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/collections`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/mods`, changeFrequency: "weekly", priority: 0.7 },
    /*
     * The hubs that link the /alternatives/* and /compare/* pages. Their
     * children were submitted but the pages linking them were not, so the
     * cluster had no crawlable entry point of its own.
     */
    { url: `${SITE_URL}/alternatives`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/compare`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/gear`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/servers`, changeFrequency: "hourly", priority: 0.7 },
    { url: `${SITE_URL}/connect`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/launcher`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/open-platform`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/developers`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/community`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${SITE_URL}/events`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${SITE_URL}/submit-game`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.2 },
  ];

  const gameRoutes: MetadataRoute.Sitemap = games.map((g) => ({
    url: `${SITE_URL}/games/${g.slug}`,
    changeFrequency: "weekly" as const,
    priority: 0.8,
    ...lastMod(g.qualityBar?.lastVerified),
  }));

  // Only real, active editions are indexed. A game whose sole edition is the generated
  // Official one has no separate page worth listing — it would duplicate the
  // game page it was derived from. Unlisted, draft, and hidden editions are excluded.
  const knownGameSlugs = new Set(games.map((g) => g.slug));
  const developerSlugsWithGames = new Set(games.map((g) => g.developerSlug));
  const gameDatesByDeveloper = new Map<string, { updatedAt?: string }[]>();
  for (const g of games) {
    const bucket = gameDatesByDeveloper.get(g.developerSlug) || [];
    bucket.push({ updatedAt: g.qualityBar?.lastVerified });
    gameDatesByDeveloper.set(g.developerSlug, bucket);
  }
  const editionRoutes: MetadataRoute.Sitemap = editions
    .filter((e) => knownGameSlugs.has(e.gameSlug) && (e.status === "active" || e.status === "coming_soon"))
    .map((e) => ({
      url: `${SITE_URL}/games/${e.gameSlug}/editions/${e.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
      ...lastMod(e.updatedAt),
    }));

  // Same gate the page itself uses: a real, curated multiplayer adapter and a
  // live game to attach it to. Games absent from MULTIPLAYER_ADAPTERS 404.
  const playWithFriendsRoutes: MetadataRoute.Sitemap = games
    .filter((g) => g.slug in MULTIPLAYER_ADAPTERS)
    .map((g) => ({
      url: `${SITE_URL}/play-with-friends/${g.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.7,
      // Generated from the game, so the game's own date is the real one.
      ...lastMod(g.qualityBar?.lastVerified),
    }));

  const eventRoutes: MetadataRoute.Sitemap = events
    .filter((e) => e.visibility === "public" || !e.visibility)
    .map((e) => ({
      url: `${SITE_URL}/events/${e.id}`,
      changeFrequency: "daily" as const,
      priority: 0.6,
      ...lastMod(e.publishedAt || e.createdAt),
    }));

  return [
    ...staticRoutes,
    ...gameRoutes,
    ...editionRoutes,
    ...playWithFriendsRoutes,
    ...eventRoutes,
    ...weekly.map((i) => ({
      url: `${SITE_URL}/weekly/${i.slug}`,
      changeFrequency: "yearly" as const,
      priority: 0.7,
      ...lastMod(i.publishedAt),
    })),
    ...alternativePages.map((p) => ({
      url: `${SITE_URL}/alternatives/${p.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    ...comparisons.map((c) => ({
      url: `${SITE_URL}/compare/${c.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    ...collections.map((c) => ({
      url: `${SITE_URL}/collections/${c.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    /*
     * Same knownGameSlugs gate the editions above use, and for the same
     * reason. A mod's own status is independent of its base game's, so a
     * published mod can hang off a game that is not publicly visible. /mods
     * already drops those from the grid, which left them listed here with no
     * internal link pointing at them anywhere on the site — 441 URLs that
     * crawlers reach only through this file and report as orphans.
     */
    ...mods
      .filter((m) => knownGameSlugs.has(m.baseGameSlug))
      .map((m) => ({
        url: `${SITE_URL}/mods/${m.slug}`,
        changeFrequency: "monthly" as const,
        priority: 0.5,
        ...lastMod(m.updatedAt),
      })),
    // Category hubs, derived from what is actually published rather than from
    // the full enum — an empty category 404s, and submitting a 404 wastes crawl.
    ...[...new Set(gear.map((g) => g.category.toLowerCase()))].map((category) => ({
      url: `${SITE_URL}/gear/${category}`,
      changeFrequency: "weekly" as const,
      priority: 0.6,
      // A hub is as new as the newest thing on it.
      ...lastMod(newestUpdate(gear.filter((g) => g.category.toLowerCase() === category))),
    })),
    ...gear.map((g) => ({
      url: `${SITE_URL}/gear/${g.category.toLowerCase()}/${g.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.5,
      ...lastMod(g.updatedAt),
    })),
    /*
     * Only developers who actually have a published game. The page renders a
     * games list and nothing else, so the rest are empty pages — and they are
     * the majority, since every mod author and every unpublished draft's
     * developer has a record. Submitting them asks Google to crawl far more
     * nothing than something; the pages stay reachable, just not advertised.
     * Mirrors the noIndex condition in developers/[slug]/page.tsx.
     */
    ...(await listDevelopers())
      .filter((d) => developerSlugsWithGames.has(d.slug))
      .map((d) => ({
        url: `${SITE_URL}/developers/${d.slug}`,
        changeFrequency: "monthly" as const,
        priority: 0.5,
        // No timestamp on the developer itself; the page is its games.
        ...lastMod(newestUpdate(gameDatesByDeveloper.get(d.slug) || [])),
      })),
  ];
}
