"use client";

import { createContext, useContext, useEffect, useSyncExternalStore } from "react";
import { readLauncherKnown, rememberLauncherKnown } from "@/lib/launcherKnown";

/**
 * Whether we already know this person has the PlayBound launcher.
 *
 * The browser cannot tell whether a playbound:// link was handled, so
 * `openPlayboundDeepLink` guesses from the tab losing focus and downloads the
 * installer when it did not. A launcher that is already running often takes the
 * link without stealing focus, which made "Install" start the game *and* download
 * Setup for people who have the launcher.
 *
 * Two sources: a page that can prove it (the library, from launcher-synced rows)
 * supplies it through the provider; everywhere else the browser's own memory of an
 * earlier successful hand-off is used.
 */
const LauncherKnownContext = createContext(false);

export function LauncherKnownProvider({ value, children }: { value: boolean; children: React.ReactNode }) {
  useEffect(() => {
    if (value) rememberLauncherKnown();
  }, [value]);
  return <LauncherKnownContext.Provider value={value}>{children}</LauncherKnownContext.Provider>;
}

const subscribe = (notify: () => void) => {
  window.addEventListener("storage", notify);
  return () => window.removeEventListener("storage", notify);
};

export function useLauncherKnown(): boolean {
  const fromPage = useContext(LauncherKnownContext);
  // Server and first client render both say "unknown", so hydration matches.
  const remembered = useSyncExternalStore(subscribe, readLauncherKnown, () => false);
  return fromPage || remembered;
}
