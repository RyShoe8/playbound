/**
 * Amazon product HTML extraction for gear import.
 * Best-effort selectors — Amazon markup varies by locale and A/B tests.
 */

import { stripHtml } from "@/lib/pageMeta";

const PLATFORM_KEYWORDS: { re: RegExp; label: string }[] = [
  { re: /\bxbox\s*(series\s*[xs]|one|360)?\b/i, label: "Xbox" },
  { re: /\bplaystation\s*[45]?\b|\bps[45]\b/i, label: "PlayStation" },
  { re: /\bnintendo\s*switch\b|\bswitch\s*2?\b/i, label: "Nintendo" },
  { re: /\bwindows\b|\bpc\b|\bsteam\s*deck\b/i, label: "Windows" },
  { re: /\bmac\s*os\b|\bmacos\b|\bapple\s*silicon\b/i, label: "macOS" },
  { re: /\bandroid\b/i, label: "Android" },
  { re: /\bios\b|\bipad\b|\biphone\b/i, label: "iOS" },
  { re: /\bsteam\s*deck\b/i, label: "Steam Deck" },
];

export type AmazonProductParse = {
  title: string | null;
  description: string | null;
  price: string | null;
  shipping: string | null;
  manufacturer: string | null;
  platforms: string[];
  images: string[];
  videos: string[];
};

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function cleanAmazonTitle(raw: string): string {
  let t = decodeHtmlEntities(raw);
  t = t.replace(/^Amazon\.com\s*:\s*/i, "");
  t = t.replace(/\s*[|\-–—:]\s*Amazon(?:\.com?[a-z.]*)?.*$/i, "");
  t = t.replace(/\s+on\s+Amazon(\.com)?$/i, "");
  t = t.replace(/\s*[-|]\s*Amazon\s*$/i, "");
  return t.trim().slice(0, 200);
}

function textBetween(html: string, startRe: RegExp, endRe: RegExp): string | null {
  const start = html.search(startRe);
  if (start < 0) return null;
  const from = html.slice(start);
  const end = from.search(endRe);
  return end > 0 ? from.slice(0, end) : from.slice(0, 50_000);
}

function extractProductTitle(html: string): string | null {
  const m =
    html.match(/id=["']productTitle["'][^>]*>\s*([^<]+)\s*</i) ||
    html.match(/id=["']title["'][^>]*>[\s\S]*?<span[^>]*>\s*([^<]+)\s*</i);
  if (!m?.[1]) return null;
  return cleanAmazonTitle(m[1]);
}

/** Prefer “About this item” feature bullets over OG marketing copy. */
function extractAboutThisItem(html: string): string | null {
  const block =
    textBetween(html, /id=["']feature-bullets["']/i, /<\/div>\s*<(?:div|script)/i) ||
    textBetween(html, /About this item/i, /<\/ul>/i);
  if (!block) return null;

  const bullets: string[] = [];
  for (const m of block.matchAll(/<span[^>]*class=["'][^"']*a-list-item[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi)) {
    const text = stripHtml(m[1]).replace(/\s+/g, " ").trim();
    if (!text || /^(About this item|See more|Make sure)/i.test(text)) continue;
    if (text.length < 8) continue;
    if (!bullets.includes(text)) bullets.push(text);
  }
  if (bullets.length === 0) {
    for (const m of block.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
      const text = stripHtml(m[1]).replace(/\s+/g, " ").trim();
      if (!text || text.length < 8) continue;
      if (!bullets.includes(text)) bullets.push(text);
    }
  }
  if (!bullets.length) return null;
  return bullets.slice(0, 12).join("\n\n").slice(0, 8000);
}

function extractPrice(html: string): string | null {
  const offscreen = html.match(
    /class=["'][^"']*a-price[^"']*["'][^>]*>[\s\S]*?class=["']a-offscreen["'][^>]*>\s*([^<]+)\s*</i
  );
  if (offscreen?.[1]) {
    const p = decodeHtmlEntities(offscreen[1]);
    if (/[\d]/.test(p)) return p.slice(0, 40);
  }
  const core = html.match(
    /id=["']corePrice(?:Display|_feature_div)[^"']*["'][\s\S]{0,800}?class=["']a-offscreen["'][^>]*>\s*([^<]+)/i
  );
  if (core?.[1]) {
    const p = decodeHtmlEntities(core[1]);
    if (/[\d]/.test(p)) return p.slice(0, 40);
  }
  return null;
}

function extractShipping(html: string): string | null {
  const chunks = [
    textBetween(html, /id=["']deliveryBlockMessage["']/i, /<\/div>/i),
    textBetween(html, /id=["']mir-layout-DELIVERY_BLOCK["']/i, /<\/div>\s*<div/i),
    textBetween(html, /id=["']deliveryMessageMirId["']/i, /<\/span>/i),
    textBetween(html, /data-csa-c-delivery-time=/i, />/),
  ].filter(Boolean) as string[];

  for (const chunk of chunks) {
    const attr = chunk.match(/data-csa-c-delivery-time=["']([^"']+)["']/i)?.[1];
    if (attr) return decodeHtmlEntities(attr).slice(0, 120);
    const text = stripHtml(chunk).replace(/\s+/g, " ").trim();
    const m = text.match(
      /((?:FREE\s+)?delivery[^.]{0,80}|Arrives?[^.!]{0,80}|Get it by[^.]{0,60}|Prime\s+FREE[^.]{0,60})/i
    );
    if (m?.[1]) return m[1].trim().slice(0, 120);
  }

  if (/prime/i.test(html) && /free\s+delivery/i.test(html)) {
    return "Prime / usually 1–2 days";
  }
  return null;
}

function extractManufacturer(html: string): string | null {
  const byline =
    html.match(/id=["']bylineInfo["'][^>]*>\s*(?:Visit the\s+)?([^<]+?)(?:\s+Store)?\s*</i)?.[1] ||
    html.match(/id=["']bylineInfo["'][^>]*>[\s\S]*?Brand:\s*([^<]+)/i)?.[1];
  if (byline) {
    const t = decodeHtmlEntities(byline).replace(/^Brand:\s*/i, "").trim();
    if (t && !/^amazon$/i.test(t)) return t.slice(0, 80);
  }

  const rows = [
    ...html.matchAll(
      /<(?:th|td|span)[^>]*>\s*(?:Brand|Manufacturer)\s*<\/(?:th|td|span)>[\s\S]{0,200}?<(?:td|span)[^>]*>\s*([^<]+)/gi
    ),
  ];
  for (const m of rows) {
    const t = decodeHtmlEntities(m[1]).trim();
    if (t && !/^amazon$/i.test(t)) return t.slice(0, 80);
  }

  const brandJson = html.match(/"brand"\s*:\s*\{\s*"@type"\s*:\s*"Brand"\s*,\s*"name"\s*:\s*"([^"]+)"/i);
  if (brandJson?.[1]) return decodeHtmlEntities(brandJson[1]).slice(0, 80);
  const brandStr = html.match(/"brand"\s*:\s*"([^"]+)"/i);
  if (brandStr?.[1] && !/amazon/i.test(brandStr[1])) return decodeHtmlEntities(brandStr[1]).slice(0, 80);

  return null;
}

function pushImage(out: string[], url: string | undefined | null) {
  if (!url) return;
  let u = decodeHtmlEntities(url).replace(/\\u002F/g, "/").replace(/\\\//g, "/");
  if (!/^https?:\/\//i.test(u)) return;
  // Prefer larger Amazon image sizes when URL uses size tokens.
  u = u.replace(/\._[A-Z]{2}\d+_\./, "._AC_SL1500_.");
  if (out.includes(u)) return;
  // Skip tiny sprites / icons
  if (/sprite|icon|pixel|transparent-pixel|grey-pixel/i.test(u)) return;
  out.push(u);
}

function extractImages(html: string): string[] {
  const out: string[] = [];

  for (const m of html.matchAll(/data-a-dynamic-image=["'](\{[^"']+\})["']/gi)) {
    try {
      const json = JSON.parse(decodeHtmlEntities(m[1]));
      for (const url of Object.keys(json)) pushImage(out, url);
    } catch {
      /* ignore */
    }
  }

  // colorImages / ImageBlockATF style blobs in script tags
  for (const m of html.matchAll(
    /'(?:hiRes|large|mainUrl|landingAsinImage)'\s*:\s*'(https?:[^']+)'/gi
  )) {
    pushImage(out, m[1]);
  }
  for (const m of html.matchAll(/"(?:hiRes|large|mainUrl)"\s*:\s*"(https?:[^"]+)"/gi)) {
    pushImage(out, m[1]);
  }
  for (const m of html.matchAll(
    /https?:\/\/[^"'\\\s]+(?:images-amazon|media-amazon|ssl-images-amazon)[^"'\\\s]+\.(?:jpg|jpeg|png|webp)/gi
  )) {
    pushImage(out, m[0]);
    if (out.length >= 40) break;
  }

  return out.slice(0, 24);
}

function extractVideos(html: string): string[] {
  const out: string[] = [];
  const push = (u?: string) => {
    if (!u || !/^https?:\/\//i.test(u) || out.includes(u)) return;
    if (!/\.(mp4|m3u8)(\?|$)/i.test(u) && !/video/i.test(u)) return;
    out.push(u);
  };

  for (const m of html.matchAll(/"(?:url|videoUrl|downloadUrl|mobileUrl)"\s*:\s*"(https?:[^"]+\.mp4[^"]*)"/gi)) {
    push(m[1].replace(/\\u002F/g, "/"));
  }
  for (const m of html.matchAll(/'(https?:[^']+\.mp4[^']*)'/gi)) {
    push(m[1]);
  }
  return out.slice(0, 8);
}

function extractStructuredPlatforms(html: string): string[] {
  const found = new Set<string>();
  const compat = textBetween(
    html,
    /(?:Compatible Devices|Brand Platform|Platform|Operating System)/i,
    /<\/(?:tr|div|li|ul)>/i
  );
  const hay = (compat || "") + " " + (html.match(/compatible with[^<]{0,200}/i)?.[0] || "");
  for (const { re, label } of PLATFORM_KEYWORDS) {
    if (re.test(hay)) found.add(label);
  }
  return [...found];
}

function inferPlatformsFromText(...parts: (string | null | undefined)[]): string[] {
  const hay = parts.filter(Boolean).join("\n");
  const found = new Set<string>();
  for (const { re, label } of PLATFORM_KEYWORDS) {
    if (re.test(hay)) found.add(label);
  }
  // PC keyword alone → Windows
  if (/\bpc\b/i.test(hay) && !found.has("Windows")) found.add("Windows");
  return [...found];
}

export function isAmazonProductUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, "");
    return /(^|\.)amazon\./i.test(host) || /(^|\.)amzn\.(to|com)/i.test(host);
  } catch {
    return false;
  }
}

export function parseAmazonProduct(html: string): AmazonProductParse {
  const title = extractProductTitle(html);
  const description = extractAboutThisItem(html);
  const price = extractPrice(html);
  const shipping = extractShipping(html) || "Prime / usually 1–2 days";
  const manufacturer = extractManufacturer(html);
  const images = extractImages(html);
  const videos = extractVideos(html);
  const structured = extractStructuredPlatforms(html);
  const inferred = inferPlatformsFromText(title, description, html.slice(0, 80_000));
  const platforms = [...new Set([...structured, ...inferred])];

  return {
    title,
    description,
    price,
    shipping,
    manufacturer,
    platforms,
    images,
    videos,
  };
}
