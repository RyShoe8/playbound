"use client";

import { useEffect, useRef } from "react";
import Hls from "hls.js";

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

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      return;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
      });
      hls.loadSource(src);
      hls.attachMedia(video);
      return () => {
        hls.destroy();
      };
    }

    video.src = src;
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
