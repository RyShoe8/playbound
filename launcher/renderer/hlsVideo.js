/**
 * Streamed (HLS) trailers in the launcher.
 *
 * Steam's store trailers are HLS playlists (.m3u8). Electron's Chromium cannot
 * play HLS on its own, so a <video src="…m3u8"> stayed black — every game whose
 * trailer came from Steam (Blastlane Racers, for one) had no working video in
 * the launcher while the website, which uses hls.js, played it fine. This uses
 * the same library, vendored in renderer/vendor (hls.js 1.6.16, Apache-2.0),
 * and loads it only when an HLS video is actually shown.
 */

export function isHlsUrl(src) {
  return /\.m3u8(\?|$)/i.test(String(src || ""));
}

let hlsModule = null;
function loadHls() {
  hlsModule ||= import("./vendor/hls.light.mjs").then((m) => m.default);
  return hlsModule;
}

/** Point a <video> at a source, attaching hls.js when it is an HLS playlist. */
export async function attachVideoSource(video, src) {
  if (!video || !src) return;
  if (!isHlsUrl(src) || video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = src;
    return;
  }
  try {
    const Hls = await loadHls();
    if (!Hls.isSupported()) {
      video.src = src;
      return;
    }
    const hls = new Hls({ capLevelToPlayerSize: true });
    hls.loadSource(src);
    hls.attachMedia(video);
    // Released with the element so a closed detail view does not keep streaming.
    video.addEventListener("emptied", () => hls.destroy(), { once: true });
  } catch {
    video.src = src;
  }
}

/** Upgrade every `<video data-hls-src>` under a root, for views rendered as HTML strings. */
export function upgradeHlsVideos(root) {
  root?.querySelectorAll?.("video[data-hls-src]").forEach((video) => {
    const src = video.getAttribute("data-hls-src");
    video.removeAttribute("data-hls-src");
    void attachVideoSource(video, src);
  });
}
