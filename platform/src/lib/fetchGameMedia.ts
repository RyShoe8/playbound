/** Shared media fetch, Steam inference, merge, and Blob rehost for admin Refresh. */

import { put } from "@vercel/blob";
import { compressImageBuffer } from "@/lib/compressImage";
import { tryFetchPageMeta } from "@/lib/pageMeta";

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

/** True when the gallery is empty, a single shot, or only Steam header/capsule assets. */
export function screenshotsAreThin(shots: string[] | null | undefined): boolean {
  const list = (shots ?? []).filter(Boolean);
  if (list.length <= 1) return true;
  if (list.length > 3) return false;
  return list.every((s) => /\/steam\/apps\/\d+\/(header|library_hero|capsule|logo)/i.test(s));
}

export function coverLooksLikeSteamHeader(cover: string | null | undefined): boolean {
  if (!cover) return true;
  return /\/steam\/apps\/\d+\/(header|library_hero|capsule)/i.test(cover);
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

function steamMovieUrl(movie: {
  mp4?: { max?: string; "480"?: string };
  webm?: { max?: string };
  hls_h264?: string;
}): string | null {
  const raw =
    movie.mp4?.max || movie.mp4?.["480"] || movie.webm?.max || movie.hls_h264 || null;
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
    for (const movie of data.movies as {
      mp4?: { max?: string; "480"?: string };
      webm?: { max?: string };
      hls_h264?: string;
    }[]) {
      const url = steamMovieUrl(movie);
      if (url && !videos.includes(url)) videos.push(url);
      if (videos.length >= MAX_VIDEOS) break;
    }
  }

  return { coverImage, screenshots, videos };
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
  return parseSteamStoreMedia(entry.data);
}

/** Open Graph / page meta images and videos (soft-fails via tryFetchPageMeta). */
export async function fetchWebsiteMedia(url: string): Promise<GameMediaBundle | null> {
  const result = await tryFetchPageMeta(url);
  if (!result.ok) return null;
  const { meta } = result;
  return {
    coverImage: meta.images[0] ?? null,
    screenshots: meta.images.slice(0, MAX_SCREENSHOTS),
    videos: meta.videos.slice(0, MAX_VIDEOS),
  };
}

/**
 * Prefer Steam when an app id is present, then merge website OG.
 * Website failures do not throw when Steam succeeded.
 */
export async function fetchCombinedGameMedia(opts: {
  steamAppId?: string | null;
  url?: string | null;
}): Promise<GameMediaBundle> {
  let bundle = emptyGameMedia();

  const steamId = opts.steamAppId?.trim();
  if (steamId) {
    bundle = mergeGameMedia(bundle, await fetchSteamStoreMedia(steamId));
  }

  const url = opts.url?.trim();
  if (url) {
    try {
      const site = await fetchWebsiteMedia(url);
      if (site) bundle = mergeGameMedia(bundle, site);
    } catch {
      /* soft-fail website */
    }
  }

  if (!steamId && !url) {
    throw new Error("Provide a Steam app id or website URL");
  }

  if (!bundle.coverImage && bundle.screenshots.length === 0 && bundle.videos.length === 0) {
    if (!steamId) throw new Error("Could not fetch media from website");
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

/** Rehost cover + screenshots to Blob WebP; leave videos as remote (HLS/CDN) URLs. */
export async function rehostMediaBundle(
  bundle: GameMediaBundle,
  slug: string
): Promise<GameMediaBundle> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is required to rehost media");
  }

  let coverImage = bundle.coverImage;
  if (coverImage && !coverImage.includes("blob.vercel-storage.com") && !coverImage.startsWith("/")) {
    coverImage = (await rehostImageToBlob({ sourceUrl: coverImage, slug, kind: "cover" })) || coverImage;
  }

  const remoteShots = bundle.screenshots.filter(
    (u) => u && !u.includes("blob.vercel-storage.com") && !u.startsWith("/")
  );
  const localShots = bundle.screenshots.filter(
    (u) => u && (u.includes("blob.vercel-storage.com") || u.startsWith("/"))
  );

  const rehosted = await mapPool(remoteShots, 3, async (sourceUrl, i) => {
    const url = await rehostImageToBlob({ sourceUrl, slug, kind: `shot${i}` });
    return url;
  });

  const screenshots = [...localShots, ...rehosted.filter((u): u is string => Boolean(u))].slice(
    0,
    MAX_SCREENSHOTS
  );

  return {
    coverImage,
    screenshots,
    videos: bundle.videos.map(toHttpsUrl).slice(0, MAX_VIDEOS),
  };
}
