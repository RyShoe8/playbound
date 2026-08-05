/** Shared HTML / Open Graph helpers for admin import + media fetch. */

import { normalizeVideoUrl } from "@/lib/mediaEmbed";
import {
  isScreenshotCandidate,
  pickLargestSrcset,
  readImgPixelSize,
} from "@/lib/mediaImageFilter";

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

const CONTENT_PATH_RE =
  /\/(?:screenshot|gallery|media|features|about|news|blog|showcase|press)(?:s)?(?:\/|$|\?)/i;

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

function pushVideo(out: string[], raw: string | null | undefined, baseUrl?: string) {
  if (!raw?.trim()) return;
  let abs = raw.trim();
  if (baseUrl) {
    try {
      abs = absoluteUrl(baseUrl, abs);
    } catch {
      return;
    }
  }
  const normalized = normalizeVideoUrl(abs);
  if (!normalized || out.includes(normalized)) return;
  out.push(normalized);
}

function pushImage(
  out: string[],
  raw: string | null | undefined,
  baseUrl: string,
  opts?: { requireRaster?: boolean; width?: number | null; height?: number | null }
) {
  if (!raw?.trim() || raw.startsWith("data:")) return;
  let abs: string;
  try {
    abs = absoluteUrl(baseUrl, raw.trim());
  } catch {
    return;
  }
  if (!isScreenshotCandidate(abs, opts ?? { requireRaster: true })) return;
  if (out.includes(abs)) return;
  out.push(abs);
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
    pushImage(images, metaContent(html, key), finalUrl, { requireRaster: false });
  }
  for (const abs of collectBodyImages(html, finalUrl)) {
    if (!images.includes(abs)) images.push(abs);
    if (images.length >= 20) break;
  }

  const videos: string[] = [];
  for (const key of [
    "og:video",
    "og:video:url",
    "og:video:secure_url",
    "twitter:player:stream",
    "twitter:player",
  ]) {
    pushVideo(videos, metaContent(html, key), finalUrl);
  }
  for (const v of collectVideosFromHtml(html, finalUrl)) {
    if (!videos.includes(v)) videos.push(v);
    if (videos.length >= 10) break;
  }

  return {
    title,
    description,
    images,
    videos: videos.slice(0, 10),
    siteName: metaContent(html, "og:site_name"),
  };
}

/** Pull gallery-ish URLs from <img>, video posters, and srcset. */
function collectBodyImages(html: string, finalUrl: string): string[] {
  const out: string[] = [];

  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const { width, height } = readImgPixelSize(tag);
    const srcset = tag.match(/\bsrcset=["']([^"']+)["']/i)?.[1];
    if (srcset) {
      pushImage(out, pickLargestSrcset(srcset), finalUrl, { requireRaster: true, width, height });
    }
    const src = tag.match(/\bsrc=["']([^"']+)["']/i)?.[1]?.trim();
    pushImage(out, src, finalUrl, { requireRaster: true, width, height });
    if (out.length >= 20) return out;
  }

  for (const m of html.matchAll(/<video\b[^>]*>/gi)) {
    const poster = m[0].match(/\bposter=["']([^"']+)["']/i)?.[1];
    pushImage(out, poster, finalUrl, { requireRaster: true });
    if (out.length >= 20) return out;
  }

  for (const m of html.matchAll(/<source\b[^>]*?\bsrcset=["']([^"']+)["'][^>]*>/gi)) {
    pushImage(out, pickLargestSrcset(m[1]), finalUrl, { requireRaster: true });
    if (out.length >= 20) return out;
  }

  return out;
}

/** Same-origin content pages that may hold galleries when the homepage is thin. */
function collectContentLinks(html: string, baseUrl: string): string[] {
  let origin: string;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const m of html.matchAll(/<a\b[^>]*?\bhref=["']([^"'#]+)["']/gi)) {
    const raw = m[1]?.trim();
    if (!raw || raw.startsWith("mailto:") || raw.startsWith("javascript:")) continue;
    let abs: URL;
    try {
      abs = assertPublicHttpUrl(new URL(raw, baseUrl).toString());
    } catch {
      continue;
    }
    if (abs.origin !== origin) continue;
    if (!CONTENT_PATH_RE.test(abs.pathname)) continue;
    const href = `${abs.origin}${abs.pathname}`.replace(/\/$/, "") || abs.origin;
    const baseNorm = baseUrl.replace(/\/$/, "");
    if (href === baseNorm || href === baseUrl) continue;
    if (out.includes(href)) continue;
    out.push(href);
    if (out.length >= 8) break;
  }
  return out;
}

async function enrichWithRelatedPages(meta: PageMeta, html: string, finalUrl: string): Promise<PageMeta> {
  if (meta.images.length >= 4) return meta;
  const links = collectContentLinks(html, finalUrl).slice(0, 3);
  if (!links.length) return meta;

  const images = [...meta.images];
  const videos = [...meta.videos];

  for (const link of links) {
    try {
      const page = await fetchDirectHtml(assertPublicHttpUrl(link));
      if (!page || page.status < 200 || page.status >= 300) continue;
      if (looksLikeCheckpoint(page.html)) continue;
      const extra = parsePageMeta(page.html, page.finalUrl);
      for (const img of extra.images) {
        if (!images.includes(img)) images.push(img);
        if (images.length >= 20) break;
      }
      for (const v of extra.videos) {
        if (!videos.includes(v)) videos.push(v);
        if (videos.length >= 10) break;
      }
      if (images.length >= 20) break;
    } catch {
      /* soft-fail related page */
    }
  }

  return {
    ...meta,
    images: images.slice(0, 20),
    videos: videos.slice(0, 10),
  };
}

const ATTR_URL_RES = [
  /<(?:iframe|a)\b[^>]*?\b(?:src|data-src|href)=["']([^"']+)["'][^>]*>/gi,
  /<(?:video|source)\b[^>]*?\bsrc=["']([^"']+)["'][^>]*>/gi,
];

/** YouTube / Vimeo / direct video URLs from page markup (iframes, links, video tags). */
export function collectVideosFromHtml(html: string, baseUrl: string): string[] {
  const out: string[] = [];
  for (const re of ATTR_URL_RES) {
    re.lastIndex = 0;
    for (const m of html.matchAll(re)) {
      pushVideo(out, m[1], baseUrl);
      if (out.length >= 10) return out;
    }
  }
  // Bare YouTube / Vimeo URLs in script or JSON-LD blobs
  for (const m of html.matchAll(
    /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)[\w-]{6,}|youtu\.be\/[\w-]{6,}|vimeo\.com\/\d+)/gi
  )) {
    pushVideo(out, m[0]);
    if (out.length >= 10) break;
  }
  return out;
}

function collectVideosFromText(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)) {
    pushVideo(out, m[1]);
    if (out.length >= 10) return out;
  }
  for (const m of text.matchAll(
    /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)[\w-]{6,}|youtu\.be\/[\w-]{6,}|vimeo\.com\/\d+)[^\s)\]"'<>]*/gi
  )) {
    pushVideo(out, m[0].replace(/[.,;]+$/, ""));
    if (out.length >= 10) break;
  }
  return out;
}

function parseJinaMarkdown(text: string, _sourceUrl: string): PageMeta | null {
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
    const url = m[1];
    if (!url || !isScreenshotCandidate(url, { requireRaster: true })) continue;
    if (!images.includes(url)) images.push(url);
    if (images.length >= 20) break;
  }

  return {
    title,
    description,
    images,
    videos: collectVideosFromText(text),
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
      let meta = parsePageMeta(direct.html, direct.finalUrl);
      if (metaIsUsable(meta)) {
        meta = await enrichWithRelatedPages(meta, direct.html, direct.finalUrl);
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
