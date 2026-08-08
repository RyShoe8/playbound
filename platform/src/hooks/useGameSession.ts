"use client";

import { useCallback, useEffect, useRef } from "react";
import { telemetry } from "@/lib/telemetry";

/**
 * Tracks a browser game play session via the existing telemetry pipeline.
 *
 * Call `startSession(slug, title)` when the user clicks Play — this fires
 * `game_started`. When the tab becomes hidden or the user navigates away,
 * `game_finished` fires automatically with the computed `durationMs`.
 *
 * Only one session is active at a time; starting a new one ends the previous.
 */
export function useGameSession() {
  const sessionRef = useRef<{
    slug: string;
    title: string;
    startedAt: number;
  } | null>(null);

  const endSession = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    const durationMs = Date.now() - s.startedAt;
    telemetry.track("game_finished", {
      gameSlug: s.slug,
      gameTitle: s.title,
      durationMs,
      platform: "browser",
    });
    sessionRef.current = null;
  }, []);

  const startSession = useCallback(
    (slug: string, title: string) => {
      endSession(); // end previous if any
      telemetry.track("launch_attempted", {
        gameSlug: slug,
        gameTitle: title,
        platform: "browser",
        source: "website",
        phase: "browser-play",
      });
      try {
        sessionRef.current = { slug, title, startedAt: Date.now() };
        telemetry.track("game_started", {
          gameSlug: slug,
          gameTitle: title,
          platform: "browser",
          installMethod: "browser",
          source: "website",
        });
      } catch (err) {
        telemetry.track("launch_failed", {
          gameSlug: slug,
          gameTitle: title,
          platform: "browser",
          source: "website",
          code: "BROWSER_SESSION_FAILED",
          message: err instanceof Error ? err.message : String(err),
          phase: "browser-play",
        });
        throw err;
      }
    },
    [endSession]
  );

  // End session on tab visibility change or page unload
  useEffect(() => {
    const onVisChange = () => {
      if (document.visibilityState === "hidden" && sessionRef.current) {
        endSession();
      }
    };
    const onUnload = () => endSession();

    document.addEventListener("visibilitychange", onVisChange);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisChange);
      window.removeEventListener("beforeunload", onUnload);
      endSession();
    };
  }, [endSession]);

  return { startSession, endSession };
}
