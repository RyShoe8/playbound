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
  setEdition: (partyId: string, editionSlug: string | null) => Promise<void>;
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

function syncPartyPoll(get: () => PartyState) {
  const next = needsFastPartyPoll(get().activeParty)
    ? FAST_PARTY_POLL_MS
    : requestedPollMs;
  if (pollSubscribers === 0) {
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
    void get().fetchParties();
  }, pollMs);
}

export const usePartyStore = create<PartyState>((set, get) => ({
  activeParty: null,
  discoverableParties: [],
  loading: false,
  error: null,

  fetchParties: async () => {
    try {
      const res = await fetch("/api/parties");
      if (!res.ok) return;
      const data = await res.json();
      const myParties: PartyPayload[] = data.myParties || [];
      const nextActive = myParties[0] || null;
      set((state) => ({
        activeParty:
          partyMutationInFlight > 0 && state.activeParty?.id === nextActive?.id
            ? state.activeParty
            : nextActive,
        discoverableParties: data.discoverable || [],
        loading: false,
      }));
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
        set({ activeParty: data.party });
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
        set({ activeParty: data.party });
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
        if (party) set({ activeParty: party });
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
        set({ activeParty: data.party as PartyPayload });
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

  setEdition: async (partyId, editionSlug) => {
    try {
      const res = await fetch(`/api/parties/${partyId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ editionSlug }),
      });
      if (res.ok) {
        const data = await res.json();
        set({ activeParty: data.party });
        refreshFriendsAfterPartyMutation();
      }
    } catch (err) {
      console.error("Failed to set party edition", err);
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
        set({ activeParty: data.party });
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
        set({ activeParty: data.party });
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
        set({ activeParty: data.party });
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
        set({ activeParty: data.party });
        refreshFriendsAfterPartyMutation();
      }
    } catch (err) {
      console.error("Failed to set visibility", err);
    }
  },

  startPolling: (intervalMs = DEFAULT_PARTY_POLL_MS) => {
    pollSubscribers += 1;
    requestedPollMs = intervalMs;
    get().fetchParties();
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
