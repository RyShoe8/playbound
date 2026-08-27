"use client";

import { create } from "zustand";
import type { PartyPayload, PartyVisibility } from "@/lib/playTogether/types";
import { presenceSnapshot, usePresenceStore } from "@/stores/presenceStore";
import { useFriendsStore } from "@/stores/friendsStore";

/**
 * Client-side party state.
 *
 * Holds the current user's active party and discoverable friend parties.
 * Network lifecycle (polling, error handling) follows the same pattern
 * as friendsStore.ts.
 */

interface PartyState {
  /** The party the current user is a member of (if any). */
  activeParty: PartyPayload | null;
  /** Friend parties visible to the user. */
  discoverableParties: PartyPayload[];
  loading: boolean;
  error: string | null;

  fetchParties: () => Promise<void>;
  createParty: (opts: {
    name?: string | null;
    gameSlug?: string | null;
    editionSlug?: string | null;
    modSlugs?: string[];
    visibility?: PartyVisibility;
    maxSize?: number;
    eventId?: string | null;
    password?: string | null;
    wantVoice?: boolean;
    /** "self" | "dedicated" | "public"; the server validates it against the game. */
    hostMode?: string | null;
  }) => Promise<(PartyPayload & { needsDiscordLink?: boolean; inviteUrl?: string | null }) | null>;
  joinParty: (
    partyId: string,
    password?: string
  ) => Promise<(PartyPayload & { needsDiscordLink?: boolean; inviteUrl?: string | null }) | null>;
  leaveParty: (partyId: string) => Promise<void>;
  setReady: (partyId: string, ready: boolean) => Promise<void>;
  launchParty: (partyId: string) => Promise<void>;
  joinGame: (partyId: string) => Promise<PartyPayload | null>;
  endParty: (partyId: string) => Promise<void>;
  inviteFriends: (
    partyId: string,
    friendIds: string[]
  ) => Promise<{ results: { recipientId: string; status: number }[] }>;
  provisionDiscord: (partyId: string) => Promise<{
    inviteUrl: string | null;
    needsDiscordLink?: boolean;
    error?: string | null;
  }>;
  setGame: (partyId: string, gameSlug: string) => Promise<void>;
  setHostMode: (partyId: string, hostMode: string) => Promise<void>;
  setPublicServer: (
    partyId: string,
    server: {
      id?: string | null;
      name?: string | null;
      host: string;
      port: number;
      mod?: string | null;
      protected?: boolean;
    }
  ) => Promise<void>;
  setEdition: (partyId: string, editionSlug: string | null) => Promise<void>;
  setOpenRaMod: (partyId: string, mod: string | null) => Promise<void>;
  setName: (partyId: string, name: string | null) => Promise<void>;
  removeMember: (partyId: string, userId: string) => Promise<void>;
  transferLeadership: (partyId: string, userId: string) => Promise<void>;
  setVisibility: (partyId: string, visibility: PartyVisibility) => Promise<void>;
  startPolling: (intervalMs?: number) => void;
  stopPolling: () => void;
}

let pollInterval: ReturnType<typeof setInterval> | null = null;
let pollSubscribers = 0;
let pollMs = 5000;
let requestedPollMs = 5000;
/** While > 0, polling must not overwrite activeParty with stale roster data. */
let partyMutationInFlight = 0;

const DEFAULT_PARTY_POLL_MS = 5000;
const FAST_PARTY_POLL_MS = 1000;
/** Slowest lane in the same request: friends' joinable parties. */
const DISCOVERABLE_MIN_MS = 5000;
let lastDiscoverableAt = 0;

function refreshFriendsAfterPartyMutation() {
  void useFriendsStore.getState().fetchFriends();
}

/** Refresh party roster and friend in-party badges together. */
export async function refreshPartyAndFriends() {
  const { fetchParties } = usePartyStore.getState();
  const { fetchFriends } = useFriendsStore.getState();
  await Promise.all([fetchParties(), fetchFriends()]);
}

function viewerIsInGame(party: PartyPayload | null): boolean {
  if (presenceSnapshot().status === "playing") return true;
  return Boolean(party?.selfPlaying);
}

function normalizeCreatedParty(
  data: Record<string, unknown>,
  recovered?: PartyPayload | null
): (PartyPayload & { needsDiscordLink?: boolean; inviteUrl?: string | null }) | null {
  const base = (data.party as PartyPayload | undefined) || recovered;
  if (!base?.id) return null;
  const inviteUrl =
    (typeof data.inviteUrl === "string" ? data.inviteUrl : null) ||
    base.discord?.inviteUrl ||
    null;
  return {
    ...base,
    voiceEnabled: Boolean(base.voiceEnabled) || Boolean(inviteUrl),
    discord: {
      voiceChannelId: base.discord?.voiceChannelId || null,
      textChannelId: base.discord?.textChannelId || null,
      inviteUrl,
    },
    needsDiscordLink: Boolean(data.needsDiscordLink),
    inviteUrl,
  };
}

async function recoverActivePartyAfterCreate(
  get: () => PartyState,
  attempts = 3
): Promise<PartyPayload | null> {
  for (let i = 0; i < attempts; i += 1) {
    await get().fetchParties();
    const found = get().activeParty;
    if (found?.id) return found;
    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 200 * (i + 1)));
    }
  }
  return null;
}

/** Live party, but only while this user is still in the lobby — not in-game. */
function needsFastPartyPoll(party: PartyPayload | null): boolean {
  if (!party || party.status === "ended") return false;
  return !viewerIsInGame(party);
}

/**
 * Polling-only fetch that collapses ticks landing on an open request.
 *
 * A lobby polls once a second, which is shorter than a slow party read on a
 * cold function — without this, one slow response has the next tick fire
 * anyway and the requests stack up, each one making the next slower.
 *
 * Mutations deliberately do not go through here: `leaveParty` and friends have
 * to see their own write, and piggybacking on a request that started before it
 * would hand them the state they just changed.
 */
let pollFetchInFlight: Promise<void> | null = null;

function pollParties(get: () => PartyState): Promise<void> {
  if (pollFetchInFlight) return pollFetchInFlight;
  const run = get()
    .fetchParties()
    .finally(() => {
      pollFetchInFlight = null;
    });
  pollFetchInFlight = run;
  return run;
}

function documentHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

/**
 * A hidden tab is polling for nobody.
 *
 * Browsers throttle background timers but do not stop them, so a party left
 * open in another tab kept billing a party read every few seconds. Suspending
 * while hidden and catching up the moment the tab comes back is both cheaper
 * and more responsive than the throttled tick would have been.
 */
let visibilityWired = false;

function wirePartyVisibility(get: () => PartyState) {
  if (visibilityWired || typeof document === "undefined") return;
  visibilityWired = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && pollSubscribers > 0) {
      void pollParties(get);
    }
    syncPartyPoll(get);
  });
}

function syncPartyPoll(get: () => PartyState) {
  const next = needsFastPartyPoll(get().activeParty)
    ? FAST_PARTY_POLL_MS
    : requestedPollMs;
  if (pollSubscribers === 0 || documentHidden()) {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    pollMs = next;
    return;
  }
  if (pollInterval && pollMs === next) return;
  if (pollInterval) clearInterval(pollInterval);
  pollMs = next;
  pollInterval = setInterval(() => {
    void pollParties(get);
  }, pollMs);
}

/**
 * Mutation responses describe the party, not the sync.
 *
 * Most mutation endpoints serialize the party without the config-sync block —
 * that is a separate read, and renaming a party has nothing to do with who has
 * the game installed. Installing the response wholesale therefore dropped
 * `configSync` and `readiness`, and the sync panel fell back to its loading
 * skeleton after every unrelated change until the next poll refilled them.
 * Carrying the previous values through keeps the panel on screen; the poll,
 * at most a second later, is what corrects them.
 */
function applyPartyUpdate(prev: PartyPayload | null, next: PartyPayload): PartyPayload {
  if (!prev || prev.id !== next.id) return next;
  return {
    ...next,
    configSync: next.configSync ?? prev.configSync,
    readiness: next.readiness ?? prev.readiness,
  };
}

/**
 * Unchanged payloads keep their previous object.
 *
 * Every poll used to install a brand-new party object, so a lobby at one poll
 * per second re-rendered the whole panel — and remounted anything keyed off
 * those objects, like the public-server list — once a second while nothing was
 * happening. Comparing the serialized payload is cheap next to the render it
 * avoids.
 */
function sameParty(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

export const usePartyStore = create<PartyState>((set, get) => ({
  activeParty: null,
  discoverableParties: [],
  loading: false,
  error: null,

  fetchParties: async () => {
    try {
      /*
       * Friends' joinable parties are asked for on their own slower cadence:
       * they cost more to compute than the caller's own party and nobody
       * notices one appearing a few seconds later, while the party itself has
       * to stay current to the second.
       */
      const wantDiscoverable = Date.now() - lastDiscoverableAt >= DISCOVERABLE_MIN_MS;
      const res = await fetch(wantDiscoverable ? "/api/parties" : "/api/parties?discoverable=0");
      if (!res.ok) return;
      const data = await res.json();
      if (wantDiscoverable) lastDiscoverableAt = Date.now();
      const myParties: PartyPayload[] = data.myParties || [];
      const nextActive = myParties[0] || null;
      // Absent means "not asked for this time", which is not the same as none.
      const nextDiscoverable: PartyPayload[] | null = Array.isArray(data.discoverable)
        ? data.discoverable
        : wantDiscoverable
          ? []
          : null;
      set((state) => {
        const keepActive =
          (partyMutationInFlight > 0 && state.activeParty?.id === nextActive?.id) ||
          sameParty(state.activeParty, nextActive);
        const keepDiscoverable =
          nextDiscoverable === null || sameParty(state.discoverableParties, nextDiscoverable);
        return {
          activeParty: keepActive ? state.activeParty : nextActive,
          discoverableParties: keepDiscoverable ? state.discoverableParties : nextDiscoverable,
          loading: false,
        };
      });
      syncPartyPoll(get);
    } catch (err) {
      console.error("Failed to fetch parties", err);
    }
  },

  createParty: async (opts) => {
    partyMutationInFlight += 1;
    set({ loading: true, error: null });
    try {
      const res = await fetch("/api/parties", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(opts),
      });
      const data = await res.json();
      if (!res.ok) {
        const recovered = await recoverActivePartyAfterCreate(get);
        if (recovered) {
          set({ activeParty: recovered, loading: false, error: null });
          syncPartyPoll(get);
          refreshFriendsAfterPartyMutation();
          return {
            ...recovered,
            needsDiscordLink: false,
            inviteUrl: recovered.discord?.inviteUrl || null,
          };
        }
        set({ error: data.error || "Failed to create party", loading: false });
        return null;
      }
      const party = normalizeCreatedParty(data);
      if (!party) {
        const recovered = await recoverActivePartyAfterCreate(get);
        if (recovered) {
          set({ activeParty: recovered, loading: false, error: null });
          syncPartyPoll(get);
          refreshFriendsAfterPartyMutation();
          return {
            ...recovered,
            needsDiscordLink: false,
            inviteUrl: recovered.discord?.inviteUrl || null,
          };
        }
        set({ error: "Failed to create party", loading: false });
        return null;
      }
      set({ activeParty: party, loading: false });
      syncPartyPoll(get);
      refreshFriendsAfterPartyMutation();
      return party;
    } catch (err) {
      const recovered = await recoverActivePartyAfterCreate(get);
      if (recovered) {
        set({ activeParty: recovered, loading: false, error: null });
        syncPartyPoll(get);
        refreshFriendsAfterPartyMutation();
        return {
          ...recovered,
          needsDiscordLink: false,
          inviteUrl: recovered.discord?.inviteUrl || null,
        };
      }
      set({ error: "Network error", loading: false });
      return null;
    } finally {
      partyMutationInFlight = Math.max(0, partyMutationInFlight - 1);
    }
  },

  joinParty: async (partyId, password) => {
    partyMutationInFlight += 1;
    set({ loading: true, error: null });
    try {
      const res = await fetch(`/api/parties/${partyId}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(password ? { password } : {}),
      });
      const data = await res.json();
      if (!res.ok) {
        set({ error: data.error || "Failed to join party", loading: false });
        return null;
      }
      const inviteUrl = data.inviteUrl || data.party?.discord?.inviteUrl || null;
      const party = {
        ...(data.party as PartyPayload),
        voiceEnabled: Boolean(data.party?.voiceEnabled) || Boolean(inviteUrl),
        discord: {
          voiceChannelId: data.party?.discord?.voiceChannelId || null,
          textChannelId: data.party?.discord?.textChannelId || null,
          inviteUrl,
        },
        needsDiscordLink: Boolean(data.needsDiscordLink),
        inviteUrl,
      };
      set({ activeParty: party, loading: false, error: null });
      syncPartyPoll(get);
      refreshFriendsAfterPartyMutation();
      return party;
    } catch (err) {
      set({ error: "Network error", loading: false });
      return null;
    } finally {
      partyMutationInFlight = Math.max(0, partyMutationInFlight - 1);
    }
  },

  leaveParty: async (partyId) => {
    partyMutationInFlight += 1;
    try {
      await fetch(`/api/parties/${partyId}/leave`, { method: "POST" });
      set({ activeParty: null });
      await get().fetchParties();
      refreshFriendsAfterPartyMutation();
    } catch (err) {
      console.error("Failed to leave party", err);
    } finally {
      partyMutationInFlight = Math.max(0, partyMutationInFlight - 1);
    }
  },

  setReady: async (partyId, ready) => {
    try {
      const res = await fetch(`/api/parties/${partyId}/ready`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ready }),
      });
      if (res.ok) {
        const data = await res.json();
        set((s) => ({ activeParty: applyPartyUpdate(s.activeParty, data.party) }));
        refreshFriendsAfterPartyMutation();
      }
    } catch (err) {
      console.error("Failed to set ready", err);
    }
  },

  launchParty: async (partyId) => {
    try {
      const res = await fetch(`/api/parties/${partyId}/launch`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        set((s) => ({ activeParty: applyPartyUpdate(s.activeParty, data.party) }));
        refreshFriendsAfterPartyMutation();
      }
    } catch (err) {
      console.error("Failed to launch party", err);
    }
  },

  joinGame: async (partyId) => {
    try {
      const res = await fetch(`/api/parties/${partyId}/join-game`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        const party = (data.party as PartyPayload) || null;
        if (party) set((s) => ({ activeParty: applyPartyUpdate(s.activeParty, party) }));
        syncPartyPoll(get);
        refreshFriendsAfterPartyMutation();
        return party;
      }
    } catch (err) {
      console.error("Failed to join party game", err);
    }
    return null;
  },

  endParty: async (partyId) => {
    try {
      await fetch(`/api/parties/${partyId}`, { method: "DELETE" });
      set({ activeParty: null });
      syncPartyPoll(get);
      refreshFriendsAfterPartyMutation();
    } catch (err) {
      console.error("Failed to end party", err);
    }
  },

  inviteFriends: async (partyId, friendIds) => {
    try {
      const res = await fetch(`/api/parties/${partyId}/invite`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ friendIds }),
      });
      const data = await res.json();
      return { results: data.results || [] };
    } catch {
      return { results: [] };
    }
  },

  provisionDiscord: async (partyId) => {
    try {
      const res = await fetch(`/api/parties/${partyId}/discord`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok && data.party?.discord) {
        void get().fetchParties();
        return {
          inviteUrl: data.inviteUrl || data.party.discord.inviteUrl || null,
          needsDiscordLink: Boolean(data.needsDiscordLink),
        };
      }
      return { inviteUrl: null, error: data.error || "Could not enable voice" };
    } catch {
      return { inviteUrl: null, error: "Could not enable voice" };
    }
  },

  setGame: async (partyId, gameSlug) => {
    const previous = get().activeParty;
    partyMutationInFlight += 1;
    if (previous?.id === partyId) {
      set({
        activeParty: {
          ...previous,
          gameSlug,
          gameTitle: previous.gameTitle || gameSlug,
          editionSlug: null,
          modSlugs: [],
        },
      });
    }
    try {
      const res = await fetch(`/api/parties/${partyId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gameSlug }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.party) {
        set((s) => ({ activeParty: applyPartyUpdate(s.activeParty, data.party as PartyPayload) }));
        refreshFriendsAfterPartyMutation();
      } else if (previous?.id === partyId) {
        set({ activeParty: previous, error: data.error || "Failed to set party game" });
      }
    } catch (err) {
      if (previous?.id === partyId) set({ activeParty: previous });
      console.error("Failed to set party game", err);
    } finally {
      partyMutationInFlight = Math.max(0, partyMutationInFlight - 1);
    }
  },

  setHostMode: async (partyId, hostMode) => {
    try {
      const res = await fetch(`/api/parties/${partyId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hostMode }),
      });
      if (res.ok) {
        const data = await res.json();
        set((s) => ({ activeParty: applyPartyUpdate(s.activeParty, data.party) }));
        refreshFriendsAfterPartyMutation();
      }
    } catch (err) {
      console.error("Failed to set party host mode", err);
    }
  },

  setPublicServer: async (partyId, server) => {
    try {
      const res = await fetch(`/api/parties/${partyId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ publicServer: server }),
      });
      if (res.ok) {
        const data = await res.json();
        set((s) => ({ activeParty: applyPartyUpdate(s.activeParty, data.party) }));
        refreshFriendsAfterPartyMutation();
      }
    } catch (err) {
      console.error("Failed to set party public server", err);
    }
  },

  setEdition: async (partyId, editionSlug) => {
    try {
      const res = await fetch(`/api/parties/${partyId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ editionSlug }),
      });
      if (res.ok) {
        const data = await res.json();
        set((s) => ({ activeParty: applyPartyUpdate(s.activeParty, data.party) }));
        refreshFriendsAfterPartyMutation();
      }
    } catch (err) {
      console.error("Failed to set party edition", err);
    }
  },

  setOpenRaMod: async (partyId, mod) => {
    try {
      const res = await fetch(`/api/parties/${partyId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ openRaMod: mod }),
      });
      if (res.ok) {
        const data = await res.json();
        set((s) => ({ activeParty: applyPartyUpdate(s.activeParty, data.party) }));
        refreshFriendsAfterPartyMutation();
      }
    } catch (err) {
      console.error("Failed to set party OpenRA mod", err);
    }
  },

  setName: async (partyId, name) => {
    try {
      const res = await fetch(`/api/parties/${partyId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const data = await res.json();
        set((s) => ({ activeParty: applyPartyUpdate(s.activeParty, data.party) }));
        refreshFriendsAfterPartyMutation();
      }
    } catch (err) {
      console.error("Failed to set party name", err);
    }
  },

  removeMember: async (partyId, userId) => {
    try {
      const res = await fetch(`/api/parties/${partyId}/members/${userId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        const data = await res.json();
        set((s) => ({ activeParty: applyPartyUpdate(s.activeParty, data.party) }));
        refreshFriendsAfterPartyMutation();
      }
    } catch (err) {
      console.error("Failed to remove member", err);
    }
  },

  transferLeadership: async (partyId, userId) => {
    try {
      const res = await fetch(`/api/parties/${partyId}/members/${userId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: "leader" }),
      });
      if (res.ok) {
        const data = await res.json();
        set((s) => ({ activeParty: applyPartyUpdate(s.activeParty, data.party) }));
        refreshFriendsAfterPartyMutation();
      }
    } catch (err) {
      console.error("Failed to transfer leadership", err);
    }
  },

  setVisibility: async (partyId, visibility) => {
    try {
      const res = await fetch(`/api/parties/${partyId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ visibility }),
      });
      if (res.ok) {
        const data = await res.json();
        set((s) => ({ activeParty: applyPartyUpdate(s.activeParty, data.party) }));
        refreshFriendsAfterPartyMutation();
      }
    } catch (err) {
      console.error("Failed to set visibility", err);
    }
  },

  startPolling: (intervalMs = DEFAULT_PARTY_POLL_MS) => {
    pollSubscribers += 1;
    requestedPollMs = intervalMs;
    wirePartyVisibility(get);
    void pollParties(get);
    syncPartyPoll(get);
  },

  stopPolling: () => {
    pollSubscribers = Math.max(0, pollSubscribers - 1);
    if (pollSubscribers === 0 && pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  },
}));

usePresenceStore.subscribe((state, prev) => {
  if (state.status === prev.status) return;
  syncPartyPoll(usePartyStore.getState);
});
