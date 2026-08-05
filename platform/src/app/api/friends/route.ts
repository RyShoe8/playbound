import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import Friend from "@/lib/models/Friend";
import Presence from "@/lib/models/Presence";

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
        discordLinked: !!friendUser.connectedAccounts?.discord?.discordUserId,
        friendshipId: doc._id,
        acceptedAt: doc.acceptedAt,
      };
    });

    // Get presence for all friends
    const friendIds = friendUsers.map((u) => u.id);
    const presences = await Presence.find({ userId: { $in: friendIds } }).lean();
    
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
      presence: presenceMap.get(user.id.toString()) || { status: "offline" },
    }));

    return NextResponse.json({ friends });
  } catch (error) {
    console.error("Error fetching friends:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
