import type { MetadataRoute } from "next";
import { listGames, collections } from "@/lib/catalog";
import { listAllPublicEditions } from "@/lib/editions";
import { listDevelopers } from "@/lib/developers";
import { listMods } from "@/lib/mods";
import { alternativePages } from "@/lib/data/alternatives";
import { comparisons } from "@/lib/data/comparisons";
import { listWeeklyIssues } from "@/lib/weekly";
import { SITE_URL } from "@/lib/site";

/**
 * Sourced from the live catalog so it stays correct as games are added weekly.
 *
 * Deliberately excludes /games/[slug]/play — it is a launch interstitial with
 * no standalone value that would compete with the game page itself.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [games, mods, weekly, editions] = await Promise.all([
    listGames(),
    listMods({ view: "card" }),
    listWeeklyIssues(),
    listAllPublicEditions(),
  ]);
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1.0, lastModified: now },
    { url: `${SITE_URL}/standards`, changeFrequency: "monthly", priority: 0.9, lastModified: now },
    { url: `${SITE_URL}/free-games`, changeFrequency: "daily", priority: 0.9, lastModified: now },
    { url: `${SITE_URL}/weekly`, changeFrequency: "weekly", priority: 0.9, lastModified: now },
    { url: `${SITE_URL}/discover`, changeFrequency: "weekly", priority: 0.9, lastModified: now },
    { url: `${SITE_URL}/collections`, changeFrequency: "weekly", priority: 0.9, lastModified: now },
    { url: `${SITE_URL}/mods`, changeFrequency: "weekly", priority: 0.7, lastModified: now },
    { url: `${SITE_URL}/servers`, changeFrequency: "hourly", priority: 0.7, lastModified: now },
    { url: `${SITE_URL}/connect`, changeFrequency: "monthly", priority: 0.7, lastModified: now },
    { url: `${SITE_URL}/launcher`, changeFrequency: "monthly", priority: 0.7, lastModified: now },
    { url: `${SITE_URL}/developers`, changeFrequency: "monthly", priority: 0.6, lastModified: now },
    { url: `${SITE_URL}/community`, changeFrequency: "weekly", priority: 0.5, lastModified: now },
    { url: `${SITE_URL}/events`, changeFrequency: "weekly", priority: 0.5, lastModified: now },
    { url: `${SITE_URL}/submit-game`, changeFrequency: "monthly", priority: 0.4, lastModified: now },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.5, lastModified: now },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.2, lastModified: now },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.2, lastModified: now },
  ];

  const gameRoutes: MetadataRoute.Sitemap = games.flatMap((g) => [
    {
      url: `${SITE_URL}/games/${g.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
      lastModified: g.qualityBar?.lastVerified ? new Date(g.qualityBar.lastVerified) : now,
    },
    {
      url: `${SITE_URL}/games/${g.slug}/install`,
      changeFrequency: "monthly" as const,
      priority: 0.7,
      lastModified: now,
    },
  ]);

  // Only real editions are indexed. A game whose sole edition is the generated
  // Official one has no separate page worth listing — it would duplicate the
  // game page it was derived from. Unlisted and hidden editions are excluded
  // upstream by listAllPublicEditions().
  const knownGameSlugs = new Set(games.map((g) => g.slug));
  const developerSlugsWithGames = new Set(games.map((g) => g.developerSlug));
  const editionRoutes: MetadataRoute.Sitemap = editions
    .filter((e) => knownGameSlugs.has(e.gameSlug))
    .map((e) => ({
      url: `${SITE_URL}/games/${e.gameSlug}/editions/${e.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
      lastModified: e.updatedAt ? new Date(e.updatedAt) : now,
    }));

  return [
    ...staticRoutes,
    ...gameRoutes,
    ...editionRoutes,
    ...weekly.map((i) => ({
      url: `${SITE_URL}/weekly/${i.slug}`,
      changeFrequency: "yearly" as const,
      priority: 0.7,
      lastModified: new Date(i.publishedAt),
    })),
    ...alternativePages.map((p) => ({
      url: `${SITE_URL}/alternatives/${p.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.8,
      lastModified: now,
    })),
    ...comparisons.map((c) => ({
      url: `${SITE_URL}/compare/${c.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.8,
      lastModified: now,
    })),
    ...collections.map((c) => ({
      url: `${SITE_URL}/collections/${c.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
      lastModified: now,
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
        lastModified: now,
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
        lastModified: now,
      })),
  ];
}
