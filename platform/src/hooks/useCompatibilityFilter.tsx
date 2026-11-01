"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useSession } from "next-auth/react";
import type {
  CompatibilityFilterMode,
  DeviceType,
} from "@/lib/compatibility/compatibility";
import { useDevice, type DeviceInfo } from "@/hooks/useDevice";

const STORAGE_KEY = "pb-compatibility-filter";
const MOBILE_STORAGE_KEY = "pb-compatibility-filter-mobile";
const COOKIE_KEY = "pb-compat-filter";
const CHANGE_EVENT = "pb-compatibility-filter-change";

export type CompatibilityFilterContextValue = {
  mode: CompatibilityFilterMode;
  setMode: (mode: CompatibilityFilterMode) => void;
  device: DeviceInfo;
  showCompatibleOnly: boolean;
  ready: boolean;
};

const CompatibilityFilterContext = createContext<CompatibilityFilterContextValue | null>(
  null
);

function isMode(value: string | null | undefined): value is CompatibilityFilterMode {
  return value === "compatible" || value === "all";
}

function isMobileViewport(): boolean {
  return window.matchMedia("(max-width: 767px)").matches;
}

function readLocalMode(): CompatibilityFilterMode {
  const mobile = isMobileViewport();
  try {
    const v = localStorage.getItem(mobile ? MOBILE_STORAGE_KEY : STORAGE_KEY);
    if (isMode(v)) return v;
  } catch {
    /* private mode */
  }
  // Keep phone and desktop choices independent. A saved desktop preference
  // must not hide the PC catalog the first time someone opens the site on a phone.
  return mobile ? "all" : "compatible";
}

function writeLocalMode(mode: CompatibilityFilterMode) {
  try {
    localStorage.setItem(isMobileViewport() ? MOBILE_STORAGE_KEY : STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
  try {
    document.cookie = `${COOKIE_KEY}=${mode};path=/;max-age=31536000;samesite=lax`;
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribeLocal(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  const mobileQuery = window.matchMedia("(max-width: 767px)");
  mobileQuery.addEventListener("change", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
    mobileQuery.removeEventListener("change", onChange);
  };
}

async function fetchServerMode(): Promise<CompatibilityFilterMode | null> {
  try {
    const res = await fetch("/api/auth/preferences", { credentials: "include" });
    if (!res.ok) return null;
    const data = (await res.json()) as { preferences?: { compatibilityFilter?: string } };
    const v = data.preferences?.compatibilityFilter;
    return isMode(v) ? v : null;
  } catch {
    return null;
  }
}

async function patchServerMode(mode: CompatibilityFilterMode): Promise<void> {
  try {
    await fetch("/api/auth/preferences", {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ compatibilityFilter: mode }),
    });
  } catch {
    /* offline / guest */
  }
}

export function CompatibilityProvider({
  children,
  ssrDevice = "desktop",
}: {
  children: ReactNode;
  ssrDevice?: DeviceType;
}) {
  const { status } = useSession();
  const device = useDevice(ssrDevice);
  const mode = useSyncExternalStore<CompatibilityFilterMode>(
    subscribeLocal,
    readLocalMode,
    () => "compatible"
  );
  const [ready, setReady] = useState(false);
  const syncedUser = useRef(false);

  // After auth resolves: prefer profile; else push local → profile once.
  useEffect(() => {
    if (status === "loading") return;
    let cancelled = false;

    (async () => {
      if (status !== "authenticated" || device.isMobile) {
        if (!cancelled) setReady(true);
        return;
      }
      if (syncedUser.current) {
        if (!cancelled) setReady(true);
        return;
      }
      syncedUser.current = true;

      const serverMode = await fetchServerMode();
      if (cancelled) return;

      if (serverMode) {
        writeLocalMode(serverMode);
      } else {
        const local = readLocalMode();
        await patchServerMode(local);
      }
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [status, device.isMobile]);

  useEffect(() => {
    if (status === "unauthenticated") syncedUser.current = false;
  }, [status]);

  /*
   * Mirror the mode onto <html> for the pre-hydration CSS.
   *
   * Phones default to all games, so first paint shows everything; globals.css
   * hides desktop-only games under 768px only once a viewer has chosen
   * "This Device", which CSS cannot read from localStorage.
   */
  useEffect(() => {
    document.documentElement.classList.toggle("compat-only", mode === "compatible");
  }, [mode]);

  const setMode = useCallback(
    (next: CompatibilityFilterMode) => {
      writeLocalMode(next);
      if (status === "authenticated" && !device.isMobile) void patchServerMode(next);
    },
    [status, device.isMobile]
  );

  const value = useMemo<CompatibilityFilterContextValue>(
    () => ({
      mode,
      setMode,
      device,
      showCompatibleOnly: mode === "compatible",
      ready,
    }),
    [mode, setMode, device, ready]
  );

  return (
    <CompatibilityFilterContext.Provider value={value}>
      {children}
    </CompatibilityFilterContext.Provider>
  );
}

export function useCompatibilityFilter(): CompatibilityFilterContextValue {
  const ctx = useContext(CompatibilityFilterContext);
  if (!ctx) {
    throw new Error("useCompatibilityFilter must be used within CompatibilityProvider");
  }
  return ctx;
}
