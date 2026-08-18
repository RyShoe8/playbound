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
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  DEFAULT_DISCOVERY_MODE,
  DISCOVERY_MODE_COOKIE,
  DISCOVERY_MODE_COOKIE_MAX_AGE,
  type DiscoveryMode,
} from "@/lib/access/discoveryMode";

const STORAGE_KEY = "pb_discovery";
const CHANGE_EVENT = "pb-discovery-mode-change";

export type DiscoveryModeContextValue = {
  mode: DiscoveryMode;
  setMode: (mode: DiscoveryMode) => void;
  ready: boolean;
};

const DiscoveryModeContext = createContext<DiscoveryModeContextValue | null>(null);

function isMode(value: string | null | undefined): value is DiscoveryMode {
  return value === "FREE" || value === "ALL";
}

function readLocalMode(): DiscoveryMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (isMode(v)) return v;
  } catch {
    /* private mode */
  }
  return DEFAULT_DISCOVERY_MODE;
}

function writeLocalMode(mode: DiscoveryMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
  try {
    document.cookie = `${DISCOVERY_MODE_COOKIE}=${mode};path=/;max-age=${DISCOVERY_MODE_COOKIE_MAX_AGE};samesite=lax`;
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

async function fetchServerMode(): Promise<DiscoveryMode | null> {
  try {
    const res = await fetch("/api/auth/preferences", { credentials: "include" });
    if (!res.ok) return null;
    const data = (await res.json()) as { preferences?: { discoveryMode?: string } };
    const v = data.preferences?.discoveryMode;
    return isMode(v) ? v : null;
  } catch {
    return null;
  }
}

async function patchServerMode(mode: DiscoveryMode): Promise<void> {
  try {
    await fetch("/api/auth/preferences", {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ discoveryMode: mode }),
    });
  } catch {
    /* offline / guest */
  }
}

export function DiscoveryModeProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const router = useRouter();
  const mode = useSyncExternalStore<DiscoveryMode>(
    subscribeLocal,
    readLocalMode,
    () => DEFAULT_DISCOVERY_MODE
  );
  const [ready, setReady] = useState(false);
  const syncedUser = useRef(false);

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
        await patchServerMode(readLocalMode());
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

  const setMode = useCallback(
    (next: DiscoveryMode) => {
      writeLocalMode(next);
      if (status === "authenticated") void patchServerMode(next);
      router.refresh();
    },
    [status, router]
  );

  const value = useMemo<DiscoveryModeContextValue>(
    () => ({ mode, setMode, ready }),
    [mode, setMode, ready]
  );

  return <DiscoveryModeContext.Provider value={value}>{children}</DiscoveryModeContext.Provider>;
}

export function useDiscoveryMode(): DiscoveryModeContextValue {
  const ctx = useContext(DiscoveryModeContext);
  if (!ctx) {
    throw new Error("useDiscoveryMode must be used within DiscoveryModeProvider");
  }
  return ctx;
}
