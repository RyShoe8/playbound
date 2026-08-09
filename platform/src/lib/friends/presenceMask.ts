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
    lookingForPlayersUntil?: unknown;
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
      lookingForPlayersUntil: null,
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
    lookingForPlayersUntil: null,
    // Keep online/away/playing → soften playing to online without game details
    status: presence.status === "playing" ? "online" : presence.status,
  };
}
