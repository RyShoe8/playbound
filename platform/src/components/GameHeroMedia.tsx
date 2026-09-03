"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { HlsVideo } from "@/components/HlsVideo";

/**
 * The game page hero, as a Steam-style reel of trailers and screenshots.
 *
 * Website only — the launcher renders its own hero and does not use this. The
 * Media tab is untouched: this is a second view of the same URLs, not a
 * replacement for the place people go to look through everything.
 *
 * Two things shape the design.
 *
 * **The hero has words on it.** Title, tagline and the install buttons sit
 * above this, over a gradient. So a slide is a backdrop first and a video
 * player second: muted, looping, no chrome, nothing that competes with the
 * text or moves under someone's cursor while they aim for Install.
 *
 * **An embed is not a backdrop.** YouTube and Vimeo cannot be autoplayed
 * muted-and-silent reliably, and loading an iframe per slide would cost far
 * more than the page is worth. Those slides show their poster frame and swap
 * in the real player only when someone asks for it.
 */

export type HeroMediaItem =
  | { type: "image"; src: string }
  | { type: "video"; kind: "direct" | "hls"; src: string }
  | { type: "embed"; kind: "youtube" | "vimeo"; src: string; embedUrl: string; poster: string | null };

export function GameHeroMedia({
  items,
  title,
  poster,
}: {
  items: HeroMediaItem[];
  title: string;
  poster?: string | null;
}) {
  const [index, setIndex] = useState(0);
  const [playingEmbed, setPlayingEmbed] = useState<number | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  const count = items.length;
  const go = useCallback(
    (delta: number) => {
      if (count < 2) return;
      // Wrapping is what makes the arrows always useful; a reel that dead-ends
      // on the last screenshot just looks broken.
      setIndex((i) => (i + delta + count) % count);
      // A player left running behind a different slide would keep talking.
      setPlayingEmbed(null);
    },
    [count]
  );

  useEffect(() => {
    if (count < 2) return;
    function onKey(event: KeyboardEvent) {
      /*
       * Only when the reel has focus. These are the arrow keys — taking them
       * globally would hijack scrolling for anyone reading further down the
       * page, and this is decoration at the top of it.
       */
      if (!frameRef.current?.contains(document.activeElement)) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        go(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        go(1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count, go]);

  const item = items[index];
  if (!item) return null;

  return (
    <div
      ref={frameRef}
      className="absolute inset-0"
      // Focusable so the arrow keys have somewhere to belong, and labelled so
      // it is not an anonymous tab stop.
      tabIndex={0}
      role="group"
      aria-roledescription="carousel"
      aria-label={`${title} media`}
    >
      <Slide item={item} title={title} poster={poster} playing={playingEmbed === index} onPlay={() => setPlayingEmbed(index)} />

      {count > 1 ? (
        <>
          <ReelButton side="left" label="Previous media" onClick={() => go(-1)} />
          <ReelButton side="right" label="Next media" onClick={() => go(1)} />

          {/*
            * Low and centred, clear of the title block on the left and the
            * install buttons on the right.
            */}
          <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
            <div className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1.5 backdrop-blur-sm">
              {items.map((entry, i) => (
                <button
                  key={`${entry.type}-${i}`}
                  type="button"
                  onClick={() => {
                    setIndex(i);
                    setPlayingEmbed(null);
                  }}
                  aria-label={`Show ${entry.type === "image" ? "screenshot" : "video"} ${i + 1} of ${count}`}
                  aria-current={i === index}
                  className={`h-1.5 rounded-full transition-all ${
                    i === index ? "w-5 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80"
                  }`}
                />
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function ReelButton({
  side,
  label,
  onClick,
}: {
  side: "left" | "right";
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`absolute top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white/90 backdrop-blur-sm transition hover:bg-black/70 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
        side === "left" ? "left-2 sm:left-4" : "right-2 sm:right-4"
      }`}
    >
      {side === "left" ? <ChevronLeft className="size-5" /> : <ChevronRight className="size-5" />}
    </button>
  );
}

function Slide({
  item,
  title,
  poster,
  playing,
  onPlay,
}: {
  item: HeroMediaItem;
  title: string;
  poster?: string | null;
  playing: boolean;
  onPlay: () => void;
}) {
  if (item.type === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={item.src} alt={`${title} screenshot`} className="h-full w-full object-cover" />
    );
  }

  if (item.type === "video") {
    /*
     * Muted and looping on purpose. Sound behind a page someone did not ask to
     * make noise is the fastest way to get a tab closed, and the Media tab is
     * where a trailer is watched properly.
     */
    if (item.kind === "hls") {
      return (
        <HlsVideo
          src={item.src}
          poster={poster || undefined}
          title={`${title} trailer`}
          controls={false}
          autoPlay
          muted
          loop
          className="h-full w-full object-cover"
        />
      );
    }
    return (
      <video
        src={item.src}
        poster={poster || undefined}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-label={`${title} trailer`}
        className="h-full w-full object-cover"
      />
    );
  }

  if (playing) {
    return (
      <iframe
        src={`${item.embedUrl}${item.embedUrl.includes("?") ? "&" : "?"}autoplay=1`}
        title={`${title} video`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="h-full w-full"
      />
    );
  }

  /*
   * The poster is scenery and the play control is a button, rather than the
   * whole slide being one. A full-bleed button means any stray click in the
   * hero starts a video, and it puts a hit target under the title and the
   * install buttons — which is exactly how this shipped broken the first time.
   */
  return (
    <>
      {item.poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.poster} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="block h-full w-full bg-black" />
      )}
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <button
          type="button"
          onClick={onPlay}
          aria-label={`Play ${title} video`}
          className="pointer-events-auto rounded-full bg-black/50 p-4 text-white transition hover:bg-black/75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <Play className="size-7 fill-current" />
        </button>
      </span>
    </>
  );
}
