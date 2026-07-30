export type MediaKind = "youtube" | "vimeo" | "direct";

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

export function classifyMediaUrl(src: string): ClassifiedMedia {
  const yt = youtubeId(src);
  if (yt) {
    return { kind: "youtube", src, embedUrl: `https://www.youtube-nocookie.com/embed/${yt}` };
  }
  const vim = vimeoId(src);
  if (vim) {
    return { kind: "vimeo", src, embedUrl: `https://player.vimeo.com/video/${vim}` };
  }
  return { kind: "direct", src };
}
