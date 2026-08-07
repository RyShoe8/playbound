/** Shared media fetch, Steam inference, merge, and Blob rehost for admin Refresh. */

import { put } from "@vercel/blob";
import { compressImageBuffer } from "@/lib/compressImage";
import { isScreenshotCandidate } from "@/lib/mediaImageFilter";
import { collectVideosFromHtml, tryFetchPageMeta } from "@/lib/pageMeta";
import { normalizeVideoUrl } from "@/lib/mediaEmbed";
import { fetchEpicStoreMedia, parseEpicProductSlug } from "@/lib/epicStore";

export {
  coverLooksLikeSteamHeader,
  screenshotsAreThin,
} from "@/lib/mediaThin";

export const MAX_SCREENSHOTS = 20;
export const MAX_VIDEOS = 10;

export interface GameMediaBundle {
  coverImage: string | null;
  screenshots: string[];
  videos: string[];
}

export function emptyGameMedia(): GameMediaBundle {
  return { coverImage: null, screenshots: [], videos: [] };
}

export function toHttpsUrl(url: string): string {
  if (url.startsWith("http://")) return `https://${url.slice("http://".length)}`;
  return url;
}

/** Append/dedupe URLs; fill cover only if empty; clamp to payload limits. */
export function mergeGameMedia(
  existing: GameMediaBundle,
  incoming: GameMediaBundle
): GameMediaBundle {
  const screenshots = [
    ...new Set(
      [...(existing.screenshots ?? []), ...(incoming.screenshots ?? [])].filter(Boolean)
    ),
  ].slice(0, MAX_SCREENSHOTS);

  const videos = [
    ...new Set([...(existing.videos ?? []), ...(incoming.videos ?? [])].filter(Boolean)),
  ].slice(0, MAX_VIDEOS);

  return {
    coverImage: existing.coverImage || incoming.coverImage || null,
    screenshots,
    videos,
  };
}

export function mediaIsThin(media: GameMediaBundle): boolean {
  return (media.screenshots?.length ?? 0) < 4 || (media.videos?.length ?? 0) === 0;
}

export function mediaChanged(before: GameMediaBundle, after: GameMediaBundle): boolean {
  if ((before.coverImage || null) !== (after.coverImage || null)) return true;
  if ((before.screenshots ?? []).join("\0") !== (after.screenshots ?? []).join("\0")) return true;
  if ((before.videos ?? []).join("\0") !== (after.videos ?? []).join("\0")) return true;
  return false;
}

/**
 * Resolve a Steam app id from an explicit value, store URL, or Steam CDN media URL.
 */
export function inferSteamAppId(opts: {
  steamAppId?: string | null;
  website?: string | null;
  screenshots?: string[] | null;
  coverImage?: string | null;
}): string | null {
  const explicit = opts.steamAppId?.trim();
  if (explicit && /^\d+$/.test(explicit)) return explicit;

  const candidates = [
    opts.website,
    opts.coverImage,
    ...(opts.screenshots ?? []),
  ].filter((v): v is string => Boolean(v?.trim()));

  for (const c of candidates) {
    const store = c.match(/store\.steampowered\.com\/app\/(\d+)/i);
    if (store?.[1]) return store[1];
    const cdn = c.match(/\/steam\/apps\/(\d+)\//i);
    if (cdn?.[1]) return cdn[1];
  }
  return null;
}

type SteamMovie = {
  highlight?: boolean;
  mp4?: { max?: string; "480"?: string };
  webm?: { max?: string; "480"?: string };
  hls_h264?: string;
  hlsH264?: string;
};

function steamMovieUrl(movie: SteamMovie): string | null {
  const raw =
    movie.mp4?.max ||
    movie.mp4?.["480"] ||
    movie.webm?.max ||
    movie.webm?.["480"] ||
    movie.hls_h264 ||
    movie.hlsH264 ||
    null;
  return raw ? toHttpsUrl(raw) : null;
}

/** Pull cover/screenshots/videos from an already-fetched Steam appdetails payload. */
export function parseSteamStoreMedia(data: Record<string, unknown>): GameMediaBundle {
  const coverImage = data.header_image ? toHttpsUrl(String(data.header_image)) : null;
  const screenshots = Array.isArray(data.screenshots)
    ? (data.screenshots as { path_full?: string }[])
        .map((s) => (s.path_full ? toHttpsUrl(s.path_full) : null))
        .filter((u): u is string => Boolean(u))
        .slice(0, MAX_SCREENSHOTS)
    : [];

  const videos: string[] = [];
  if (Array.isArray(data.movies)) {
    const movies = [...(data.movies as SteamMovie[])].sort((a, b) => {
      const ah = a.highlight ? 0 : 1;
      const bh = b.highlight ? 0 : 1;
      return ah - bh;
    });
    for (const movie of movies) {
      const url = steamMovieUrl(movie);
      if (url && !videos.includes(url)) videos.push(url);
      if (videos.length >= MAX_VIDEOS) break;
    }
  }

  return { coverImage, screenshots, videos };
}

async function fetchSteamStorePageVideos(appId: string): Promise<string[]> {
  try {
    const storeUrl = `https://store.steampowered.com/app/${appId}`;
    const res = await fetch(storeUrl, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        accept: "text/html",
        "accept-language": "en-US,en;q=0.9",
      },
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    return collectVideosFromHtml(html, storeUrl).slice(0, MAX_VIDEOS);
  } catch {
    return [];
  }
}

/** Steam store gallery only (no editorial fields). */
export async function fetchSteamStoreMedia(appId: string): Promise<GameMediaBundle> {
  const res = await fetch(
    `https://store.steampowered.com/api/appdetails?appids=${appId}&l=english`,
    {
      headers: { "user-agent": "PlayBoundAdmin/1.0" },
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(15_000),
    }
  );
  if (!res.ok) throw new Error(`Steam API request failed (${res.status})`);
  const json = (await res.json()) as Record<
    string,
    { success?: boolean; data?: Record<string, unknown> }
  >;
  const entry = json[appId];
  if (!entry?.success || !entry.data) throw new Error("Steam app not found or unavailable");
  const bundle = parseSteamStoreMedia(entry.data);
  if (bundle.videos.length === 0) {
    const pageVideos = await fetchSteamStorePageVideos(appId);
    if (pageVideos.length) {
      return { ...bundle, videos: pageVideos.slice(0, MAX_VIDEOS) };
    }
  }
  return bundle;
}

/** Open Graph / page meta images and videos (soft-fails via tryFetchPageMeta). */
export async function fetchWebsiteMedia(url: string): Promise<GameMediaBundle | null> {
  const result = await tryFetchPageMeta(url);
  if (!result.ok) return null;
  const { meta } = result;
  const candidates = meta.images.filter((img) => isScreenshotCandidate(img, { requireRaster: false }));
  const screenshots = candidates
    .filter((img) => isScreenshotCandidate(img, { requireRaster: true }))
    .slice(0, MAX_SCREENSHOTS);
  // Prefer raster gallery shots for cover; fall back to first non-junk OG image.
  const coverImage = screenshots[0] ?? candidates[0] ?? null;
  const videos = meta.videos
    .map((v) => normalizeVideoUrl(v) || v)
    .filter(Boolean)
    .slice(0, MAX_VIDEOS);
  return {
    coverImage,
    screenshots: screenshots.length ? screenshots : coverImage ? [coverImage] : [],
    videos,
  };
}

/** Pull screenshot candidates from a GitHub README when the website gallery is thin. */
export async function fetchGithubReadmeMedia(repo: string): Promise<GameMediaBundle | null> {
  const m = repo.trim().match(/^([\w.-]+)\/([\w.-]+)$/);
  if (!m) return null;
  const full = `${m[1]}/${m[2]}`;

  for (const branch of ["develop", "main", "master"]) {
    try {
      const res = await fetch(`https://raw.githubusercontent.com/${full}/${branch}/README.md`, {
        headers: { "user-agent": "PlayBoundAdmin/1.0" },
        signal: AbortSignal.timeout(10_000),
        next: { revalidate: 0 },
      });
      if (!res.ok) continue;
      const text = await res.text();
      const images: string[] = [];
      for (const match of text.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g)) {
        const url = match[1];
        if (!url || !isScreenshotCandidate(url, { requireRaster: true })) continue;
        if (!images.includes(url)) images.push(url);
        if (images.length >= MAX_SCREENSHOTS) break;
      }
      if (images.length) {
        return {
          coverImage: images[0] ?? null,
          screenshots: images.slice(0, MAX_SCREENSHOTS),
          videos: [],
        };
      }
      // README found but no usable images — stop trying other branches.
      return null;
    } catch {
      /* try next branch */
    }
  }
  return null;
}

/**
 * Prefer Steam when an app id is present, then Epic store-content, then fill gaps
 * from the website / GitHub README. Website failures do not throw when Steam/Epic succeeded.
 */
export async function fetchCombinedGameMedia(opts: {
  steamAppId?: string | null;
  url?: string | null;
  githubRepo?: string | null;
}): Promise<GameMediaBundle> {
  let bundle = emptyGameMedia();

  const steamId = opts.steamAppId?.trim();
  if (steamId) {
    bundle = mergeGameMedia(bundle, await fetchSteamStoreMedia(steamId));
  }

  const url = opts.url?.trim();
  const epicSlug = url ? parseEpicProductSlug(url) : null;
  if (epicSlug && (!steamId || bundle.screenshots.length < 4 || bundle.videos.length === 0)) {
    try {
      bundle = mergeGameMedia(bundle, await fetchEpicStoreMedia(epicSlug));
    } catch {
      /* soft-fail Epic */
    }
  }

  const shouldScrapeSite =
    Boolean(url) &&
    !epicSlug &&
    (!steamId || bundle.screenshots.length < 4 || bundle.videos.length === 0);
  if (shouldScrapeSite && url) {
    try {
      const site = await fetchWebsiteMedia(url);
      if (site) bundle = mergeGameMedia(bundle, site);
    } catch {
      /* soft-fail website */
    }
  }

  const repo = opts.githubRepo?.trim();
  if (repo && bundle.screenshots.length < 4) {
    try {
      const gh = await fetchGithubReadmeMedia(repo);
      if (gh) bundle = mergeGameMedia(bundle, gh);
    } catch {
      /* soft-fail readme */
    }
  }

  if (!steamId && !url && !repo) {
    throw new Error("Provide a Steam app id or website URL");
  }

  if (!bundle.coverImage && bundle.screenshots.length === 0 && bundle.videos.length === 0) {
    if (!steamId && !epicSlug) throw new Error("Could not fetch media from website");
  }

  return bundle;
}

/** Download a remote image, WebP-compress, and upload to Vercel Blob. */
export async function rehostImageToBlob(opts: {
  sourceUrl: string;
  slug: string;
  kind: string;
}): Promise<string | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  try {
    const res = await fetch(toHttpsUrl(opts.sourceUrl), {
      headers: { "user-agent": "PlayBoundAdmin/1.0" },
      signal: AbortSignal.timeout(20_000),
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    const input = Buffer.from(await res.arrayBuffer());
    const compressed = await compressImageBuffer(input);
    const slug = (opts.slug || "upload").replace(/[^a-z0-9-]/gi, "-").slice(0, 80) || "upload";
    const kind = opts.kind.replace(/[^a-z0-9-]/gi, "-").slice(0, 40) || "shot";
    const blob = await put(
      `games/${slug}/${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${compressed.extension}`,
      compressed.buffer,
      {
        access: "public",
        contentType: compressed.contentType,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      }
    );
    return blob.url;
  } catch {
    return null;
  }
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, () => worker())
  );
  return results;
}

/** Rehost cover + screenshots to Blob WebP; keep original URL if rehost fails. */
export type RehostStats = {
  fetched: number;
  rehosted: number;
  keptRemote: number;
};

export async function rehostMediaBundle(
  bundle: GameMediaBundle,
  slug: string
): Promise<GameMediaBundle & { stats: RehostStats }> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is required to rehost media");
  }

  let rehosted = 0;
  let keptRemote = 0;

  let coverImage = bundle.coverImage;
  if (coverImage && !coverImage.includes("blob.vercel-storage.com") && !coverImage.startsWith("/")) {
    const blob = await rehostImageToBlob({ sourceUrl: coverImage, slug, kind: "cover" });
    if (blob) {
      coverImage = blob;
      rehosted += 1;
    } else {
      coverImage = toHttpsUrl(coverImage);
      keptRemote += 1;
    }
  }

  const remoteShots = bundle.screenshots.filter(
    (u) => u && !u.includes("blob.vercel-storage.com") && !u.startsWith("/")
  );
  const localShots = bundle.screenshots.filter(
    (u) => u && (u.includes("blob.vercel-storage.com") || u.startsWith("/"))
  );

  const resolved = await mapPool(remoteShots, 3, async (sourceUrl, i) => {
    const blob = await rehostImageToBlob({ sourceUrl, slug, kind: `shot${i}` });
    if (blob) {
      rehosted += 1;
      return blob;
    }
    keptRemote += 1;
    return toHttpsUrl(sourceUrl);
  });

  const screenshots = [...localShots, ...resolved.filter(Boolean)].slice(0, MAX_SCREENSHOTS);

  return {
    coverImage,
    screenshots,
    videos: bundle.videos.map(toHttpsUrl).slice(0, MAX_VIDEOS),
    stats: {
      fetched: (bundle.coverImage ? 1 : 0) + bundle.screenshots.length + bundle.videos.length,
      rehosted,
      keptRemote,
    },
  };
}
