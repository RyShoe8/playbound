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
  },
>(presence: T, appearOffline: boolean): T {
  if (!appearOffline) return presence;
  return {
    ...presence,
    status: "offline",
    platform: undefined,
    currentGameId: null,
    currentGameTitle: null,
    currentEditionId: null,
    currentPage: null,
  };
}
