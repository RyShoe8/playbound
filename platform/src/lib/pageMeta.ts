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

/** Hostnames that must never be reachable through an admin-supplied URL. */
const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "metadata.google.internal",
]);

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

export async function fetchPageMeta(url: string): Promise<PageMeta> {
  const safe = assertPublicHttpUrl(url);
  const res = await fetch(safe.toString(), {
    headers: {
      "user-agent": "PlayBoundAdmin/1.0 (+https://playbound-five.vercel.app)",
      accept: "text/html",
    },
    next: { revalidate: 0 },
    // Manual so a public URL cannot 302 the request onto an internal address;
    // each hop is re-validated below.
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });

  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get("location");
    if (!location) throw new Error("Could not fetch page (redirect without location)");
    const next = assertPublicHttpUrl(new URL(location, safe).toString());
    const hop = await fetch(next.toString(), {
      headers: {
        "user-agent": "PlayBoundAdmin/1.0 (+https://playbound-five.vercel.app)",
        accept: "text/html",
      },
      next: { revalidate: 0 },
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    if (!hop.ok) throw new Error(`Could not fetch page (${hop.status})`);
    return parsePageMeta(await hop.text(), hop.url || next.toString());
  }

  if (!res.ok) throw new Error(`Could not fetch page (${res.status})`);
  return parsePageMeta(await res.text(), res.url || safe.toString());
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
