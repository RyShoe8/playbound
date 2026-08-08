import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Friend from "@/lib/models/Friend";
import Presence from "@/lib/models/Presence";
import DiscordConnection from "@/lib/models/DiscordConnection";
import { getFriendsUserId } from "@/lib/friendsAuth";

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
      .populate({ path: "requesterId", select: "username email image connectedAccounts" })
      .populate({ path: "recipientId", select: "username email image connectedAccounts" })
      .lean();

    const friendUsers = friendships.map((doc: any) => {
      const isRequester = doc.requesterId._id.toString() === userId;
      const friendUser = isRequester ? doc.recipientId : doc.requesterId;
      return {
        id: friendUser._id,
        username: friendUser.username,
        email: friendUser.email,
        image: friendUser.image,
        friendshipId: doc._id,
        acceptedAt: doc.acceptedAt,
      };
    });

    const friendIds = friendUsers.map((u) => u.id);
    const [presences, discordConnections] = await Promise.all([
      Presence.find({ userId: { $in: friendIds } }).lean(),
      DiscordConnection.find({ userId: { $in: friendIds } }).select("userId").lean(),
    ]);

    const discordLinkedSet = new Set(discordConnections.map((dc) => dc.userId.toString()));

    const presenceMap = new Map();
    for (const p of presences) {
      presenceMap.set(p.userId.toString(), {
        status: p.status,
        platform: p.platform,
        currentGameId: p.currentGameId,
        currentEditionId: p.currentEditionId,
        currentPage: p.currentPage,
        lastHeartbeat: p.lastHeartbeat,
        lastSeen: p.lastHeartbeat,
      });
    }

    const friends = friendUsers.map((user) => ({
      ...user,
      discordLinked: discordLinkedSet.has(user.id.toString()),
      presence: presenceMap.get(user.id.toString()) || { status: "offline" },
    }));

    return NextResponse.json({ friends });
  } catch (error) {
    console.error("Error fetching friends:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
