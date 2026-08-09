/**
 * Stamp PlayBound attribution on third-party http(s) URLs.
 * Mirrors platform/src/lib/utm.ts — keep behavior in sync.
 */

const FIRST_PARTY_HOSTS = new Set([
  "playbound.club",
  "www.playbound.club",
  "localhost",
  "127.0.0.1",
]);

function isFirstPartyHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  if (FIRST_PARTY_HOSTS.has(host)) return true;
  if (host.endsWith(".vercel.app") && host.includes("playbound")) return true;
  return false;
}

/**
 * @param {string} url
 * @param {{ campaign: string, content?: string, medium?: "website" | "launcher" }} opts
 * @returns {string}
 */
function withOutboundUtm(url, opts) {
  const raw = String(url || "").trim();
  if (!raw || !opts?.campaign) return raw;

  let u;
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

module.exports = { withOutboundUtm };
