export type MediaKind = "youtube" | "vimeo" | "direct" | "hls";

export type ClassifiedMedia = {
  kind: MediaKind;
  /** Original URL as stored. */
  src: string;
  /** Embeddable URL for iframes when applicable. */
  embedUrl?: string;
};

function youtubeId(url: string): string | null {
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

function vimeoId(url: string): string | null {
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

export function classifyMediaUrl(src: string): ClassifiedMedia {
  const normalized = toHttps(src);
  const yt = youtubeId(normalized);
  if (yt) {
    return { kind: "youtube", src: normalized, embedUrl: `https://www.youtube-nocookie.com/embed/${yt}` };
  }
  const vim = vimeoId(normalized);
  if (vim) {
    return { kind: "vimeo", src: normalized, embedUrl: `https://player.vimeo.com/video/${vim}` };
  }
  if (looksLikeHls(normalized)) {
    return { kind: "hls", src: normalized };
  }
  return { kind: "direct", src: normalized };
}
