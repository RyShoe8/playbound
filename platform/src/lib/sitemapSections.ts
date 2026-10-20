import type { MetadataRoute } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { listGames } from "@/lib/catalog";
import { listCollections } from "@/lib/collections";
import { listAllPublicEditions } from "@/lib/editions";
import { listDevelopers } from "@/lib/developers";
import { listMods } from "@/lib/mods";
import { alternativePages } from "@/lib/data/alternatives";
import { availableComparisons } from "@/lib/comparisonsAvailable";
import { listWeeklyIssues } from "@/lib/weekly";
import { listPublishedBlogPosts } from "@/lib/blog";
import { listPublishedGear } from "@/lib/gear";
import { MULTIPLAYER_ADAPTERS } from "@/lib/multiplayer/adapters";
import { SITE_URL } from "@/lib/site";
import { lastMod, newestUpdate } from "@/lib/sitemapDates";
import { HOSTING_TIER_TAG, loadPublicTier, publicGames } from "@/lib/dedicatedHosting/publicTier";

/**
 * The sitemap is split into sections so no single request has to read the whole
 * catalog. Each section loads only what it lists and is cached on its own, so a
 * cold build of one section does not wait for the others, crawlers can fetch the
 * small index immediately, and a catalog edit refreshes the sections it touches.
 *
 * Deliberately excludes /games/[slug]/play — it is a launch interstitial with no
 * standalone value that would compete with the game page itself.
 */
export const SITEMAP_SECTIONS = ["pages", "games", "editions", "mods", "gear", "developers"] as const;
export type SitemapSection = (typeof SITEMAP_SECTIONS)[number];

export function isSitemapSection(value: string): value is SitemapSection {
  return (SITEMAP_SECTIONS as readonly string[]).includes(value);
}

type Entries = MetadataRoute.Sitemap;

async function gameSlugs(): Promise<{ slugs: Set<string>; games: Awaited<ReturnType<typeof listGames>> }> {
  const games = await listGames();
  return { slugs: new Set(games.map((g) => g.slug)), games };
}

async function pagesSection(): Promise<Entries> {
  "use cache";
  cacheLife("hours");
  cacheTag("collections");
  cacheTag("weekly");
  cacheTag("blog");
  cacheTag(HOSTING_TIER_TAG);
  const [weekly, collections, blogPosts, hosting, comparisons] = await Promise.all([
    listWeeklyIssues(),
    listCollections(),
    listPublishedBlogPosts(),
    loadPublicTier(),
    availableComparisons(),
  ]);
  const hostingGames = publicGames(hosting.tier);
  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1.0 },
    { url: `${SITE_URL}/standards`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/free-games`, changeFrequency: "daily", priority: 0.9 },
    // Ranked just below /free-games on purpose: /free-games is the canonical list
    // for the giveaway queries and /deals only previews it.
    { url: `${SITE_URL}/deals`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/weekly`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/blog`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/discover`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/collections`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/mods`, changeFrequency: "weekly", priority: 0.7 },
    // The hubs that link the /alternatives/* and /compare/* pages.
    { url: `${SITE_URL}/alternatives`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/compare`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/gear`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/multiplayer`, changeFrequency: "hourly", priority: 0.8 },
    { url: `${SITE_URL}/connect`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/hosting`, changeFrequency: "weekly", priority: 0.8 },
    ...hostingGames.map((g) => ({ url: `${SITE_URL}/hosting/${g.gameSlug}`, changeFrequency: "monthly" as const, priority: 0.7 })),
    { url: `${SITE_URL}/play-with-friends`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/guides`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/guides/lan-over-internet`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/guides/phone-as-controller`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/launcher`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/open-platform`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/developers`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/community`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${SITE_URL}/events`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${SITE_URL}/events/create`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/submit-game`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.2 },
    ...weekly.map((i) => ({
      url: `${SITE_URL}/weekly/${i.slug}`,
      changeFrequency: "yearly" as const,
      priority: 0.7,
      ...lastMod(i.publishedAt),
    })),
    ...blogPosts.map((post) => ({
      url: `${SITE_URL}/blog/${post.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.6,
      ...lastMod(post.updatedAt || post.publishedAt),
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
    // The managed list, not the static seed: the database is the source of truth.
    ...collections.map((c) => ({
      url: `${SITE_URL}/collections/${c.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}

async function gamesSection(): Promise<Entries> {
  "use cache";
  cacheLife("hours");
  cacheTag("catalog");
  const games = await listGames();
  return games.map((g) => ({
    url: `${SITE_URL}/games/${g.slug}`,
    changeFrequency: "weekly" as const,
    priority: 0.8,
    ...lastMod(g.qualityBar?.lastVerified),
  }));
}

/*
 * Editions and the play-with-friends pages hang off a game, so they share one
 * section and one game list. Individual event pages are deliberately absent:
 * they go stale within days and each one is noindex.
 */
async function editionsSection(): Promise<Entries> {
  "use cache";
  cacheLife("hours");
  cacheTag("catalog");
  cacheTag("editions");
  const [{ slugs, games }, editions] = await Promise.all([gameSlugs(), listAllPublicEditions()]);
  // Only real, active editions are indexed. Unlisted, draft and hidden ones, and
  // the generated Official edition that would duplicate its game page, are not.
  const editionRoutes = editions
    .filter((e) => slugs.has(e.gameSlug) && (e.status === "active" || e.status === "coming_soon"))
    .map((e) => ({
      url: `${SITE_URL}/games/${e.gameSlug}/editions/${e.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
      ...lastMod(e.updatedAt),
    }));
  // Same gate the page itself uses: a curated multiplayer adapter and a live game.
  const playWithFriends = games
    .filter((g) => g.slug in MULTIPLAYER_ADAPTERS)
    .map((g) => ({
      url: `${SITE_URL}/play-with-friends/${g.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.7,
      ...lastMod(g.qualityBar?.lastVerified),
    }));
  return [...editionRoutes, ...playWithFriends];
}

async function modsSection(): Promise<Entries> {
  "use cache";
  cacheLife("hours");
  cacheTag("catalog");
  cacheTag("mods");
  const [{ slugs }, mods] = await Promise.all([gameSlugs(), listMods({ view: "card" })]);
  // A mod's status is independent of its base game's, so a published mod can hang
  // off a game that is not publicly visible. /mods drops those from the grid, so
  // they are not advertised here either.
  return mods
    .filter((m) => slugs.has(m.baseGameSlug))
    .map((m) => ({
      url: `${SITE_URL}/mods/${m.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.5,
      ...lastMod(m.updatedAt),
    }));
}

async function gearSection(): Promise<Entries> {
  "use cache";
  cacheLife("hours");
  cacheTag("gear");
  const gear = await listPublishedGear();
  return [
    // Category hubs, derived from what is published: an empty category 404s.
    ...[...new Set(gear.map((g) => g.category.toLowerCase()))].map((category) => ({
      url: `${SITE_URL}/gear/${category}`,
      changeFrequency: "weekly" as const,
      priority: 0.6,
      ...lastMod(newestUpdate(gear.filter((g) => g.category.toLowerCase() === category))),
    })),
    ...gear.map((g) => ({
      url: `${SITE_URL}/gear/${g.category.toLowerCase()}/${g.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.5,
      ...lastMod(g.updatedAt),
    })),
  ];
}

async function developersSection(): Promise<Entries> {
  "use cache";
  cacheLife("hours");
  cacheTag("catalog");
  const [{ games }, developers] = await Promise.all([gameSlugs(), listDevelopers()]);
  const datesByDeveloper = new Map<string, { updatedAt?: string }[]>();
  for (const g of games) {
    const bucket = datesByDeveloper.get(g.developerSlug) || [];
    bucket.push({ updatedAt: g.qualityBar?.lastVerified });
    datesByDeveloper.set(g.developerSlug, bucket);
  }
  // Only developers with a published game; the page is nothing but that list.
  return developers
    .filter((d) => datesByDeveloper.has(d.slug))
    .map((d) => ({
      url: `${SITE_URL}/developers/${d.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.5,
      ...lastMod(newestUpdate(datesByDeveloper.get(d.slug) || [])),
    }));
}

const BUILDERS: Record<SitemapSection, () => Promise<Entries>> = {
  pages: pagesSection,
  games: gamesSection,
  editions: editionsSection,
  mods: modsSection,
  gear: gearSection,
  developers: developersSection,
};

export function buildSitemapSection(section: SitemapSection): Promise<Entries> {
  return BUILDERS[section]();
}

const escapeXml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const toIso = (value: string | Date | undefined) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export function renderUrlset(entries: Entries): string {
  const rows = entries.map((entry) => {
    const modified = toIso(entry.lastModified);
    return (
      "<url>" +
      `<loc>${escapeXml(entry.url)}</loc>` +
      (modified ? `<lastmod>${modified}</lastmod>` : "") +
      (entry.changeFrequency ? `<changefreq>${entry.changeFrequency}</changefreq>` : "") +
      (typeof entry.priority === "number" ? `<priority>${entry.priority.toFixed(1)}</priority>` : "") +
      "</url>"
    );
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${rows.join("")}</urlset>\n`;
}

export function renderSitemapIndex(): string {
  const rows = SITEMAP_SECTIONS.map((section) => `<sitemap><loc>${SITE_URL}/sitemaps/${section}.xml</loc></sitemap>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${rows.join("")}</sitemapindex>\n`;
}
