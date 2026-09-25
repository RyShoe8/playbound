import { SITE_PUBLIC_HOST, SITE_URL } from "@/lib/site";

/** Short Jackbox-style path: playbound.club/c/AB3D */
const COUCH_JOIN_PATH_PREFIX = "/c";

export function couchJoinPath(joinCode: string): string {
  const code = String(joinCode || "")
    .trim()
    .toUpperCase();
  return `${COUCH_JOIN_PATH_PREFIX}/${encodeURIComponent(code)}`;
}

export function couchJoinUrl(joinCode: string, siteUrl = SITE_URL): string {
  let base = String(siteUrl || "https://playbound.club").replace(/\/$/, "");
  try {
    const u = new URL(base);
    // Public join pages must be HTTPS — http:// shows "Not secure" and breaks
    // secure APIs / mixed-content fallbacks for remote controllers.
    if (u.protocol === "http:" && !/^(localhost|127\.0\.0\.1)$/i.test(u.hostname)) {
      u.protocol = "https:";
      base = u.origin;
    }
  } catch {
    if (base.startsWith("http://") && !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(base)) {
      base = `https://${base.slice(7)}`;
    }
  }
  return `${base}${couchJoinPath(joinCode)}`;
}

/** What hosts tell people to type: playbound.club/c */
export function couchCodeEntryHint(host = SITE_PUBLIC_HOST): string {
  return `${host.replace(/^www\./i, "")}/c`;
}

export function normalizeCouchJoinCode(raw: string): string {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 16);
}
