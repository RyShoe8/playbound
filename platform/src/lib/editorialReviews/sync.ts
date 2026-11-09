import dbConnect from "@/lib/db";
import EditorialReview from "@/lib/models/EditorialReview";
import EditorialReviewSource from "@/lib/models/EditorialReviewSource";
import {
  hasReviewsTable,
  isVideoGameArticle,
  parseVideoGameReviews,
  releasedAround,
  type ParsedReview,
} from "@/lib/editorialReviews/wikipedia";
import {
  OUTLETS,
  REVIEW_MARKER,
  parseFeed,
  readReviewPage,
  reviewSubject,
  searchUrls,
  slugHeadline,
  type FeedItem,
  type Outlet,
} from "@/lib/editorialReviews/outlets";

/**
 * Automated Editorial Rating sync: find the target's Wikipedia article, read
 * its reviews table, and add any outlet review PlayBound does not have yet.
 *
 * Rules that keep it safe to run unattended:
 * - It only ever inserts new rows and refreshes the score fields of rows it
 *   created itself. Manual entries are never touched.
 * - Status is set on insert only, so a review an admin hid stays hidden, and
 *   deleting an automated review hides it instead (see the DELETE route) so
 *   the next run does not bring it back.
 * - A review that disappears from the article is left in place; removals are
 *   an editorial decision, not a sync side effect.
 */

const USER_AGENT = "PlayBound/1.0 (https://playbound.club; editorial review sync)";
const WIKI_API = "https://en.wikipedia.org/w/api.php";

export interface SyncTarget {
  gameSlug: string;
  /** null for the base game. */
  editionSlug: string | null;
  /** The title the article should carry: the game's or the edition's. */
  title: string;
  releaseYear?: number | null;
}

export interface SyncResult {
  gameSlug: string;
  editionSlug: string | null;
  status: "ok" | "no-article" | "no-table" | "error" | "disabled";
  article: string | null;
  found: number;
  added: number;
  updated: number;
  /** Outlets whose own site had a review of this target this run (not Wikipedia). */
  outletFound?: number;
  message?: string;
}

async function fetchWikitext(title: string): Promise<{ title: string; text: string } | null> {
  const url = `${WIKI_API}?action=parse&page=${encodeURIComponent(title)}&prop=wikitext&redirects=1&format=json&formatversion=2`;
  let res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(8_000) });
  // Wikimedia rate limits bursts; one polite retry, then treat it as a miss.
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, Number(res.headers.get("retry-after") ?? 2) * 1000));
    res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(8_000) });
  }
  if (res.status === 429) throw new Error("Wikipedia rate limited the sync");
  if (!res.ok) return null;
  const json = (await res.json()) as { parse?: { title: string; wikitext: string } };
  return json.parse ? { title: json.parse.title, text: json.parse.wikitext } : null;
}

/** Lower-case, no punctuation, no "(video game)" disambiguator. */
export function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s*\((?:\d{4} )?video game\)\s*$/, "")
    .replace(/[™®:–—\-'’.!,&]/g, " ")
    // "Thief 2" and "Thief II" are the same title.
    .replace(/\b(2|3|4|5)\b/g, (n) => ({ "2": "ii", "3": "iii", "4": "iv", "5": "v" })[n] ?? n)
    .replace(/\s+/g, " ")
    .trim();
}

/** Article titles the search engine offers for a name — catches case and wording differences. */
async function searchTitles(name: string): Promise<string[]> {
  const url = `${WIKI_API}?action=query&list=search&srsearch=${encodeURIComponent(`${name} video game`)}&srnamespace=0&srlimit=6&format=json&formatversion=2`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!res?.ok) return [];
  const json = (await res.json()) as { query?: { search?: { title: string }[] } };
  return (json.query?.search ?? []).map((r) => r.title);
}

/** Trademark marks removed; nothing else changes. */
function cleanTitle(title: string): string {
  return title.replace(/[™®©]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Re-release packaging that names the same game ("Deus Ex GOTY Edition",
 * "Dungeon Keeper Gold", "Quake II Enhanced"). Only these suffixes are
 * stripped: a remake or fan port with its own name is a different game and
 * must not inherit the original's reviews, which is also why catalog aliases
 * ("Tiberian Sun" on OpenTS) are never used for matching.
 */
const RERELEASE_SUFFIX =
  /[\s:–-]+(?:GOTY(?: Edition)?|Game of the Year(?: Edition)?|Gold(?: Edition)?|Platinum(?: Edition)?|Complete(?: Edition)?|Classic Complete|Anthology|Enhanced(?: Edition)?|Remastered|HD|War Chest|[\w']+ Edition)$/i;

export function titleCandidates(title: string): string[] {
  const clean = cleanTitle(title);
  const stripped = clean.replace(RERELEASE_SUFFIX, "").trim();
  return [...new Set([clean, stripped].filter(Boolean))];
}

/**
 * The article for a target. A pinned title is trusted; otherwise only an
 * article whose title is this game's own name, that is a video game article,
 * and whose release year agrees is accepted — a wrong article would put
 * another game's reviews on this page, which is worse than none.
 */
export async function findArticle(target: SyncTarget, pinned: string | null) {
  if (pinned) {
    const page = await fetchWikitext(pinned);
    return page ? { ...page, pinned: true } : null;
  }
  for (const name of titleCandidates(target.title)) {
    const pages = [
      target.releaseYear ? `${name} (${target.releaseYear} video game)` : null,
      `${name} (video game)`,
      name,
    ].filter((t): t is string => Boolean(t));
    const tried = new Set<string>();
    const attempt = async (candidate: string) => {
      if (tried.has(candidate)) return null;
      tried.add(candidate);
      const page = await fetchWikitext(candidate).catch(() => null);
      if (!page || !isVideoGameArticle(page.text)) return null;
      if (normalizeTitle(page.title) !== normalizeTitle(name)) return null;
      if (target.releaseYear && !releasedAround(page.text, target.releaseYear)) return null;
      return { ...page, pinned: false };
    };
    for (const candidate of pages) {
      const hit = await attempt(candidate);
      if (hit) return hit;
    }
    // Only search results whose title already matches are fetched.
    for (const candidate of await searchTitles(name)) {
      if (normalizeTitle(candidate) !== normalizeTitle(name)) continue;
      const hit = await attempt(candidate);
      if (hit) return hit;
    }
  }
  return null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/g, " ");
}

/**
 * The outlet's own one-line summary of the review (its share description),
 * used as the snippet. Bounded in time and size; any failure means no snippet.
 */
export async function fetchSnippet(url: string): Promise<string | null> {
  if (/archive\.org\/details\//.test(url)) return null; // scanned magazine pages have none
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;
    const html = (await res.text()).slice(0, 400_000);
    const meta = (name: string) =>
      html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']+)["']`, "i"))?.[1] ??
      html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${name}["']`, "i"))?.[1];
    const raw = meta("og:description") ?? meta("twitter:description") ?? meta("description");
    if (!raw) return null;
    const text = decodeEntities(raw).replace(/\s+/g, " ").trim();
    if (text.length < 20) return null;
    if (text.length <= 300) return text;
    return `${text.slice(0, 297).replace(/\s+\S*$/, "")}…`;
  } catch {
    return null;
  }
}

async function upsertReviews(target: SyncTarget, article: string, rows: ParsedReview[], snippetBudget: { left: number }) {
  let added = 0;
  let updated = 0;
  for (const row of rows) {
    const key = { gameSlug: target.gameSlug, editionSlug: target.editionSlug, url: row.url };
    const existing = await EditorialReview.findOne(key).select("source snippet").lean<{ source?: string; snippet?: string | null }>();
    const scoreFields = {
      outlet: row.outlet.slice(0, 80),
      author: row.author?.slice(0, 80) ?? null,
      score: row.score,
      scoreMax: row.scoreMax,
      scoreText: row.scoreText,
      publishedAt: row.publishedAt,
      sourceRef: article,
    };
    if (!existing && (await sameOutletExists(target, row.outlet))) continue;
    if (existing) {
      if (existing.source !== "wikipedia") continue; // an admin's entry wins
      const $set: Record<string, unknown> = { ...scoreFields };
      if (!existing.snippet && snippetBudget.left > 0) {
        snippetBudget.left--;
        const snippet = await fetchSnippet(row.url);
        if (snippet) $set.snippet = snippet;
      }
      await EditorialReview.updateOne(key, { $set });
      updated++;
      continue;
    }
    let snippet: string | null = null;
    if (snippetBudget.left > 0) {
      snippetBudget.left--;
      snippet = await fetchSnippet(row.url);
    }
    await EditorialReview.updateOne(
      key,
      { $setOnInsert: { ...key, ...scoreFields, snippet, source: "wikipedia", status: "published" } },
      { upsert: true }
    );
    added++;
  }
  return { added, updated };
}

/**
 * One review per outlet per target: Wikipedia and the outlet's own site can
 * both point at the same review under slightly different URLs.
 */
async function sameOutletExists(target: SyncTarget, outlet: string): Promise<boolean> {
  const escaped = outlet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const hit = await EditorialReview.exists({
    gameSlug: target.gameSlug,
    editionSlug: target.editionSlug,
    outlet: { $regex: `^${escaped}$`, $options: "i" },
  });
  return Boolean(hit);
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, redirect: "follow", signal: AbortSignal.timeout(6_000) });
    if (!res.ok) return null;
    return (await res.text()).slice(0, 600_000);
  } catch {
    return null;
  }
}

/**
 * Whether an outlet's headline is a review of this game: it must read as a
 * review, and once the marker, platforms and tagline are removed what is left
 * must be the game's own title — so "Hollow Knight: Silksong review" is never
 * filed under Hollow Knight.
 */
export function isReviewOf(item: FeedItem, outlet: Pick<Outlet, "reviewUrl">, title: string): boolean {
  if (outlet.reviewUrl && !outlet.reviewUrl.test(item.url)) return false;
  if (!REVIEW_MARKER.test(item.title) && !REVIEW_MARKER.test(item.url)) return false;
  const wanted = titleCandidates(title).map(normalizeTitle);
  // The headline first; the URL slug when the headline is empty or decorative.
  for (const headline of [item.title, slugHeadline(item.url)]) {
    const subject = reviewSubject(headline);
    if (!subject) continue;
    if (titleCandidates(subject).some((c) => wanted.includes(normalizeTitle(c)))) return true;
  }
  return false;
}

export async function searchOutlet(outlet: Outlet, query: string): Promise<FeedItem[]> {
  const found = new Map<string, FeedItem>();
  for (const url of searchUrls(outlet, query)) {
    const body = await fetchText(url);
    if (!body) continue;
    let items: FeedItem[] = [];
    if (url.includes("/wp-json/")) {
      try {
        const hits = JSON.parse(body) as { url?: string; title?: string }[];
        if (Array.isArray(hits)) items = hits.filter((h) => h.url && h.title != null).map((h) => ({ url: h.url!, title: h.title! }));
      } catch {
        items = [];
      }
    } else {
      items = parseFeed(body);
    }
    for (const item of items) if (!found.has(item.url)) found.set(item.url, item);
  }
  return [...found.values()];
}

/** Read a matched review page and add it if this target has nothing from that outlet yet. */
async function addOutletReview(target: SyncTarget, outlet: Outlet, item: FeedItem): Promise<boolean> {
  const key = { gameSlug: target.gameSlug, editionSlug: target.editionSlug, url: item.url };
  if (await EditorialReview.exists(key)) return false;
  if (await sameOutletExists(target, outlet.name)) return false;
  const html = await fetchText(item.url);
  if (!html) return false;
  const facts = readReviewPage(html, outlet);
  await EditorialReview.updateOne(
    key,
    {
      $setOnInsert: {
        ...key,
        outlet: outlet.name,
        author: facts.author,
        score: facts.score,
        scoreMax: facts.scoreMax,
        scoreText: null,
        publishedAt: facts.publishedAt,
        snippet: facts.snippet,
        source: "outlet",
        sourceRef: outlet.base,
        status: "published",
      },
    },
    { upsert: true }
  );
  return true;
}

/** Search every searchable outlet for this target's reviews, in parallel across sites. */
/** Outlet searches for one target give up after this long; a slow site must not stall the run. */
const OUTLET_SEARCH_DEADLINE_MS = 25_000;

export async function syncOutletSearch(target: SyncTarget): Promise<{ found: number; added: number }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<{ found: number; added: number }>((resolve) => {
    timer = setTimeout(() => resolve({ found: 0, added: 0 }), OUTLET_SEARCH_DEADLINE_MS);
  });
  try {
    return await Promise.race([searchAllOutlets(target), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

async function searchAllOutlets(target: SyncTarget): Promise<{ found: number; added: number }> {
  const query = titleCandidates(target.title).at(-1) ?? target.title;
  const perOutlet = await Promise.all(
    OUTLETS.filter((o) => o.search).map(async (outlet) => {
      const items = (await searchOutlet(outlet, query)).filter((i) => isReviewOf(i, outlet, target.title));
      let added = 0;
      for (const item of items.slice(0, 2)) if (await addOutletReview(target, outlet, item)) added++;
      return { found: items.length > 0 ? 1 : 0, added };
    })
  );
  return perOutlet.reduce((a, b) => ({ found: a.found + b.found, added: a.added + b.added }), { found: 0, added: 0 });
}

/**
 * Feed-only outlets: read each latest-items feed once and file any review of
 * a catalogue game or edition. Cheap enough to run on every cron pass.
 */
export async function syncOutletFeeds(
  targets: SyncTarget[],
  { maxPages = 15 }: { maxPages?: number } = {}
): Promise<{ gameSlug: string; outlet: string }[]> {
  await dbConnect();
  const feeds = await Promise.all(
    OUTLETS.filter((o) => o.feed).map(async (outlet) => ({ outlet, items: parseFeed((await fetchText(outlet.feed!)) ?? "") }))
  );
  const added: { gameSlug: string; outlet: string }[] = [];
  let pages = 0;
  for (const { outlet, items } of feeds) {
    for (const item of items) {
      const target = targets.find((t) => isReviewOf(item, outlet, t.title));
      if (!target || pages >= maxPages) continue;
      pages++;
      if (await addOutletReview(target, outlet, item)) added.push({ gameSlug: target.gameSlug, outlet: outlet.name });
    }
  }
  return added;
}

/** Sync one game or edition. Never throws; the result says what happened. */
export async function syncEditorialReviews(
  target: SyncTarget,
  { snippetBudget = { left: 12 }, outlets = true }: { snippetBudget?: { left: number }; outlets?: boolean } = {}
): Promise<SyncResult> {
  await dbConnect();
  const base = { gameSlug: target.gameSlug, editionSlug: target.editionSlug };
  const source = await EditorialReviewSource.findOne(base).lean<{ wikipediaTitle?: string | null; disabled?: boolean }>();
  if (source?.disabled) return { ...base, status: "disabled", article: null, found: 0, added: 0, updated: 0 };

  /*
   * Claim the target before doing any work. If the run is cut off mid-target,
   * it is then no longer "never synced" and the next run moves on, instead of
   * starting with the same slow target and stalling forever.
   */
  await EditorialReviewSource.updateOne(
    base,
    { $set: { lastSyncAt: new Date(), lastStatus: "running" }, $setOnInsert: base },
    { upsert: true }
  );

  let result: SyncResult;
  try {
    const page = await findArticle(target, source?.wikipediaTitle ?? null);
    if (!page) {
      result = { ...base, status: "no-article", article: null, found: 0, added: 0, updated: 0 };
    } else if (!hasReviewsTable(page.text)) {
      result = { ...base, status: "no-table", article: page.title, found: 0, added: 0, updated: 0 };
    } else {
      const rows = parseVideoGameReviews(page.text);
      const { added, updated } = await upsertReviews(target, page.title, rows, snippetBudget);
      result = { ...base, status: "ok", article: page.title, found: rows.length, added, updated };
    }
  } catch (err) {
    result = { ...base, status: "error", article: null, found: 0, added: 0, updated: 0, message: String(err).slice(0, 400) };
  }
  if (outlets) {
    const direct = await syncOutletSearch(target).catch(() => ({ found: 0, added: 0 }));
    result.outletFound = direct.found;
    result.added += direct.added;
  }

  await EditorialReviewSource.updateOne(
    base,
    {
      $set: {
        lastSyncAt: new Date(),
        lastStatus: result.status,
        lastMessage: result.message ?? null,
        matchedTitle: result.article,
        foundCount: result.found,
        outletCount: result.outletFound ?? 0,
      },
      $setOnInsert: base,
    },
    { upsert: true }
  );
  return result;
}
