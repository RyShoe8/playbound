import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Friend from "@/lib/models/Friend";
import Presence from "@/lib/models/Presence";
import DiscordConnection from "@/lib/models/DiscordConnection";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { listGames } from "@/lib/catalog";
import { maskPresenceForOthers } from "@/lib/friends/presenceMask";

export async function GET(req: Request) {
  const userId = await getFriendsUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await dbConnect();

    const friendships = await Friend.find({
      $or: [{ requesterId: userId }, { recipientId: userId }],
      status: "accepted",
    })
      .populate({ path: "requesterId", select: "username image preferences" })
      .populate({ path: "recipientId", select: "username image preferences" })
      .lean();

    const friendUsers = friendships.map((doc: any) => {
      const isRequester = doc.requesterId._id.toString() === userId;
      const friendUser = isRequester ? doc.recipientId : doc.requesterId;
      return {
        id: friendUser._id,
        username: friendUser.username,
        image: friendUser.image,
        friendshipId: doc._id,
        acceptedAt: doc.acceptedAt,
        appearOffline: Boolean(friendUser.preferences?.appearOffline),
      };
    });

    const friendIds = friendUsers.map((u) => u.id);
    const [presences, discordConnections, games] = await Promise.all([
      Presence.find({ userId: { $in: friendIds } }).lean(),
      DiscordConnection.find({ userId: { $in: friendIds } }).select("userId").lean(),
      listGames({ includeTesting: true }),
    ]);

    const titleBySlug = new Map(games.map((g) => [g.slug, g.title]));
    const discordLinkedSet = new Set(discordConnections.map((dc) => dc.userId.toString()));

    const presenceMap = new Map();
    for (const p of presences) {
      const slug = p.currentGameId || null;
      presenceMap.set(p.userId.toString(), {
        status: p.status,
        platform: p.platform,
        currentGameId: slug,
        currentGameTitle: slug ? titleBySlug.get(slug) || slug : null,
        currentEditionId: p.currentEditionId,
        currentPage: p.currentPage,
        lastHeartbeat: p.lastHeartbeat,
        lastSeen: p.lastHeartbeat,
      });
    }

    const friends = friendUsers.map((user) => {
      const raw = presenceMap.get(user.id.toString()) || { status: "offline" };
      const presence = maskPresenceForOthers(raw, user.appearOffline);
      const { appearOffline: _hidden, ...publicUser } = user;
      return {
        ...publicUser,
        discordLinked: discordLinkedSet.has(user.id.toString()),
        presence,
      };
    });

    return NextResponse.json({ friends });
  } catch (error) {
    console.error("Error fetching friends:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
