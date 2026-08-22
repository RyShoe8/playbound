import { NextResponse } from "next/server";
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
    const [presences, discordConnections, games, sharedByFriend, liveMemberParties] =
      await Promise.all([
      Presence.find({ userId: { $in: friendIds } }).lean(),
      DiscordConnection.find({ userId: { $in: friendIds } }).select("userId").lean(),
      listGames({ includeTesting: true }),
      listSharedLibraryByFriend(userId, friendIdStrings),
      Party.find({
        status: { $nin: ["ended"] },
        "members.userId": { $in: friendIds },
      })
        .select("_id members.userId")
        .lean(),
    ]);

    /*
     * Party membership is the source of truth for "in a party".
     *
     * `currentPartyId` on Presence is a denormalised copy written on join and
     * cleared on leave, but it can drift — leave/rejoin races, a missed write,
     * or applyPresenceFreshness stripping it when the heartbeat is stale all
     * leave friends lists showing someone as out of a party while the roster
     * already has them back.
     *
     * Reading live party documents self-corrects on every friends fetch.
     */
    const partyIdByMember = new Map<string, string>();
    for (const doc of liveMemberParties) {
      const partyId = String(doc._id);
      for (const member of doc.members || []) {
        partyIdByMember.set(String(member.userId), partyId);
      }
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
        currentPartyId: partyIdByMember.get(p.userId.toString()) || null,
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
      const userIdStr = user.id.toString();
      const raw = applyPresenceFreshness(
        presenceMap.get(userIdStr) || {
          status: "offline",
          lookingForPlayers: false,
        },
        now
      );
      const membershipPartyId = partyIdByMember.get(userIdStr);
      if (membershipPartyId) raw.currentPartyId = membershipPartyId;
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
