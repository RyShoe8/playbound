"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Render a long list in batches as the reader scrolls — no pagination.
 *
 * The page still receives the whole list, so filters and search cover every
 * item; only the number of rendered cards grows. The first batch renders on
 * the server, which keeps the initial HTML small (the Discover, Mods and
 * Deals pages were 0.9–1.6 MB of markup for every card at once). A sentinel
 * placed after the list loads the next batch shortly before it scrolls into
 * view. `resetKey` (e.g. the active filters) starts again from the top batch.
 */
export function useProgressiveList<T>(
  items: readonly T[],
  { initial = 36, step = 36, resetKey = "" }: { initial?: number; step?: number; resetKey?: string } = {}
) {
  const [count, setCount] = useState(initial);
  const [lastKey, setLastKey] = useState(resetKey);
  if (lastKey !== resetKey) {
    // Reset during render (not in an effect) so a filter change never flashes
    // the previous, longer list.
    setLastKey(resetKey);
    setCount(initial);
  }

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const hasMore = count < items.length;

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;
    if (typeof IntersectionObserver === "undefined") {
      // No observer (very old browsers): show everything, deferred a tick.
      const timer = setTimeout(() => setCount(items.length), 0);
      return () => clearTimeout(timer);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setCount((c) => Math.min(c + step, items.length));
      },
      { rootMargin: "1200px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, items.length, step, count]);

  return {
    visible: hasMore ? items.slice(0, count) : items,
    hasMore,
    /** Place after the list; renders nothing visible. */
    sentinel: hasMore ? <div ref={sentinelRef} aria-hidden className="h-px w-full" /> : null,
  };
}
