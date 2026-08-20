import { NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/db";
import Friend from "@/lib/models/Friend";
import Presence from "@/lib/models/Presence";
import Party from "@/lib/models/Party";
import DiscordConnection from "@/lib/models/DiscordConnection";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { listGames } from "@/lib/catalog";
import { applyPresenceFreshness, maskPresenceForOthers } from "@/lib/friends/presenceMask";
import { resolveJoinCapability } from "@/lib/playTogether/joinCapability";
import { listSharedLibraryByFriend } from "@/lib/playTogether/sharedGames";

type PopulatedFriendUser = {
  _id: { toString(): string };
  username?: string;
  image?: string | null;
  preferences?: {
    appearOffline?: boolean;
    hideActivityFromFriends?: boolean;
  };
};

type FriendshipLean = {
  _id: unknown;
  acceptedAt?: Date | null;
  requesterId: PopulatedFriendUser;
  recipientId: PopulatedFriendUser;
};

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
      .populate({ path: "requesterId", select: "username image preferences" })
      .populate({ path: "recipientId", select: "username image preferences" })
      .lean()) as unknown as FriendshipLean[];

    const friendUsers = friendships.map((doc) => {
      const isRequester = doc.requesterId._id.toString() === userId;
      const friendUser = isRequester ? doc.recipientId : doc.requesterId;
      return {
        id: friendUser._id,
        username: friendUser.username,
        image: friendUser.image,
        friendshipId: doc._id,
        acceptedAt: doc.acceptedAt,
        appearOffline: Boolean(friendUser.preferences?.appearOffline),
        hideActivity: Boolean(friendUser.preferences?.hideActivityFromFriends),
      };
    });

    const friendIds = friendUsers.map((u) => u.id);
    const friendIdStrings = friendIds.map((id) => String(id));
    const [presences, discordConnections, games, sharedByFriend] = await Promise.all([
      Presence.find({ userId: { $in: friendIds } }).lean(),
      DiscordConnection.find({ userId: { $in: friendIds } }).select("userId").lean(),
      listGames({ includeTesting: true }),
      listSharedLibraryByFriend(userId, friendIdStrings),
    ]);

    /*
     * Confirm the parties presence claims people are in still exist.
     *
     * `currentPartyId` is a denormalised copy written when someone joins and
     * cleared when the party ends. Nothing validated it, so any cleanup that
     * did not run — a party ended while the database was unreachable, a sweep
     * that failed — left the flag set permanently, and the friend showed as
     * "in a party" forever with no party to open.
     *
     * Deriving it from the parties that are actually live means a missed
     * cleanup self-corrects on the next read instead of needing one.
     */
    const claimedPartyIds = [
      ...new Set(
        presences
          .map((p) => (p.currentPartyId ? String(p.currentPartyId) : ""))
          .filter((id) => id !== "" && Types.ObjectId.isValid(id))
      ),
    ];
    const livePartyIds = new Set<string>();
    if (claimedPartyIds.length > 0) {
      const live = await Party.find({
        _id: { $in: claimedPartyIds.map((id) => new Types.ObjectId(id)) },
        status: { $nin: ["ended"] },
      })
        .select("_id")
        .lean();
      for (const p of live) livePartyIds.add(String(p._id));
    }

    const titleBySlug = new Map(games.map((g) => [g.slug, g.title]));
    const gameBySlug = new Map(games.map((g) => [g.slug, g]));
    const discordLinkedSet = new Set(discordConnections.map((dc) => dc.userId.toString()));
    const now = Date.now();

    const presenceMap = new Map();
    for (const p of presences) {
      const slug = p.currentGameId || null;
      const lfgUntil = p.lookingForPlayersUntil
        ? new Date(p.lookingForPlayersUntil).getTime()
        : 0;
      const lookingForPlayers = Boolean(lfgUntil && lfgUntil > now);
      presenceMap.set(p.userId.toString(), {
        status: p.status,
        platform: p.platform,
        currentGameId: slug,
        currentGameTitle: slug ? titleBySlug.get(slug) || slug : null,
        currentEditionId: p.currentEditionId,
        currentPage: p.currentPage,
        // Only when the party is still live — see the lookup above.
        currentPartyId:
          p.currentPartyId && livePartyIds.has(String(p.currentPartyId))
            ? String(p.currentPartyId)
            : null,
        lastHeartbeat: p.lastHeartbeat,
        lastSeen: p.lastHeartbeat,
        lookingForPlayers,
        lookingForPlayersGameId: lookingForPlayers ? p.lookingForPlayersGameId || slug : null,
        // Resolved here for the same reason currentGameTitle is: the stored
        // value is a slug, and the Looking for Players list was rendering it
        // straight out as "Looking for players · villagers-and-heroes".
        lookingForPlayersGameTitle: lookingForPlayers
          ? (() => {
              const lfgSlug = p.lookingForPlayersGameId || slug;
              return lfgSlug ? titleBySlug.get(lfgSlug) || lfgSlug : null;
            })()
          : null,
        lookingForPlayersUntil: lookingForPlayers ? p.lookingForPlayersUntil : null,
      });
    }

    const friends = friendUsers.map((user) => {
      const raw = applyPresenceFreshness(
        presenceMap.get(user.id.toString()) || {
          status: "offline",
          lookingForPlayers: false,
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
      return {
        id: user.id,
        username: user.username,
        image: user.image,
        friendshipId: user.friendshipId,
        acceptedAt: user.acceptedAt,
        discordLinked: discordLinkedSet.has(user.id.toString()),
        presence,
        join,
        sharedGames: sharedByFriend[user.id.toString()] || [],
      };
    });

    return NextResponse.json({ friends });
  } catch (error) {
    console.error("Error fetching friends:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
