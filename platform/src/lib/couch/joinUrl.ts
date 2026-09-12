import { SITE_PUBLIC_HOST, SITE_URL } from "@/lib/site";

/** Short Jackbox-style path: playbound.club/c/AB3D */
export const COUCH_JOIN_PATH_PREFIX = "/c";

/** Legacy path kept working for old QR stickers / bookmarks. */
export const COUCH_JOIN_PATH_LEGACY_PREFIX = "/controller";

export function couchJoinPath(joinCode: string): string {
  const code = String(joinCode || "")
    .trim()
    .toUpperCase();
  return `${COUCH_JOIN_PATH_PREFIX}/${encodeURIComponent(code)}`;
}

export function couchJoinUrl(joinCode: string, siteUrl = SITE_URL): string {
  return `${siteUrl.replace(/\/$/, "")}${couchJoinPath(joinCode)}`;
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
