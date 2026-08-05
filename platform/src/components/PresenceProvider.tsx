"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  describeRoute,
  reportRoute,
  reportVisibility,
  startPresence,
  stopPresence,
} from "@/lib/presence/client";

/**
 * Drives the presence lifecycle. Renders nothing.
 *
 * Deliberately thin: all the guarding, timing and retrying lives in
 * lib/presence/client, which is a module singleton. If this component were
 * mounted twice, both instances would call into the same controller and the
 * second start would be a no-op — where per-component state would have opened
 * two sessions and two timers.
 *
 * Mounted once inside SessionProvider in the root layout.
 */
export function PresenceProvider() {
  const { status: authStatus } = useSession();
  const pathname = usePathname();
  const startedRef = useRef(false);
  const lastPathRef = useRef<string | null>(null);

  const signedIn = authStatus === "authenticated";

  // Start on sign-in; tear down on sign-out. Anonymous visitors never touch
  // the presence API at all.
  useEffect(() => {
    if (!signedIn) {
      if (startedRef.current) {
        startedRef.current = false;
        stopPresence();
      }
      return;
    }
    if (startedRef.current) return;

    startedRef.current = true;
    const path = pathname || "/";
    const { status, gameId, editionId } = describeRoute(path);
    void startPresence({ status, page: path, gameId, editionId });
    lastPathRef.current = path;
  }, [signedIn, pathname]);

  // Route changes. Guarded so a re-render with the same path is not reported.
  useEffect(() => {
    if (!signedIn || !startedRef.current) return;
    const path = pathname || "/";
    if (lastPathRef.current === path) return;
    lastPathRef.current = path;
    reportRoute(path);
  }, [pathname, signedIn]);

  // Visibility and unload.
  useEffect(() => {
    if (!signedIn) return;

    const onVisibility = () => reportVisibility(document.visibilityState === "hidden");

    /**
     * `pagehide` rather than `beforeunload`: it fires for bfcache navigations
     * and mobile tab disposal, where beforeunload does not — and the console
     * already reports a permissions-policy violation for `unload` handlers.
     */
    const onPageHide = () => stopPresence({ beacon: true });

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [signedIn]);

  return null;
}
