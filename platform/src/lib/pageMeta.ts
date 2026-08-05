/** Shared HTML / Open Graph helpers for admin import + media fetch. */

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function metaContent(html: string, key: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${key}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${key}["']`, "i"),
    new RegExp(`<meta[^>]+name=["']${key}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${key}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

function absoluteUrl(base: string, maybeRelative: string): string {
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return maybeRelative;
  }
}

export interface PageMeta {
  title: string;
  description: string;
  images: string[];
  videos: string[];
  siteName: string | null;
}

export type PageMetaResult =
  | { ok: true; meta: PageMeta; via: "direct" | "jina" }
  | { ok: false; reason: "blocked" | "failed"; status?: number; message: string };

/** Thrown when a site WAF/bot checkpoint blocks scraping after all fallbacks. */
export class PageFetchBlockedError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "PageFetchBlockedError";
    this.status = status;
  }
}

/** Hostnames that must never be reachable through an admin-supplied URL. */
const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "metadata.google.internal",
]);

const BROWSER_HEADERS: Record<string, string> = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
};

/**
 * Rejects anything that is not a public http(s) endpoint.
 *
 * These importers take an operator-supplied URL, so a compromised or phished
 * admin session would otherwise be able to make the server read internal
 * addresses — cloud metadata, private ranges, or link-local — and return the
 * response body to the browser.
 */
export function assertPublicHttpUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http(s) URLs are allowed");
  }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTS.has(host) || host.endsWith(".localhost") || host.endsWith(".internal")) {
    throw new Error("That host is not allowed");
  }
  // Literal private / loopback / link-local addresses.
  if (
    /^10\./.test(host) ||
    /^127\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^(fc|fd|fe80)/i.test(host)
  ) {
    throw new Error("That host is not allowed");
  }
  return parsed;
}

function looksLikeCheckpoint(html: string): boolean {
  if (/Vercel Security Checkpoint|Just a moment…|Attention Required|cf-browser-verification|captcha-delivery/i.test(html)) {
    return true;
  }
  return false;
}

function metaIsUsable(meta: PageMeta): boolean {
  const title = meta.title.trim();
  if (!title) return false;
  if (/security checkpoint|just a moment|access denied|attention required/i.test(title)) return false;
  return true;
}

function parsePageMeta(html: string, finalUrl: string): PageMeta {
  const ogTitle = metaContent(html, "og:title");
  const twTitle = metaContent(html, "twitter:title");
  const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  const title = (ogTitle || twTitle || titleTag || "").slice(0, 120);

  const ogDesc = metaContent(html, "og:description");
  const twDesc = metaContent(html, "twitter:description");
  const metaDesc = metaContent(html, "description");
  const description = (ogDesc || twDesc || metaDesc || "").slice(0, 8000);

  const images: string[] = [];
  for (const key of ["og:image", "twitter:image", "twitter:image:src"]) {
    const raw = metaContent(html, key);
    if (raw) {
      const abs = absoluteUrl(finalUrl, raw);
      if (!images.includes(abs)) images.push(abs);
    }
  }

  const videos: string[] = [];
  for (const key of ["og:video", "og:video:url", "og:video:secure_url", "twitter:player:stream"]) {
    const raw = metaContent(html, key);
    if (raw) {
      const abs = absoluteUrl(finalUrl, raw);
      if (!videos.includes(abs)) videos.push(abs);
    }
  }

  return {
    title,
    description,
    images,
    videos,
    siteName: metaContent(html, "og:site_name"),
  };
}

function parseJinaMarkdown(text: string, sourceUrl: string): PageMeta | null {
  const titleMatch = text.match(/^Title:\s*(.+)$/im);
  const title = (titleMatch?.[1] || "").trim().slice(0, 120);
  if (!title || /security checkpoint|just a moment|access denied/i.test(title)) return null;

  const descMatch =
    text.match(/^Description:\s*(.+)$/im) ||
    text.match(/Markdown Content:\s*([\s\S]+)/i);
  let description = (descMatch?.[1] || "").trim();
  // Drop Jina chrome lines
  description = description
    .replace(/^URL Source:.*$/gim, "")
    .replace(/^Warning:.*$/gim, "")
    .replace(/^Title:.*$/gim, "")
    .trim()
    .slice(0, 8000);
  if (/security checkpoint/i.test(description) && description.length < 200) return null;

  const images: string[] = [];
  for (const m of text.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g)) {
    if (m[1] && !images.includes(m[1])) images.push(m[1]);
    if (images.length >= 8) break;
  }

  return {
    title,
    description,
    images,
    videos: [],
    siteName: null,
  };
}

async function fetchDirectHtml(url: URL): Promise<{ status: number; html: string; finalUrl: string } | null> {
  try {
    let current = url;
    // Manual redirects so each hop is re-validated as a public URL.
    for (let hop = 0; hop < 4; hop += 1) {
      const res = await fetch(current.toString(), {
        headers: BROWSER_HEADERS,
        next: { revalidate: 0 },
        redirect: "manual",
        signal: AbortSignal.timeout(12_000),
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) return { status: res.status, html: "", finalUrl: current.toString() };
        current = assertPublicHttpUrl(new URL(location, current).toString());
        continue;
      }

      const html = await res.text();
      return { status: res.status, html, finalUrl: res.url || current.toString() };
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchViaJina(url: URL): Promise<PageMeta | null> {
  try {
    const jinaUrl = `https://r.jina.ai/${url.toString()}`;
    const res = await fetch(jinaUrl, {
      headers: {
        "user-agent": "PlayBoundAdmin/1.0 (+https://playbound.club)",
        accept: "text/plain",
      },
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    return parseJinaMarkdown(text, url.toString());
  } catch {
    return null;
  }
}

/**
 * Fetch Open Graph / page meta for an admin-supplied URL.
 *
 * Tries a direct browser-like fetch first, then Jina reader. Callers that want
 * a soft draft on WAF blocks should use {@link tryFetchPageMeta} instead.
 */
export async function fetchPageMeta(url: string): Promise<PageMeta> {
  const result = await tryFetchPageMeta(url);
  if (result.ok) return result.meta;
  if (result.reason === "blocked") {
    throw new PageFetchBlockedError(result.message, result.status);
  }
  throw new Error(result.message);
}

/** Same as {@link fetchPageMeta} but returns a result instead of throwing on scrape failure. */
export async function tryFetchPageMeta(url: string): Promise<PageMetaResult> {
  const safe = assertPublicHttpUrl(url);

  const direct = await fetchDirectHtml(safe);
  if (direct) {
    const blockedStatus = direct.status === 429 || direct.status === 403 || direct.status === 503;
    const checkpoint = looksLikeCheckpoint(direct.html);
    if (direct.status >= 200 && direct.status < 300 && !checkpoint) {
      const meta = parsePageMeta(direct.html, direct.finalUrl);
      if (metaIsUsable(meta)) {
        return { ok: true, meta, via: "direct" };
      }
    }

    const jina = await fetchViaJina(safe);
    if (jina && metaIsUsable(jina)) {
      return { ok: true, meta: jina, via: "jina" };
    }

    if (blockedStatus || checkpoint) {
      return {
        ok: false,
        reason: "blocked",
        status: direct.status,
        message: `This site blocked automated fetch (${direct.status || "WAF"}). Created a blank draft from the URL — fill title/description manually.`,
      };
    }

    return {
      ok: false,
      reason: "failed",
      status: direct.status,
      message: `Could not fetch page (${direct.status})`,
    };
  }

  const jina = await fetchViaJina(safe);
  if (jina && metaIsUsable(jina)) {
    return { ok: true, meta: jina, via: "jina" };
  }

  return {
    ok: false,
    reason: "failed",
    message: "Could not fetch page",
  };
}

/** Soft title from hostname when scrape is blocked. */
export function softTitleFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host
      .split(".")[0]
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return "Untitled";
  }
}
