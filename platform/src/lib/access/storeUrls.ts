/** Parse storefront product URLs. No fetches — safe for the admin client. */

export const LIVE_PRICE_RETAILERS = [
  "Steam",
  "GOG",
  "Epic Games Store",
  "Fanatical",
  "eBay",
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

/**
 * Append a store affiliate query param on paid outbound URLs.
 * Leaves the URL alone when the offer is not affiliate, the id/param is
 * missing, or the link already has that param (a pasted full affiliate URL).
 */
export function withStoreAffiliate(
  url: string,
  opts: { affiliate?: boolean; id?: string | null; param?: string | null }
): string {
  if (!opts.affiliate) return url;
  const id = typeof opts.id === "string" ? opts.id.trim() : "";
  const param = typeof opts.param === "string" ? opts.param.trim() : "";
  if (!id || !param) return url;
  if (!/^[A-Za-z0-9_-]+$/.test(param)) return url;
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return url;
    if (u.searchParams.has(param)) return url;
    u.searchParams.set(param, id);
    return u.toString();
  } catch {
    return url;
  }
}
