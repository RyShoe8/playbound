/**
 * Fingerprint + merge helpers so Refresh media does not accumulate
 * re-rehosted copies of the same image under different Blob URLs.
 */

/** Stable-ish key for an image URL (Steam/CDN path, hashed blob name, or full URL). */
export function mediaUrlFingerprint(raw: string): string {
  const input = String(raw || "").trim();
  if (!input) return "";

  let href = input;
  try {
    const u = new URL(input.startsWith("//") ? `https:${input}` : input);
    // Drop tracking / cache-buster query + hash for remotes.
    u.hash = "";
    const dropParams = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "t", "_"];
    for (const p of dropParams) u.searchParams.delete(p);
    href = u.toString();
  } catch {
    href = input.split("#")[0] || input;
  }

  try {
    const u = new URL(href);
    const host = u.hostname.toLowerCase();
    const path = u.pathname;

    // Steam CDN: /steam/apps/{appId}/{file}
    const steam = path.match(/\/steam\/apps\/(\d+)\/([^/?#]+)/i);
    if (steam && (host.includes("steamstatic") || host.includes("steamcontent") || host.includes("akamai"))) {
      return `steam:${steam[1]}:${steam[2].toLowerCase()}`;
    }

    // Epic CDN-ish paths — hostname + path without query
    if (host.includes("epicgames") || host.includes("unrealengine") || host.includes("epic")) {
      return `epic:${host}${path.toLowerCase()}`;
    }

    // GitHub raw / release assets
    if (host === "raw.githubusercontent.com" || host === "github.com" || host.endsWith(".githubusercontent.com")) {
      return `gh:${host}${path.toLowerCase()}`;
    }

    // Our Vercel Blob: games/{slug}/{kind}-{hash16}.{ext}
    if (host.includes("blob.vercel-storage.com") || host.includes("vercel-storage.com")) {
      const m = path.match(/\/(?:games|media)\/[^/]+\/([a-z0-9-]+)-([a-f0-9]{16})\.[a-z0-9]+$/i);
      if (m) return `blob:${m[1].toLowerCase()}:${m[2].toLowerCase()}`;
      // Legacy timestamped blobs — unique per path (cannot alias to source)
      return `blobpath:${path.toLowerCase()}`;
    }

    return `${host}${path.toLowerCase()}`;
  } catch {
    return href.toLowerCase();
  }
}

/** Normalize source URL before hashing for deterministic Blob keys. */
export function normalizeMediaSourceUrl(raw: string): string {
  let s = String(raw || "").trim();
  if (s.startsWith("//")) s = `https:${s}`;
  if (s.startsWith("http://")) s = `https://${s.slice("http://".length)}`;
  try {
    const u = new URL(s);
    u.hash = "";
    // Strip common cache-busters / tracking
    for (const p of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "t", "_"]) {
      u.searchParams.delete(p);
    }
    // Prefer no search for CDN object URLs when only tracking remained
    if ([...u.searchParams.keys()].length === 0) u.search = "";
    return u.toString();
  } catch {
    return s;
  }
}

/**
 * Merge incoming URLs into existing, skipping fingerprints already present.
 * Preserves existing order; appends new uniques; clamps to max.
 */
export function mergeUniqueMediaUrls(
  existing: string[] | null | undefined,
  incoming: string[] | null | undefined,
  max: number
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (url: string) => {
    const trimmed = String(url || "").trim();
    if (!trimmed) return;
    const fp = mediaUrlFingerprint(trimmed) || trimmed.toLowerCase();
    if (seen.has(fp)) return;
    seen.add(fp);
    out.push(trimmed);
  };

  for (const u of existing ?? []) push(u);
  for (const u of incoming ?? []) {
    if (out.length >= max) break;
    push(u);
  }
  return out.slice(0, max);
}
