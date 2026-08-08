/**
 * Amazon product HTML extraction for gear import.
 * Best-effort selectors — Amazon markup varies by locale and A/B tests.
 */

import { GEAR_PLATFORMS } from "@/lib/gamePayload";
import { stripHtml } from "@/lib/pageMeta";

export const GEAR_CATEGORIES = [
  "Controllers",
  "Mobile",
  "TV",
  "Audio",
  "Accessories",
  "Storage",
  "Mouse",
  "Keyboard",
] as const;

export type GearCategory = (typeof GEAR_CATEGORIES)[number];

const GEAR_PLATFORM_SET = new Set<string>(GEAR_PLATFORMS);

const PLATFORM_KEYWORDS: { re: RegExp; label: (typeof GEAR_PLATFORMS)[number] }[] = [
  { re: /\bxbox\s*(series\s*[xs]|one|360)?\b/i, label: "Xbox" },
  { re: /\bplaystation\s*[45]?\b|\bps[45]\b/i, label: "PlayStation" },
  { re: /\bnintendo\s*switch\b|\bswitch\s*2?\b/i, label: "Nintendo" },
  { re: /\bsteam\s*deck\b/i, label: "Steam Deck" },
  { re: /\bwindows\b|\bpc\b/i, label: "Windows" },
  { re: /\bmac\s*os\b|\bmacos\b|\bapple\s*silicon\b/i, label: "macOS" },
  { re: /\blinux\b/i, label: "Linux" },
  { re: /\bandroid\b/i, label: "Android" },
  { re: /\bios\b|\bipad\b|\biphone\b/i, label: "iOS" },
  { re: /\bweb\b|\bbrowser\b/i, label: "Web" },
];

function filterGearPlatforms(labels: string[]): string[] {
  return [...new Set(labels.filter((p) => GEAR_PLATFORM_SET.has(p)))];
}

/** More specific categories first. */
const CATEGORY_KEYWORDS: { re: RegExp; category: GearCategory }[] = [
  { re: /\b(gaming\s*)?mouse\b|\bmice\b/i, category: "Mouse" },
  { re: /\b(gaming\s*)?keyboards?\b|\bmechanical keyboard\b/i, category: "Keyboard" },
  {
    re: /\b(controllers?|gamepads?|joy-?pads?|xbox elite|dualsense|dualshock)\b/i,
    category: "Controllers",
  },
  {
    re: /\b(headsets?|headphones?|earbuds?|earphones?|microphone|mic\b|speakers?)\b/i,
    category: "Audio",
  },
  {
    re: /\b(ssd|nvme|hard drive|hdd|external (drive|storage)|thumb drive|flash drive|memory card|microsd|usb[- ]?c hub)\b/i,
    category: "Storage",
  },
  {
    re: /\b(smart\s*)?tvs?\b|\btelevision\b|\b(4k|8k)\s*monitor\b|\bstreaming stick\b|\bfire tv\b|\broku\b/i,
    category: "TV",
  },
  {
    re: /\b(phone|tablet|ipad|iphone|android phone|mobile gaming|backbone|gamesir x2|razer kishi)\b/i,
    category: "Mobile",
  },
];

export type AmazonProductParse = {
  title: string | null;
  description: string | null;
  price: string | null;
  shipping: string | null;
  manufacturer: string | null;
  category: GearCategory | null;
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
    .replace(/\\u002F/g, "/")
    .replace(/\\\//g, "/")
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

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysUntil(target: Date, from = new Date()): number {
  const a = startOfLocalDay(from).getTime();
  const b = startOfLocalDay(target).getTime();
  return Math.round((b - a) / 86_400_000);
}

function formatDayEstimate(days: number, prime: boolean): string {
  const clamped = Math.max(0, days);
  let body: string;
  if (clamped === 0) body = "today";
  else if (clamped === 1) body = "~1 day";
  else if (clamped === 2) body = "1–2 days";
  else if (clamped <= 5) body = `~${clamped} days`;
  else body = `${clamped - 1}–${clamped} days`;
  return prime ? `Prime · ${body}` : body;
}

function parseDeliveryDate(text: string, now = new Date()): number | null {
  const t = text.replace(/\s+/g, " ").trim();
  if (/today/i.test(t)) return 0;
  if (/tomorrow/i.test(t)) return 1;

  // Absolute date: "April 12", "Apr 12, 2026", "12 April"
  const months =
    "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
  const md = t.match(
    new RegExp(`\\b(${months})\\.?\\s+(\\d{1,2})(?:,?\\s*(\\d{4}))?\\b`, "i")
  );
  if (md) {
    const monthNames = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ];
    const mi = monthNames.findIndex((m) => md[1].toLowerCase().startsWith(m));
    const day = Number(md[2]);
    let year = md[3] ? Number(md[3]) : now.getFullYear();
    if (mi >= 0 && day >= 1 && day <= 31) {
      let target = new Date(year, mi, day);
      // If date already passed this year and year wasn't explicit, roll forward.
      if (!md[3] && daysUntil(target, now) < -1) {
        target = new Date(year + 1, mi, day);
      }
      return daysUntil(target, now);
    }
  }

  // Weekday only: "Thursday", "Mon"
  const wd = t.match(
    /\b(sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:rs(?:day)?)?|fri(?:day)?|sat(?:urday)?)\b/i
  );
  if (wd) {
    const map: Record<string, number> = {
      sun: 0,
      mon: 1,
      tue: 2,
      wed: 3,
      thu: 4,
      fri: 5,
      sat: 6,
    };
    const key = wd[1].toLowerCase().slice(0, 3);
    const want = map[key];
    if (want != null) {
      const cur = now.getDay();
      let delta = (want - cur + 7) % 7;
      if (delta === 0) delta = 7; // next occurrence when same weekday
      return delta;
    }
  }

  return null;
}

function normalizeShippingText(raw: string, html: string): string | null {
  const text = decodeHtmlEntities(raw).replace(/\s+/g, " ").trim();
  if (!text) return null;
  const prime = /\bprime\b/i.test(text) || (/\bprime\b/i.test(html) && /free\s+delivery/i.test(html));

  // Already a day range
  if (/\b\d+\s*[–-]\s*\d+\s*days?\b/i.test(text) || /\b~?\d+\s*days?\b/i.test(text)) {
    const cleaned = text.match(/(\d+\s*[–-]\s*\d+\s*days?|~?\d+\s*days?)/i)?.[1];
    if (cleaned) return prime ? `Prime · ${cleaned}` : cleaned;
  }

  const days = parseDeliveryDate(text);
  if (days != null) return formatDayEstimate(days, prime);

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
    if (attr) {
      const n = normalizeShippingText(attr, html);
      if (n) return n;
    }
    const text = stripHtml(chunk).replace(/\s+/g, " ").trim();
    const m = text.match(
      /((?:FREE\s+)?delivery[^.]{0,80}|Arrives?[^.!]{0,80}|Get it by[^.]{0,60}|Prime\s+FREE[^.]{0,60})/i
    );
    if (m?.[1]) {
      const n = normalizeShippingText(m[1], html);
      if (n) return n;
    }
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

function extractBreadcrumbs(html: string): string {
  const block =
    textBetween(html, /id=["']wayfinding-breadcrumbs_feature_div["']/i, /<\/div>/i) ||
    textBetween(html, /id=["']nav-subnav["']/i, /<\/div>/i) ||
    "";
  const bsr = html.match(/Best\s*Sellers?\s*Rank[\s\S]{0,400}/i)?.[0] || "";
  return `${stripHtml(block)} ${stripHtml(bsr)}`;
}

export function inferGearCategory(...parts: (string | null | undefined)[]): GearCategory | null {
  const hay = parts.filter(Boolean).join("\n");
  if (!hay.trim()) return null;
  for (const { re, category } of CATEGORY_KEYWORDS) {
    if (re.test(hay)) return category;
  }
  return null;
}

/** Amazon CDN asset id used to dedupe size variants of the same photo. */
export function amazonImageAssetKey(url: string): string | null {
  try {
    const u = decodeHtmlEntities(url);
    const m = u.match(/\/images\/[IP]\/([A-Za-z0-9%+\-_]+)/i);
    if (m?.[1]) {
      // Strip size tokens glued to id: 71abc._AC_SL1500_ → 71abc
      return m[1].replace(/\._[A-Z0-9%,+]+$/i, "").split("._")[0];
    }
    // Fallback: path without query/size suffix
    const path = new URL(u).pathname;
    return path.replace(/\._[A-Z]{2}[^./]*_/gi, "").replace(/\.(jpg|jpeg|png|webp)$/i, "");
  } catch {
    return null;
  }
}

function imageQualityScore(url: string): number {
  let score = 0;
  if (/hiRes|_AC_SL\d+_|_SL\d+_/i.test(url)) score += 100;
  if (/_AC_SX\d+_|_SY\d+_/i.test(url)) score += 40;
  if (/_SS\d+_|_SR\d+|_SX38_|_US40_/i.test(url)) score -= 80;
  const dim = url.match(/_(?:AC_)?S[LXY](\d+)_/i);
  if (dim) score += Math.min(50, Number(dim[1]) / 30);
  return score;
}

function upgradeAmazonImageUrl(url: string): string {
  let u = decodeHtmlEntities(url);
  if (!/^https?:\/\//i.test(u)) return u;
  // Prefer large still when size token present.
  u = u.replace(/\._[A-Z]{2}[A-Z0-9%,+]*_\./i, "._AC_SL1500_.");
  return u;
}

function isJunkImageUrl(url: string): boolean {
  if (/sprite|icon|pixel|transparent-pixel|grey-pixel|play-button|360_icon/i.test(url)) return true;
  if (/\/images\/G\//i.test(url)) return true; // Amazon chrome / sprites
  if (/_SS(1|2|3|4)0_|_SX3[08]_|_US40_|_SR38/i.test(url)) return true;
  return false;
}

/**
 * Deduplicate Amazon (and other) image URLs by asset id, keeping the best size.
 */
export function dedupeProductImages(urls: string[], cap = 30): string[] {
  const best = new Map<string, { url: string; score: number; order: number }>();
  let order = 0;
  for (const raw of urls) {
    if (!raw) continue;
    let u = decodeHtmlEntities(raw);
    if (!/^https?:\/\//i.test(u)) continue;
    if (isJunkImageUrl(u)) continue;
    u = upgradeAmazonImageUrl(u);
    const key = amazonImageAssetKey(u) || u;
    const score = imageQualityScore(u);
    const prev = best.get(key);
    if (!prev || score > prev.score) {
      best.set(key, { url: u, score, order: prev?.order ?? order++ });
    }
  }
  return [...best.values()]
    .sort((a, b) => a.order - b.order)
    .map((x) => x.url)
    .slice(0, cap);
}

function collectImageUrlsFromObject(node: unknown, out: string[], depth = 0) {
  if (depth > 8 || node == null) return;
  if (typeof node === "string") {
    if (/^https?:\/\//i.test(node) && /\.(jpg|jpeg|png|webp)(\?|$)/i.test(node)) {
      out.push(node);
    }
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectImageUrlsFromObject(item, out, depth + 1);
    return;
  }
  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    for (const key of ["hiRes", "large", "mainUrl", "landingAsinImage", "main", "url", "thumb"]) {
      const v = obj[key];
      if (typeof v === "string" && /^https?:\/\//i.test(v)) out.push(v);
      else if (v && typeof v === "object" && !Array.isArray(v)) {
        // main: { "https://...": [w,h], ... }
        for (const k of Object.keys(v as object)) {
          if (/^https?:\/\//i.test(k)) out.push(k);
        }
      }
    }
    for (const v of Object.values(obj)) collectImageUrlsFromObject(v, out, depth + 1);
  }
}

function extractImages(html: string): string[] {
  const raw: string[] = [];

  const landing =
    html.match(/id=["']landingImage["'][^>]*data-old-hires=["']([^"']+)["']/i)?.[1] ||
    html.match(/data-old-hires=["']([^"']+)["'][^>]*id=["']landingImage["']/i)?.[1];
  if (landing) raw.push(landing);

  for (const m of html.matchAll(/data-a-dynamic-image=["'](\{[^"']+\})["']/gi)) {
    try {
      const json = JSON.parse(decodeHtmlEntities(m[1]));
      for (const url of Object.keys(json)) raw.push(url);
    } catch {
      /* ignore */
    }
  }

  // colorImages / ImageBlockATF embedded JSON (often not valid JSON as a whole — use regex + object walk)
  for (const m of html.matchAll(
    /(?:colorImages|ImageBlockATF|imageGalleryData)\s*[=:]\s*(\{[\s\S]{0,200000}?\})\s*[;,\n]/gi
  )) {
    const blob = m[1];
    try {
      // Attempt direct parse after quote normalize
      const normalized = blob.replace(/'/g, '"');
      collectImageUrlsFromObject(JSON.parse(normalized), raw);
    } catch {
      for (const um of blob.matchAll(
        /(?:hiRes|large|mainUrl|landingAsinImage)\s*:\s*['"](https?:[^'"]+)['"]/gi
      )) {
        raw.push(um[1]);
      }
    }
  }

  for (const m of html.matchAll(
    /'(?:hiRes|large|mainUrl|landingAsinImage)'\s*:\s*'(https?:[^']+)'/gi
  )) {
    raw.push(m[1]);
  }
  for (const m of html.matchAll(/"(?:hiRes|large|mainUrl)"\s*:\s*"(https?:[^"]+)"/gi)) {
    raw.push(m[1]);
  }

  // Product image CDN paths (prefer /images/I/)
  for (const m of html.matchAll(
    /https?:\/\/[^"'\\\s]+(?:m\.media-amazon|images-na\.ssl-images-amazon|images-amazon)[^"'\\\s]*\/images\/I\/[^"'\\\s]+\.(?:jpg|jpeg|png|webp)/gi
  )) {
    raw.push(m[0]);
    if (raw.length >= 80) break;
  }

  return dedupeProductImages(raw, 30);
}

function extractVideos(html: string): string[] {
  const out: string[] = [];
  const push = (u?: string) => {
    if (!u) return;
    const url = decodeHtmlEntities(u);
    if (!/^https?:\/\//i.test(url) || out.includes(url)) return;
    if (/\.(mp4|m3u8)(\?|$)/i.test(url)) {
      out.push(url);
      return;
    }
    // Amazon VSE / immersion streams sometimes omit extension in path but include video markers
    if (
      /media-amazon\.com|images-amazon\.com|cloudfront\.net/i.test(url) &&
      /(vse|video|immersion|transcoding|\.mp4)/i.test(url)
    ) {
      out.push(url);
    }
  };

  for (const m of html.matchAll(
    /"(?:url|videoUrl|downloadUrl|mobileUrl|hlsUrl|slaveUrl)"\s*:\s*"(https?:[^"]+)"/gi
  )) {
    push(m[1]);
  }
  for (const m of html.matchAll(
    /'(?:url|videoUrl|downloadUrl|mobileUrl|hlsUrl)'\s*:\s*'(https?:[^']+)'/gi
  )) {
    push(m[1]);
  }
  for (const m of html.matchAll(/(https?:\/\/[^"'\\\s]+\.mp4[^"'\\\s]*)/gi)) {
    push(m[1]);
  }
  for (const m of html.matchAll(/(https?:\/\/[^"'\\\s]+\.m3u8[^"'\\\s]*)/gi)) {
    push(m[1]);
  }
  for (const m of html.matchAll(
    /https?:\/\/[^"'\\\s]+(?:media-amazon|images-amazon)[^"'\\\s]*(?:vse|video)[^"'\\\s]*/gi
  )) {
    push(m[0]);
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
  const breadcrumbs = extractBreadcrumbs(html);
  const category = inferGearCategory(title, description, breadcrumbs);
  const images = extractImages(html);
  const videos = extractVideos(html);
  const structured = extractStructuredPlatforms(html);
  const inferred = inferPlatformsFromText(title, description, html.slice(0, 80_000));
  const platforms = filterGearPlatforms([...structured, ...inferred]);

  return {
    title,
    description,
    price,
    shipping,
    manufacturer,
    category,
    platforms,
    images,
    videos,
  };
}
