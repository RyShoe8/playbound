/**
 * Review outlets PlayBound reads directly, beyond Wikipedia's tables.
 *
 * Two ways in, depending on what the outlet publishes:
 * - "search": the site has a search we can query per game (a WordPress search
 *   feed or REST search, a Blogger search feed). Covers the back catalogue.
 * - "feed": only a latest-items feed. Checked on every run, so new reviews of
 *   catalogue games are picked up as they are published.
 *
 * The score is read from the review page itself: schema.org reviewRating when
 * the outlet publishes it, otherwise the outlet's own score markup, which is
 * site-specific and so lives here with its scale. Outlets behind bot checks
 * (Adrenaline, GameStar) or with neither search nor feed (GAMES.CH,
 * Oyungezer) are not listed; add their reviews by hand.
 */

export interface ScorePattern {
  /** First capture group is the number; `,` decimals are accepted. */
  pattern: RegExp;
  max: number;
}

export interface Outlet {
  name: string;
  /** Origin, no trailing slash. */
  base: string;
  /**
   * "wp": WordPress — both the REST search (ranked by relevance) and the search
   * feed (which also covers custom review post types the REST API hides).
   */
  search?: "wp" | "wp-rest" | "blogger";
  /** Latest-items feed for outlets without a usable search. */
  feed?: string;
  /** Only links matching this are reviews (some sites mix news into search). */
  reviewUrl?: RegExp;
  /** Site-specific score markup, tried after schema.org reviewRating. */
  scores?: ScorePattern[];
  /** The outlet does not score reviews; list them unscored. */
  unscored?: boolean;
}

export const OUTLETS: Outlet[] = [
  { name: "COGconnected", base: "https://cogconnected.com", search: "wp", reviewUrl: /\/review\//, scores: [{ pattern: /class="score-overlay">\s*([\d.]+)/, max: 100 }] },
  { name: "Final Weapon", base: "https://finalweapon.net", search: "wp", scores: [{ pattern: /td-review-final-score">\s*([\d.]+)/, max: 5 }] },
  { name: "What's It Like?", base: "https://www.whatsitlike.com.au", search: "wp", scores: [{ pattern: /class="score_value">\s*([\d.]+)/, max: 100 }] },
  { name: "GamersRD", base: "https://gamersrd.com", search: "wp", scores: [{ pattern: /td-review-final-score">\s*([\d.]+)/, max: 10 }] },
  { name: "Pocket Tactics", base: "https://www.pockettactics.com", search: "wp" },
  { name: "Nintendo Insider", base: "https://www.nintendo-insider.com", search: "wp" },
  { name: "The Games Machine", base: "https://www.thegamesmachine.it", search: "wp" },
  { name: "Wccftech", base: "https://wccftech.com", search: "wp", reviewUrl: /\/review\// },
  { name: "Cubed3", base: "https://www.cubed3.com", search: "wp-rest", reviewUrl: /\/reviews\// },
  { name: "Areajugones", base: "https://areajugones.sport.es", search: "wp" },
  { name: "GameBlast", base: "https://www.gameblast.com.br", search: "blogger", scores: [{ pattern: /Nota:\s*([\d.,]+)/, max: 10 }] },
  { name: "Multiplayer.it", base: "https://multiplayer.it", feed: "https://multiplayer.it/feed/rss/homepage/", reviewUrl: /\/recensioni\//, scores: [{ pattern: /class="box-multi[\s\S]{0,600}?<strong>\s*([\d.,]+)/, max: 10 }] },
  { name: "Gamesurf", base: "https://www.gamesurf.it", feed: "https://www.gamesurf.it/feed/", reviewUrl: /\/recensioni\// },
  { name: "Polygon", base: "https://www.polygon.com", feed: "https://www.polygon.com/rss/index.xml", unscored: true },
  { name: "Nintendo World Report", base: "https://www.nintendoworldreport.com", feed: "https://www.nintendoworldreport.com/rss/", reviewUrl: /\/review\//, unscored: true },
  { name: "IGN Benelux", base: "https://nl.ign.com", feed: "https://nl.ign.com/feed.xml" },
];

/** Words outlets use for "review" in a title or URL, across their languages. */
export const REVIEW_MARKER = /\b(review|recensione|recensioni|análisis|analisis|análise|analise|reseña|resena|inceleme|critique|test)\b/i;

const PLATFORM_WORDS =
  /\b(nintendo switch \d|nintendo switch|switch \d|switch|steam deck|steam|playstation \d|ps4|ps5|xbox series x\|?s|xbox series [xs]|xbox one|xbox|pc|mac|linux|ios|android)\b/gi;

/**
 * The game a review headline is about, with the review marker, platforms and
 * the tagline removed: "Football Manager 2027 Review – Tactically Effective"
 * → "Football Manager 2027"; "Análisis de Football Manager 27: la redención"
 * → "Football Manager 27".
 */
export function reviewSubject(headline: string): string {
  let t = headline
    .replace(/&#8211;|&#8212;|&ndash;|&mdash;/g, "–")
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, "")
    .trim();
  t = t.replace(/^(análisis|analisis|reseña|resena|recensione|review|test|critique)\s+(de|di|of|du)\s+/i, "");
  // Taglines follow a dash, a pipe or a colon *after* the review marker.
  const marker = t.search(REVIEW_MARKER);
  if (marker >= 0) {
    const after = t.slice(marker).search(/\s[–—|-]\s|:\s/);
    if (after >= 0) t = t.slice(0, marker + after);
  } else {
    const dash = t.search(/\s[–—|]\s/);
    if (dash >= 0) t = t.slice(0, dash);
  }
  // "Análisis de X: tagline" puts the tagline after a colon with no marker left.
  if (!REVIEW_MARKER.test(t)) t = t.replace(/:\s.+$/, "");
  return t
    .replace(new RegExp(REVIEW_MARKER.source, "gi"), " ")
    .replace(PLATFORM_WORDS, " ")
    .replace(/\s+/g, " ")
    .replace(/[\s:–—/|-]+$/, "")
    .trim();
}

export interface PageFacts {
  score: number | null;
  scoreMax: number | null;
  snippet: string | null;
  author: string | null;
  publishedAt: Date | null;
}

function num(s: string): number {
  return Number(s.replace(",", "."));
}

function meta(html: string, name: string): string | null {
  return (
    html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']+)["']`, "i"))?.[1] ??
    html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${name}["']`, "i"))?.[1] ??
    null
  );
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#8217;/g, "'")
    .replace(/&#8211;|&#8212;/g, "–")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Score, snippet, author and date from a review page's HTML. Pure. */
export function readReviewPage(html: string, outlet: Outlet): PageFacts {
  let score: number | null = null;
  let scoreMax: number | null = null;
  if (!outlet.unscored) {
    const ld = html.match(/"reviewRating"\s*:\s*\{([^}]*)\}/);
    if (ld) {
      const value = ld[1].match(/"ratingValue"\s*:\s*"?([\d.,]+)/)?.[1];
      const best = ld[1].match(/"bestRating"\s*:\s*"?([\d.,]+)/)?.[1];
      if (value && best && num(best) > 0 && num(value) <= num(best)) {
        score = num(value);
        scoreMax = num(best);
      }
    }
    if (score == null) {
      for (const p of outlet.scores ?? []) {
        const m = html.match(p.pattern);
        if (m && num(m[1]) <= p.max) {
          score = num(m[1]);
          scoreMax = p.max;
          break;
        }
      }
    }
  }
  const rawSnippet = meta(html, "og:description") ?? meta(html, "twitter:description") ?? meta(html, "description");
  let snippet = rawSnippet ? decode(rawSnippet) : null;
  if (snippet && snippet.length < 20) snippet = null;
  if (snippet && snippet.length > 300) snippet = `${snippet.slice(0, 297).replace(/\s+\S*$/, "")}…`;
  const author =
    meta(html, "author") ??
    html.match(/"author"\s*:\s*(?:\[\s*)?\{[^}]*"name"\s*:\s*"([^"]+)"/)?.[1] ??
    null;
  const dateRaw = meta(html, "article:published_time") ?? html.match(/"datePublished"\s*:\s*"([^"]+)"/)?.[1] ?? null;
  const date = dateRaw ? new Date(dateRaw) : null;
  return {
    score,
    scoreMax,
    snippet,
    author: author ? decode(author).slice(0, 80) : null,
    publishedAt: date && !Number.isNaN(date.getTime()) ? date : null,
  };
}

export interface FeedItem {
  title: string;
  url: string;
}

/** Items from an RSS or Atom document. Pure. */
export function parseFeed(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  for (const m of xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)) {
    const block = m[0];
    const title = block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1];
    const url =
      block.match(/<link>(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?<\/link>/i)?.[1] ??
      block.match(/<link[^>]+rel=["']alternate["'][^>]*href=["']([^"']+)["']/i)?.[1] ??
      block.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1];
    if (title && url) items.push({ title: decode(title), url: url.trim() });
  }
  return items;
}

/** The search URLs for a game on an outlet; empty when it has no search. */
export function searchUrls(outlet: Outlet, query: string): string[] {
  const q = encodeURIComponent(query);
  const rest = `${outlet.base}/wp-json/wp/v2/search?search=${q}&per_page=30&subtype=any`;
  switch (outlet.search) {
    case "wp":
      return [rest, `${outlet.base}/feed/?s=${q}`];
    case "wp-rest":
      return [rest];
    case "blogger":
      return [`${outlet.base}/feeds/posts/default?q=${q}&alt=rss&max-results=25`];
    default:
      return [];
  }
}

/** The headline a review URL's last path segment spells out ("football-manager-27-recensione"). */
export function slugHeadline(url: string): string {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    const last = (parts.at(-1) ?? "").replace(/\.html?$/, "");
    return decodeURIComponent(last).replace(/[-_]+/g, " ").trim();
  } catch {
    return "";
  }
}
