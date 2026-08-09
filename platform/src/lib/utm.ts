/**
 * Stamp PlayBound attribution on third-party http(s) URLs.
 * Skips first-party hosts, non-web schemes, and URLs that already have utm_source.
 */

const FIRST_PARTY_HOSTS = new Set([
  "playbound.club",
  "www.playbound.club",
  "localhost",
  "127.0.0.1",
]);

export type OutboundUtmMedium = "website" | "launcher";

export type OutboundUtmOptions = {
  campaign: string;
  content?: string;
  medium?: OutboundUtmMedium;
};

function isFirstPartyHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (FIRST_PARTY_HOSTS.has(host)) return true;
  if (host.endsWith(".vercel.app") && host.includes("playbound")) return true;
  return false;
}

/**
 * Append standard UTM params for outbound third-party website links.
 * Returns the original string when stamping does not apply.
 */
export function withOutboundUtm(url: string, opts: OutboundUtmOptions): string {
  const raw = String(url || "").trim();
  if (!raw || !opts?.campaign) return raw;

  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return raw;
  }

  const proto = u.protocol.toLowerCase();
  if (proto !== "http:" && proto !== "https:") return raw;
  if (isFirstPartyHost(u.hostname)) return raw;
  if (u.searchParams.has("utm_source")) return raw;

  const medium = opts.medium || "website";
  u.searchParams.set("utm_source", "playbound");
  u.searchParams.set("utm_medium", medium);
  u.searchParams.set("utm_campaign", String(opts.campaign).trim() || "outbound");
  if (opts.content) {
    u.searchParams.set("utm_content", String(opts.content).trim());
  }
  return u.toString();
}
