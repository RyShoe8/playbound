/** Kept for older callers. */


/* ─── legacy stubs (backward compat for Phase 3 tests) ───────────────────── */

/** @deprecated Phase 3 stub — use createParty instead. */
export function getPartyCapability(): {
  supported: boolean;
  reason: string;
} {
  return {
    supported: true,
    reason: "Party system is available",
  };
}

/** @deprecated Phase 3 stub type — use PartyPayload instead. */
export type PartyPhase =
  | "idle"
  | "selecting_friends"
  | "creating_discord_room"
  | "awaiting_joins"
  | "launching"
  | "active"
  | "ended";

/** @deprecated Phase 3 stub type — use createParty opts instead. */
export type PartyIntent = {
  hostUserId: string;
  memberUserIds: string[];
  gameSlug: string;
  editionSlug?: string | null;
  modSlug?: string | null;
};
