import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import Friend from "@/lib/models/Friend";
import Presence from "@/lib/models/Presence";
import DiscordConnection from "@/lib/models/DiscordConnection";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await dbConnect();
    const userId = session.user.id;

    // Get all accepted friendships
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

    // Get presence for all friends
    const friendIds = friendUsers.map((u) => u.id);
    const [presences, discordConnections] = await Promise.all([
      Presence.find({ userId: { $in: friendIds } }).lean(),
      DiscordConnection.find({ userId: { $in: friendIds } }).select("userId").lean()
    ]);
    
    const discordLinkedSet = new Set(discordConnections.map(dc => dc.userId.toString()));
    
    const presenceMap = new Map();
    for (const p of presences) {
      presenceMap.set(p.userId.toString(), {
        status: p.status,
        platform: p.platform,
        currentGameId: p.currentGameId,
        currentEditionId: p.currentEditionId,
        currentPage: p.currentPage,
        lastHeartbeat: p.lastHeartbeat,
        lastSeen: p.lastHeartbeat, // alias for frontend convenience if needed
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
