/**
 * Future Play Together party pipeline (Discord voice + launch orchestration).
 *
 * Not implemented in Phase 3 — reserved extension points so Friends UI and
 * Discord bot work don't paint us into a corner.
 *
 * Intended flow:
 *   Play Together → create/join temporary Discord voice room → invite friends → launch game
 */

export type PartyPhase =
  | "idle"
  | "selecting_friends"
  | "creating_discord_room"
  | "awaiting_joins"
  | "launching"
  | "active"
  | "ended";

export type PartyIntent = {
  hostUserId: string;
  memberUserIds: string[];
  gameSlug: string;
  editionSlug?: string | null;
  modSlug?: string | null;
};

/** Placeholder — returns unsupported until Discord party bot ships. */
export function getPartyCapability(): {
  supported: false;
  reason: string;
} {
  return {
    supported: false,
    reason: "Temporary Discord parties are not enabled yet",
  };
}

export async function createPlayTogetherParty(
  // Reserved for Discord party bot wiring.
  intent: PartyIntent
): Promise<{
  ok: false;
  error: string;
}> {
  void intent;
  return { ok: false, error: "Party creation is not available yet" };
}
