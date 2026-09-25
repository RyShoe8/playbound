"use client";

import { useEffect, useRef } from "react";

/** Plays HLS (e.g. Steam trailers) in Chrome via hls.js; Safari uses native HLS. */
export function HlsVideo({
  src,
  poster,
  className,
  title,
  /*
   * Defaults describe the Media tab, which is where a trailer is watched: a
   * player with controls that waits to be asked. The hero passes the opposite
   * — a muted, looping backdrop — and nothing else has to change for it.
   */
  controls = true,
  autoPlay = false,
  muted = false,
  loop = false,
}: {
  src: string;
  poster?: string;
  className?: string;
  title?: string;
  controls?: boolean;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    if (video.canPlayType("application/vnd.apple.mpegurl") || !/\.m3u8(\?|$)/i.test(src)) {
      video.src = src;
      return;
    }

    /*
     * hls.js (~500 KB with its dependencies) is loaded on demand: it was a
     * static import, so every game page shipped it in its main bundle even
     * where native HLS or a plain MP4 made it unnecessary.
     */
    let cancelled = false;
    let destroy: (() => void) | undefined;
    void import("hls.js").then(({ default: Hls }) => {
      if (cancelled) return;
      if (!Hls.isSupported()) {
        video.src = src;
        return;
      }
      const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
      hls.loadSource(src);
      hls.attachMedia(video);
      destroy = () => hls.destroy();
    });
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [src]);

  return (
    <video
      ref={ref}
      controls={controls}
      autoPlay={autoPlay}
      muted={muted}
      loop={loop}
      playsInline
      preload="metadata"
      poster={poster}
      title={title}
      className={className}
    />
  );
}
