import { STALE_AFTER_MS } from "@/lib/presence/types";

/** Treat a missed heartbeat the same way the sweep does, so friends lists don't wait on cron. */
export function applyPresenceFreshness<
  T extends {
    status?: string;
    lastHeartbeat?: unknown;
    currentGameId?: string | null;
    currentGameTitle?: string | null;
    currentEditionId?: string | null;
    lookingForPlayers?: boolean;
    lookingForPlayersGameId?: string | null;
    lookingForPlayersGameTitle?: string | null;
    lookingForPlayersUntil?: unknown;
    currentPartyId?: string | null;
  },
>(presence: T, now = Date.now()): T {
  const hb = presence.lastHeartbeat ? new Date(presence.lastHeartbeat as string | Date).getTime() : 0;
  if (hb && now - hb < STALE_AFTER_MS) return presence;
  // A browser can close after someone raises their hand; LFG has its own
  // explicit expiry and must remain visible even when online presence is stale.
  const lookingUntil = presence.lookingForPlayersUntil
    ? new Date(presence.lookingForPlayersUntil as string | Date).getTime()
    : 0;
  const stillLooking = Boolean(presence.lookingForPlayers && lookingUntil > now);
  return {
    ...presence,
    status: "offline",
    currentGameId: null,
    currentGameTitle: null,
    currentEditionId: null,
    lookingForPlayers: stillLooking,
    lookingForPlayersGameId: stillLooking ? presence.lookingForPlayersGameId : null,
    lookingForPlayersGameTitle: stillLooking ? presence.lookingForPlayersGameTitle : null,
    lookingForPlayersUntil: stillLooking ? presence.lookingForPlayersUntil : null,
    currentPartyId: null,
  };
}

/** Mask presence for other viewers when the user opted to appear offline. */
export function maskPresenceForOthers<
  T extends {
    status: string;
    currentGameId?: string | null;
    currentGameTitle?: string | null;
    currentEditionId?: string | null;
    currentPage?: string | null;
    platform?: string;
    lastHeartbeat?: unknown;
    lastSeen?: unknown;
    lookingForPlayers?: boolean;
    lookingForPlayersGameId?: string | null;
    lookingForPlayersGameTitle?: string | null;
    lookingForPlayersUntil?: unknown;
    currentPartyId?: string | null;
  },
>(presence: T, appearOffline: boolean, hideActivity = false): T {
  if (appearOffline) {
    return {
      ...presence,
      status: "offline",
      platform: undefined,
      currentGameId: null,
      currentGameTitle: null,
      currentEditionId: null,
      currentPage: null,
      lookingForPlayers: false,
      lookingForPlayersGameId: null,
      lookingForPlayersGameTitle: null,
      lookingForPlayersUntil: null,
      currentPartyId: null,
    };
  }
  if (!hideActivity) return presence;
  return {
    ...presence,
    currentGameId: null,
    currentGameTitle: null,
    currentEditionId: null,
    currentPage: null,
    lookingForPlayers: false,
    lookingForPlayersGameId: null,
    lookingForPlayersGameTitle: null,
    lookingForPlayersUntil: null,
    // Keep online/away/playing → soften playing to online without game details
    status: presence.status === "playing" ? "online" : presence.status,
  };
}
