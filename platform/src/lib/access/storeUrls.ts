/** Parse storefront product URLs. No fetches — safe for the admin client. */

const LIVE_PRICE_RETAILERS = [
  "Steam",
  "GOG",
  "Epic Games Store",
  "Fanatical",
] as const;

export function retailerHasLivePrice(name: string): boolean {
  return (LIVE_PRICE_RETAILERS as readonly string[]).includes(name);
}

export function parseSteamAppId(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/(^|\.)steampowered\.com$/i.test(u.hostname) && u.hostname.toLowerCase() !== "s.team") {
      return null;
    }
    const m = u.pathname.match(/\/app\/(\d+)/i);
    return m?.[1] || null;
  } catch {
    return null;
  }
}

export function parseGogSlug(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/(^|\.)gog\.com$/i.test(u.hostname)) return null;
    const m = u.pathname.match(/\/(?:en\/)?game\/([^/?#]+)/i);
    return m?.[1] ? decodeURIComponent(m[1]).trim() : null;
  } catch {
    return null;
  }
}

export function parseFanaticalSlug(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/(^|\.)fanatical\.com$/i.test(u.hostname)) return null;
    const m = u.pathname.match(/\/(?:[a-z]{2}\/)?(?:game|dlc|bundle)\/([^/?#]+)/i);
    return m?.[1] ? decodeURIComponent(m[1]).trim() : null;
  } catch {
    return null;
  }
}

export function detectRetailer(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.endsWith("steampowered.com") || host === "s.team") return "Steam";
    if (host.endsWith("gog.com")) return "GOG";
    if (host.endsWith("epicgames.com")) return "Epic Games Store";
    if (host.endsWith("fanatical.com")) return "Fanatical";
    if (host.endsWith("humblebundle.com") || host.endsWith("humble.com")) return "Humble Bundle";
    if (host.endsWith("itch.io")) return "itch.io";
    if (host.endsWith("greenmangaming.com")) return "Green Man Gaming";
    if (host.endsWith("gamersgate.com")) return "GamersGate";
    if (/(^|\.)ebay\./i.test(host)) return "eBay";
    return null;
  } catch {
    return null;
  }
}

export type StoreAffiliateStamp = {
  id?: string | null;
  param?: string | null;
  template?: string | null;
};

export type StoreAffiliateMap = Record<string, StoreAffiliateStamp>;

/**
 * Apply store affiliate tracking on paid outbound URLs.
 *
 * Supports:
 * 1. Tracking URL templates (e.g. Adtraction for GOG):
 *    https://track.adtraction.com/t/t?a=...&as=...&t=2&tk=1&url={url}
 * 2. Query param stamping (e.g. Humble Bundle, itch):
 *    https://store.humblebundle.com/game?partner=playbound
 *
 * Leaves the URL alone when the offer is not marked affiliate, when tracking
 * config is missing, or when the link is already wrapped/tagged.
 */
export function withStoreAffiliate(
  url: string,
  opts: {
    affiliate?: boolean;
    id?: string | null;
    param?: string | null;
    template?: string | null;
  }
): string {
  if (!opts.affiliate) return url;
  const raw = String(url || "").trim();
  if (!raw) return raw;

  let u: URL;
  try {
    u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return raw;
  } catch {
    return raw;
  }

  const template = typeof opts.template === "string" ? opts.template.trim() : "";
  if (template) {
    try {
      const templateHost = new URL(template.replace(/\{url\}|\{dest\}/g, "https://example.com")).hostname.toLowerCase();
      if (u.hostname.toLowerCase() === templateHost) return raw;
    } catch {
      // Continue if template parsing fails
    }
    if (template.includes("{url}")) {
      return template.replace(/\{url\}/g, encodeURIComponent(raw));
    }
    if (template.includes("{dest}")) {
      return template.replace(/\{dest\}/g, encodeURIComponent(raw));
    }
    if (template.endsWith("url=")) {
      return template + encodeURIComponent(raw);
    }
    return template.includes("?")
      ? `${template}&url=${encodeURIComponent(raw)}`
      : `${template}?url=${encodeURIComponent(raw)}`;
  }

  const id = typeof opts.id === "string" ? opts.id.trim() : "";
  const param = typeof opts.param === "string" ? opts.param.trim() : "";
  if (!id || !param) return raw;
  if (!/^[A-Za-z0-9_-]+$/.test(param)) return raw;

  if (u.searchParams.has(param)) return raw;
  u.searchParams.set(param, id);
  return u.toString();
}

