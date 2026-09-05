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

function readLocalMode(): CompatibilityFilterMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (isMode(v)) return v;
  } catch {
    /* private mode */
  }
  return "compatible";
}

function writeLocalMode(mode: CompatibilityFilterMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
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
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
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
      if (status !== "authenticated") {
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
  }, [status]);

  useEffect(() => {
    if (status === "unauthenticated") syncedUser.current = false;
  }, [status]);

  /*
   * Mirror the mode onto <html> for the pre-hydration CSS.
   *
   * globals.css hides desktop-only games under 768px so a phone does not
   * paint 74 games it is about to remove. "Compatible only" is the default,
   * so that rule is right for a first paint — but a viewer who chose "all
   * games" must get them back, and CSS cannot read localStorage. This is the
   * one thing the stylesheet needs from the client.
   */
  useEffect(() => {
    document.documentElement.classList.toggle("compat-show-all", mode === "all");
  }, [mode]);

  const setMode = useCallback(
    (next: CompatibilityFilterMode) => {
      writeLocalMode(next);
      if (status === "authenticated") void patchServerMode(next);
    },
    [status]
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
