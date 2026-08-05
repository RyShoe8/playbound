"use client";

import { create } from "zustand";
import type { ClientReportableStatus, PresenceDevice, PresencePlatform } from "@/lib/presence/types";

/**
 * Client-side view of the current user's presence.
 *
 * Holds only what the UI needs to read synchronously. The network lifecycle —
 * starting, beating, retrying, ending — lives in PresenceProvider; this store
 * is state, not behaviour, so components can subscribe without any of them
 * being able to start a second heartbeat loop.
 *
 * Stage 2 reads *other* users' presence from the API. This store is strictly
 * "me".
 */
export interface PresenceStoreState {
  /** False until the first successful start, so UI can avoid flashing "offline". */
  ready: boolean;
  loading: boolean;
  /** True once /start succeeded and a session exists. */
  active: boolean;

  status: ClientReportableStatus | "offline";
  currentPage: string | null;
  currentGame: string | null;
  currentEdition: string | null;

  sessionId: string | null;
  platform: PresencePlatform | null;
  device: PresenceDevice | null;

  lastHeartbeat: string | null;
  /** Consecutive heartbeat failures; drives backoff and is reset on success. */
  failures: number;
  lastError: string | null;

  setLoading: (loading: boolean) => void;
  setStarted: (info: {
    sessionId: string;
    platform: PresencePlatform;
    device: PresenceDevice;
  }) => void;
  setStatus: (status: ClientReportableStatus | "offline") => void;
  setRoute: (page: string | null, game: string | null, edition: string | null) => void;
  recordHeartbeat: (at: string) => void;
  recordFailure: (message: string) => void;
  reset: () => void;
}

const initial = {
  ready: false,
  loading: false,
  active: false,
  status: "offline" as const,
  currentPage: null,
  currentGame: null,
  currentEdition: null,
  sessionId: null,
  platform: null,
  device: null,
  lastHeartbeat: null,
  failures: 0,
  lastError: null,
};

export const usePresenceStore = create<PresenceStoreState>((set) => ({
  ...initial,

  setLoading: (loading) => set({ loading }),

  setStarted: ({ sessionId, platform, device }) =>
    set({
      sessionId,
      platform,
      device,
      active: true,
      ready: true,
      loading: false,
      failures: 0,
      lastError: null,
      status: "online",
    }),

  setStatus: (status) => set({ status }),

  setRoute: (currentPage, currentGame, currentEdition) =>
    set({ currentPage, currentGame, currentEdition }),

  recordHeartbeat: (lastHeartbeat) =>
    set({ lastHeartbeat, failures: 0, lastError: null, ready: true }),

  // Deliberately does not clear `active`: a failed beat is usually transient
  // and tearing the session down here would fight the retry logic.
  recordFailure: (lastError) =>
    set((state) => ({ failures: state.failures + 1, lastError })),

  reset: () => set({ ...initial }),
}));

/** Read presence without subscribing — for imperative code paths. */
export const presenceSnapshot = () => usePresenceStore.getState();
