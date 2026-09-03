"use client";

import { useEffect, useRef } from "react";

/**
 * Poll on an interval, but only while somebody is looking.
 *
 * Every poller on the site ran at full cadence forever: a background tab, a
 * minimised window and a laptop closed on a desk all kept asking. The
 * notification bell alone is a request every 10s for the life of the tab, and
 * each one costs an auth lookup plus its reads — so an abandoned tab was
 * generating thousands of function invocations and tens of thousands of Mongo
 * operations a day for a page nobody had in front of them.
 *
 * `document.visibilityState` is the whole fix. Ticks that land while the page
 * is hidden are skipped, and becoming visible fires one immediate refresh so
 * the first thing a returning user sees is current rather than however stale
 * the last tick left it.
 *
 * The interval itself keeps running rather than being torn down and rebuilt:
 * cadence stays anchored to when polling started, and the skip is one property
 * read. `fn` is held in a ref so a caller passing an inline function does not
 * restart the timer on every render.
 *
 * @param fn        what to run on each tick; skipped while hidden
 * @param intervalMs cadence, or null to not poll at all
 * @param opts.runOnVisible refresh immediately when the page becomes visible
 *                          (default true; pass false when a tick is expensive
 *                          enough that a tab-flick should not trigger one)
 */
export function useVisiblePolling(
  fn: () => void | Promise<void>,
  intervalMs: number | null,
  opts: { runOnVisible?: boolean } = {}
) {
  const runOnVisible = opts.runOnVisible !== false;
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  useEffect(() => {
    if (!intervalMs) return;

    const hidden = () =>
      typeof document !== "undefined" && document.visibilityState === "hidden";

    const timer = window.setInterval(() => {
      if (hidden()) return;
      void fnRef.current();
    }, intervalMs);

    let onVisible: (() => void) | null = null;
    if (runOnVisible) {
      onVisible = () => {
        if (!hidden()) void fnRef.current();
      };
      document.addEventListener("visibilitychange", onVisible);
    }

    return () => {
      window.clearInterval(timer);
      if (onVisible) document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, runOnVisible]);
}
