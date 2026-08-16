import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { listSharedPlayGames } from "@/lib/playTogether/sharedGames";
import { listPartiesForUser, listDiscoverableParties } from "@/lib/playTogether/party";
import dbConnect from "@/lib/db";
import Friend from "@/lib/models/Friend";
import Presence from "@/lib/models/Presence";
import { listGames } from "@/lib/catalog";
import { applyPresenceFreshness, maskPresenceForOthers } from "@/lib/friends/presenceMask";
import { resolveJoinCapability } from "@/lib/playTogether/joinCapability";

type PopulatedFriendUser = {
  _id: unknown;
  username?: string;
  preferences?: {
    appearOffline?: boolean;
    hideActivityFromFriends?: boolean;
  };
};

type FriendshipLean = {
  requesterId: PopulatedFriendUser;
  recipientId: PopulatedFriendUser;
};

/** Compact Play Together payload for homepage / friends surfaces. */
export async function GET(req: Request) {
  const userId = await getFriendsUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await dbConnect();
    const friendships = (await Friend.find({
      $or: [{ requesterId: userId }, { recipientId: userId }],
      status: "accepted",
    })
      .populate({ path: "requesterId", select: "username preferences" })
      .populate({ path: "recipientId", select: "username preferences" })
      .lean()) as unknown as FriendshipLean[];

    const friendUsers = friendships
      .map((doc) => {
        const isRequester = String(doc.requesterId._id) === userId;
        const friendUser = isRequester ? doc.recipientId : doc.requesterId;
        return {
          id: String(friendUser._id),
          username: String(friendUser.username || "Player"),
          appearOffline: Boolean(friendUser.preferences?.appearOffline),
          hideActivity: Boolean(friendUser.preferences?.hideActivityFromFriends),
        };
      })
      // Never the viewer — see the matching note in sharedGames.acceptedFriendIds.
      .filter((f) => f.id !== userId);

    const ids = friendUsers.map((f) => f.id);
    const [presences, games, sharedGames, mePresence, activeParties, discoverableParties] = await Promise.all([
      Presence.find({ userId: { $in: ids } }).lean(),
      listGames({ includeTesting: true }),
      listSharedPlayGames(userId, 8),
      Presence.findOne({ userId }).lean(),
      listPartiesForUser(userId),
      listDiscoverableParties(userId),
    ]);

    const gameBySlug = new Map(games.map((g) => [g.slug, g]));
    const titleBySlug = new Map(games.map((g) => [g.slug, g.title]));
    const now = Date.now();
    const presenceByUser = new Map(presences.map((p) => [String(p.userId), p]));

    const friendsPlaying = [];
    const friendsLooking = [];

    for (const user of friendUsers) {
      const p = presenceByUser.get(user.id);
      if (!p) continue;
      const lfgUntil = p.lookingForPlayersUntil
        ? new Date(p.lookingForPlayersUntil).getTime()
        : 0;
      const lookingForPlayers = Boolean(lfgUntil && lfgUntil > now);
      const raw = applyPresenceFreshness(
        {
          status: String(p.status || "offline"),
          lastHeartbeat: p.lastHeartbeat,
          currentGameId: p.currentGameId || null,
          currentGameTitle: p.currentGameId
            ? titleBySlug.get(String(p.currentGameId)) || p.currentGameId
            : null,
          currentEditionId: p.currentEditionId || null,
          lookingForPlayers,
          lookingForPlayersGameId: lookingForPlayers
            ? p.lookingForPlayersGameId || p.currentGameId || null
            : null,
        },
        now
      );
      const presence = maskPresenceForOthers(raw, user.appearOffline, user.hideActivity);
      const game = presence.currentGameId
        ? gameBySlug.get(String(presence.currentGameId))
        : null;
      const join = resolveJoinCapability({
        game: game || null,
        friendStatus: presence.status,
        friendGameId: presence.currentGameId,
        editionId: presence.currentEditionId,
      });

      if (presence.status === "playing" && presence.currentGameId) {
        friendsPlaying.push({
          id: user.id,
          username: user.username,
          gameSlug: presence.currentGameId,
          gameTitle: presence.currentGameTitle,
          join,
        });
      }
      if (presence.lookingForPlayers && presence.lookingForPlayersGameId) {
        friendsLooking.push({
          id: user.id,
          username: user.username,
          gameSlug: presence.lookingForPlayersGameId,
          gameTitle:
            titleBySlug.get(String(presence.lookingForPlayersGameId)) ||
            presence.lookingForPlayersGameId,
        });
      }
    }

    const meLfgUntil = mePresence?.lookingForPlayersUntil
      ? new Date(mePresence.lookingForPlayersUntil).getTime()
      : 0;
    const myLfg =
      meLfgUntil > now
        ? {
            active: true,
            gameSlug: mePresence?.lookingForPlayersGameId || mePresence?.currentGameId || null,
            expiresAt: mePresence?.lookingForPlayersUntil,
          }
        : { active: false, gameSlug: null, expiresAt: null };

    return NextResponse.json({
      friendsPlaying,
      friendsLooking,
      sharedGames,
      myLfg,
      activeParties,
      discoverableParties,
    });
  } catch (err) {
    console.error("play-together GET failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
