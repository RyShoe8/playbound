export type MediaKind = "youtube" | "vimeo" | "direct" | "hls";

export type ClassifiedMedia = {
  kind: MediaKind;
  /** Original URL as stored. */
  src: string;
  /** Embeddable URL for iframes when applicable. */
  embedUrl?: string;
};

export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.replace(/^\//, "").split("/")[0] || null;
    }
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname.startsWith("/embed/")) return u.pathname.split("/")[2] || null;
      if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2] || null;
      return u.searchParams.get("v");
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function vimeoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("vimeo.com")) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    const id = parts.find((p) => /^\d+$/.test(p));
    return id || null;
  } catch {
    return null;
  }
}

function toHttps(url: string): string {
  if (url.startsWith("http://")) return `https://${url.slice("http://".length)}`;
  return url;
}

function looksLikeHls(url: string): boolean {
  try {
    const u = new URL(url);
    if (/\.m3u8$/i.test(u.pathname)) return true;
    if (/hls_264|hls_h264|\/hls_/i.test(u.pathname + u.search)) return true;
    if (u.hostname.includes("video.akamai.steamstatic.com") && u.pathname.includes("hls")) return true;
  } catch {
    return /\.m3u8(\?|$)/i.test(url);
  }
  return false;
}

function looksLikeDirectVideo(url: string): boolean {
  try {
    const u = new URL(url);
    if (/\.(mp4|webm|m3u8)(\?|$)/i.test(u.pathname)) return true;
    if (u.hostname.includes("steamstatic.com") && /\/movie/i.test(u.pathname)) return true;
    return looksLikeHls(url);
  } catch {
    return /\.(mp4|webm|m3u8)(\?|$)/i.test(url);
  }
}

/** True when the URL can render in GameMedia / HlsVideo (YT, Vimeo, HLS, direct file). */
export function isPlayableVideoUrl(url: string): boolean {
  const normalized = toHttps(url.trim());
  if (!/^https?:\/\//i.test(normalized)) return false;
  if (youtubeId(normalized) || vimeoId(normalized)) return true;
  return looksLikeDirectVideo(normalized);
}

/** Canonical watch URL for YouTube; https for everything else. */
export function normalizeVideoUrl(url: string): string | null {
  const normalized = toHttps(url.trim());
  if (!isPlayableVideoUrl(normalized)) return null;
  const yt = youtubeId(normalized);
  if (yt) return `https://www.youtube.com/watch?v=${yt}`;
  const vim = vimeoId(normalized);
  if (vim) return `https://vimeo.com/${vim}`;
  return normalized;
}

export function classifyMediaUrl(src: string): ClassifiedMedia {
  const stored = normalizeVideoUrl(src) || toHttps(src);
  const yt = youtubeId(stored);
  if (yt) {
    return { kind: "youtube", src: stored, embedUrl: `https://www.youtube-nocookie.com/embed/${yt}` };
  }
  const vim = vimeoId(stored);
  if (vim) {
    return { kind: "vimeo", src: stored, embedUrl: `https://player.vimeo.com/video/${vim}` };
  }
  if (looksLikeHls(stored)) {
    return { kind: "hls", src: stored };
  }
  return { kind: "direct", src: stored };
}

/**
 * A shape the hero reel can render, from the same URLs the Media tab uses.
 *
 * Videos come first because a trailer is what a game leads with — the same
 * order Steam puts them in — and screenshots follow in the order they were
 * curated. Nothing is invented: a game with no media produces an empty list
 * and the page falls back to its generated art.
 */
export type HeroMediaItem =
  | { type: "image"; src: string }
  | { type: "video"; kind: "direct" | "hls"; src: string }
  | {
      type: "embed";
      kind: "youtube" | "vimeo";
      src: string;
      embedUrl: string;
      poster: string | null;
    };

export function heroMediaItems(
  videos: readonly string[] | undefined,
  screenshots: readonly string[] | undefined,
  limit = 12
): HeroMediaItem[] {
  const items: HeroMediaItem[] = [];

  for (const raw of videos ?? []) {
    if (!raw) continue;
    const media = classifyMediaUrl(raw);
    if (media.kind === "youtube" || media.kind === "vimeo") {
      if (!media.embedUrl) continue;
      const id = media.kind === "youtube" ? youtubeId(media.src) : null;
      items.push({
        type: "embed",
        kind: media.kind,
        src: media.src,
        embedUrl: media.embedUrl,
        /*
         * YouTube serves a poster frame from a predictable URL. Vimeo does not
         * — its thumbnails need an API call — so those slides show a play
         * control on black rather than a wrong or missing image.
         */
        poster: id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null,
      });
    } else {
      items.push({ type: "video", kind: media.kind, src: media.src });
    }
  }

  for (const src of screenshots ?? []) {
    if (src) items.push({ type: "image", src });
  }

  /*
   * Capped. Every extra slide is another dot in a strip that has to stay
   * readable at the bottom of a hero, and nobody arrows through forty
   * screenshots — the Media tab is where the full set lives.
   */
  return items.slice(0, limit);
}
