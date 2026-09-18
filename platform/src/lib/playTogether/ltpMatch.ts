import dbConnect from "@/lib/db";
import Presence from "@/lib/models/Presence";
import Friend from "@/lib/models/Friend";
import Party from "@/lib/models/Party";
import User from "@/lib/models/User";
import { getGame } from "@/lib/catalog";
import { createParty } from "@/lib/playTogether/party";
import {
  createLtpMatchNotification,
  createLtpPartyReadyNotification,
} from "@/lib/playTogether/notify";

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

export async function sweepAndMatchLookingUsers(): Promise<LtpMatchResult> {
  const result: LtpMatchResult = {
    activeLookingUsers: 0,
    partiesJoined: 0,
    partiesCreated: 0,
    notificationsSent: 0,
  };

  try {
    await dbConnect();

    // 1. Fetch unexpired looking presences
    const now = new Date();
    const presences = await Presence.find({
      lookingForPlayersUntil: { $gt: now },
    })
      .select("userId lookingForPlayersUntil lookingForPlayersGameId lookingForPlayersGameIds currentPartyId")
      .lean();

    if (presences.length === 0) return result;

    const userIds = presences.map((p) => String(p.userId));
    const users = await User.find({ _id: { $in: userIds }, disabled: { $ne: true } })
      .select("username preferences")
      .lean();

    // Filter out users who appear offline or hide activity
    const visibleUsers = users.filter((u) => {
      const prefs = (u as { preferences?: { appearOffline?: boolean; hideActivityFromFriends?: boolean } })
        .preferences;
      return !prefs?.appearOffline && !prefs?.hideActivityFromFriends;
    });

    const userMap = new Map(visibleUsers.map((u) => [String(u._id), u]));
    const visiblePresences = presences.filter((p) => userMap.has(String(p.userId)));

    result.activeLookingUsers = visiblePresences.length;
    if (visiblePresences.length === 0) return result;

    // 2. Fetch blocks to guarantee blocked users are never matched
    const blockedRows = await Friend.find({
      status: "blocked",
      $or: [
        { requesterId: { $in: userIds }, recipientId: { $in: userIds } },
      ],
    })
      .select("requesterId recipientId")
      .lean();

    const isBlocked = (u1: string, u2: string): boolean => {
      return blockedRows.some(
        (b) =>
          (String(b.requesterId) === u1 && String(b.recipientId) === u2) ||
          (String(b.requesterId) === u2 && String(b.recipientId) === u1)
      );
    };

    // 3. Fetch all open joinable parties
    const openParties = await Party.find({
      visibility: "public",
      status: { $in: ["waiting", "preparing", "ready"] },
      gameSlug: { $nin: [null, ""] },
    }).lean();

    const partyMapByGame = new Map<string, typeof openParties>();
    for (const p of openParties) {
      const g = String(p.gameSlug);
      if (!partyMapByGame.has(g)) partyMapByGame.set(g, []);
      partyMapByGame.get(g)!.push(p);
    }

    const getWantedGames = (p: typeof presences[0]): string[] => {
      if (Array.isArray(p.lookingForPlayersGameIds) && p.lookingForPlayersGameIds.length > 0) {
        return p.lookingForPlayersGameIds as string[];
      }
      if (p.lookingForPlayersGameId) {
        return [String(p.lookingForPlayersGameId)];
      }
      return [];
    };

    const matchedUserIds = new Set<string>();

    // 4. PRIORITY 1: JOIN EXISTING > CREATE NEW
    // If an open party exists with space, notify looking player about this party
    for (const p of visiblePresences) {
      const uId = String(p.userId);
      if (p.currentPartyId) continue;

      const wanted = getWantedGames(p);
      if (wanted.length === 0) continue;

      for (const gameSlug of wanted) {
        const available = partyMapByGame.get(gameSlug) || [];
        const targetParty = available.find((party) => {
          const members = (party.members as Array<{ userId: unknown }>) || [];
          const maxSize = (party.maxSize as number) || 4;
          if (members.length >= maxSize) return false;
          if (members.some((m) => isBlocked(uId, String(m.userId)))) return false;
          return true;
        });

        if (targetParty) {
          const game = await getGame(gameSlug);
          const leaderUser = await User.findById(targetParty.leaderId).select("username").lean();
          await createLtpPartyReadyNotification({
            userId: uId,
            partyId: String(targetParty._id),
            gameSlug,
            gameTitle: game?.title || gameSlug,
            partyLeaderUsername: String(leaderUser?.username || "A host"),
          });
          matchedUserIds.add(uId);
          result.partiesJoined++;
          result.notificationsSent++;
          break;
        }
      }
    }

    // 5. PRIORITY 2: Match unassigned looking users with overlapping game preferences
    const unmatched = visiblePresences.filter(
      (p) => !matchedUserIds.has(String(p.userId)) && !p.currentPartyId
    );

    for (let i = 0; i < unmatched.length; i++) {
      const p1 = unmatched[i];
      const u1Id = String(p1.userId);
      if (matchedUserIds.has(u1Id)) continue;

      const games1 = getWantedGames(p1);
      if (games1.length === 0) continue;

      for (let j = i + 1; j < unmatched.length; j++) {
        const p2 = unmatched[j];
        const u2Id = String(p2.userId);
        if (matchedUserIds.has(u2Id)) continue;
        if (isBlocked(u1Id, u2Id)) continue;

        const games2 = getWantedGames(p2);
        const overlap = games1.find((g) => games2.includes(g));

        if (overlap) {
          const game = await getGame(overlap);
          const user1 = userMap.get(u1Id);
          const user2 = userMap.get(u2Id);
          if (!user1 || !user2) continue;

          // Auto-create open public party to concentrate players
          let createdPartyId: string | null = null;
          try {
            const partyResult = await createParty({
              userId: u1Id,
              gameSlug: overlap,
              visibility: "public",
              name: `${game?.title || overlap} Match`,
            });
            if (partyResult && "party" in partyResult && partyResult.party?.id) {
              createdPartyId = partyResult.party.id;
              result.partiesCreated++;
            }
          } catch (createErr) {
            console.error("Failed to auto-create party for match:", createErr);
          }

          // Notify both users about the match
          await Promise.all([
            createLtpMatchNotification({
              userId: u1Id,
              matchedUserId: u2Id,
              matchedUsername: String(user2.username || "Player"),
              partyId: createdPartyId,
              gameSlug: overlap,
              gameTitle: game?.title || overlap,
            }),
            createLtpMatchNotification({
              userId: u2Id,
              matchedUserId: u1Id,
              matchedUsername: String(user1.username || "Player"),
              partyId: createdPartyId,
              gameSlug: overlap,
              gameTitle: game?.title || overlap,
            }),
          ]);

          matchedUserIds.add(u1Id);
          matchedUserIds.add(u2Id);
          result.notificationsSent += 2;
          break;
        }
      }
    }

    return result;
  } catch (err) {
    console.error("sweepAndMatchLookingUsers failed:", err);
    return result;
  }
}
