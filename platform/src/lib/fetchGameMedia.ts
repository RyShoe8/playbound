/** Shared media fetch + merge for admin import, fetch, and catalog backfill. */

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

/** Pull cover/screenshots/videos from an already-fetched Steam appdetails payload. */
export function parseSteamStoreMedia(data: Record<string, unknown>): GameMediaBundle {
  const coverImage = (data.header_image as string) || null;
  const screenshots = Array.isArray(data.screenshots)
    ? (data.screenshots as { path_full?: string }[])
        .map((s) => s.path_full)
        .filter((u): u is string => Boolean(u))
        .slice(0, MAX_SCREENSHOTS)
    : [];

  const videos: string[] = [];
  if (Array.isArray(data.movies)) {
    for (const movie of data.movies as {
      mp4?: { max?: string; "480"?: string };
      webm?: { max?: string };
    }[]) {
      const url = movie.mp4?.max || movie.mp4?.["480"] || movie.webm?.max;
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
