import { matchAvailablePlayers } from "./availabilityMatching";
export type LtpMatchResult = {
  activeLookingUsers: number;
  partiesJoined: number;
  partiesCreated: number;
  notificationsSent: number;
};

export function findGameOverlap(gamesA: string[], gamesB: string[]): string | null {
  return gamesA.find((g) => gamesB.includes(g)) || null;
}

export function isUserPairBlocked(
  blocks: Array<{ requesterId: string; recipientId: string }>,
  u1: string,
  u2: string
): boolean {
  return blocks.some(
    (b) =>
      (b.requesterId === u1 && b.recipientId === u2) ||
      (b.requesterId === u2 && b.recipientId === u1)
  );
}

export function selectBestPartyForLookingUser(
  parties: Array<{ id: string; memberCount: number; maxSize: number }>,
  partyMembers: Map<string, string[]>,
  candidateUserId: string,
  blocks: Array<{ requesterId: string; recipientId: string }>
): string | null {
  for (const party of parties) {
    if (party.memberCount >= party.maxSize) continue;
    const members = partyMembers.get(party.id) || [];
    const hasBlock = members.some((m) => isUserPairBlocked(blocks, candidateUserId, m));
    if (!hasBlock) {
      return party.id;
    }
  }
  return null;
}

export const sweepAndMatchLookingUsers = matchAvailablePlayers;
