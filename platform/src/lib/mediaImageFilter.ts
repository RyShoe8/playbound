/** Browser-safe screenshot URL filtering (no sharp / Node APIs). */

export type ScreenshotCandidateOpts = {
  /** When false, skip raster-extension requirement (OG / cover only). Default true. */
  requireRaster?: boolean;
  /** Explicit pixel size from <img width/height>; skip if either ≤ 128. */
  width?: number | null;
  height?: number | null;
};

const SKIP_PATH_RE =
  /(?:^|\/|[._-])(?:icon|favicon|logo|avatar|sprite|emoji|badge|button|pixel|1x1|spacer|tracking|discord|facebook|twitter|reddit|mastodon|bluesky|github|gitlab|patreon|twitch|instagram|linkedin|social|share|brand|shield|sponsor)(?:[._/-]|$)/i;

const TINY_DIM_RE = /[-_/](?:16|24|32|48|64|96|128)x(?:16|24|32|48|64|96|128)(?:[-_.]|$)/i;

const JUNK_HOST_RE =
  /(?:^|\.)(?:img\.shields\.io|shields\.io|simpleicons\.org|cdnjs\.cloudflare\.com|kit\.fontawesome\.com|use\.fontawesome\.com|fontawesome\.com|avatars\.githubusercontent\.com|github\.githubassets\.com)$/i;

const RASTER_EXT_RE = /\.(?:jpe?g|png|webp)(?:$|\?)/i;
const NON_RASTER_EXT_RE = /\.(?:svg|gif|ico|bmp)(?:$|\?)/i;

function parseMaybeUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/** Hosts that often serve real photos without a file extension in the path. */
function isExtensionlessImageHost(u: URL): boolean {
  const host = u.hostname.toLowerCase();
  if (host === "user-images.githubusercontent.com") return true;
  if (host === "github.com" && /^\/user-attachments\/assets\//i.test(u.pathname)) return true;
  if (host.includes("blob.vercel-storage.com")) return true;
  if (host.includes("steamstatic.com") || host.includes("steamcdn-a.akamaihd.net")) return true;
  return false;
}

/** True when a URL looks like a real gallery/cover photo rather than chrome or social art. */
export function isScreenshotCandidate(
  url: string | null | undefined,
  opts: ScreenshotCandidateOpts = {}
): boolean {
  const raw = url?.trim();
  if (!raw || raw.startsWith("data:") || raw.startsWith("blob:")) return false;

  // Site-relative paths (/games/.../cover.webp) are owned assets — keep them.
  if (raw.startsWith("/")) {
    if (NON_RASTER_EXT_RE.test(raw)) return false;
    if (opts.requireRaster !== false && !RASTER_EXT_RE.test(raw)) return false;
    if (SKIP_PATH_RE.test(raw) || TINY_DIM_RE.test(raw)) return false;
    return true;
  }

  if (!/^https?:\/\//i.test(raw)) return false;

  const u = parseMaybeUrl(raw);
  if (!u) return false;

  const host = u.hostname.toLowerCase();
  if (JUNK_HOST_RE.test(host)) return false;
  // jsDelivr / unpkg icon packs
  if (
    (host.includes("jsdelivr.net") || host === "unpkg.com") &&
    /(?:simple-icons|fontawesome|feather|heroicons|lucide|bootstrap-icons)/i.test(u.pathname)
  ) {
    return false;
  }

  const haystack = `${u.pathname}${u.search}`;
  if (SKIP_PATH_RE.test(haystack) || TINY_DIM_RE.test(haystack)) return false;

  if (NON_RASTER_EXT_RE.test(haystack)) return false;

  const requireRaster = opts.requireRaster !== false;
  if (requireRaster && !RASTER_EXT_RE.test(haystack)) {
    // Blob / Steam / GitHub attachments often omit extensions.
    if (!isExtensionlessImageHost(u)) return false;
  }

  const w = opts.width;
  const h = opts.height;
  if (typeof w === "number" && Number.isFinite(w) && w > 0 && w <= 128) return false;
  if (typeof h === "number" && Number.isFinite(h) && h > 0 && h <= 128) return false;

  return true;
}

/** Read numeric width/height from an HTML attribute string (e.g. full <img ...> tag). */
export function readImgPixelSize(tag: string): { width: number | null; height: number | null } {
  const width = tag.match(/\bwidth=["']?(\d+)/i)?.[1];
  const height = tag.match(/\bheight=["']?(\d+)/i)?.[1];
  return {
    width: width ? Number(width) : null,
    height: height ? Number(height) : null,
  };
}

/** Pick the largest URL from a srcset attribute (prefer highest `w` descriptor). */
export function pickLargestSrcset(srcset: string): string | null {
  const parts = srcset
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  let bestUrl: string | null = null;
  let bestW = -1;
  for (const part of parts) {
    const m = part.match(/^(\S+)\s+(\d+)w$/i);
    if (m) {
      const w = Number(m[2]);
      if (w >= bestW) {
        bestW = w;
        bestUrl = m[1];
      }
      continue;
    }
    const urlOnly = part.split(/\s+/)[0];
    if (urlOnly) bestUrl = urlOnly;
  }
  return bestUrl;
}
