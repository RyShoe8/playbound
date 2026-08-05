"use client";

import { useEffect, useRef } from "react";
import Hls from "hls.js";

/** Plays HLS (e.g. Steam trailers) in Chrome via hls.js; Safari uses native HLS. */
export function HlsVideo({
  src,
  poster,
  className,
  title,
}: {
  src: string;
  poster?: string;
  className?: string;
  title?: string;
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
      controls
      playsInline
      preload="metadata"
      poster={poster}
      title={title}
      className={className}
    />
  );
}
