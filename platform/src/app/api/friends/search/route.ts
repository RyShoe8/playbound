import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import User from "@/lib/models/User";
import Friend from "@/lib/models/Friend";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q");

  if (!query || query.length < 3) {
    return NextResponse.json({ users: [] });
  }

  try {
    await dbConnect();
    const userId = session.user.id;

    // Search by username or exact email
    const users = await User.find({
      $and: [
        { _id: { $ne: userId } },
        {
          $or: [
            { username: { $regex: query, $options: "i" } },
            { email: query.toLowerCase() },
          ],
        },
      ],
    })
      .select("username email image connectedAccounts")
      .limit(20)
      .lean();

    if (users.length === 0) {
      return NextResponse.json({ users: [] });
    }

    const userIds = users.map((u) => u._id);

    // Get relationships between current user and found users
    const friendships = await Friend.find({
      $or: [
        { requesterId: userId, recipientId: { $in: userIds } },
        { requesterId: { $in: userIds }, recipientId: userId },
      ],
    }).lean();

    const friendshipMap = new Map();
    for (const f of friendships) {
      const otherId = f.requesterId.toString() === userId ? f.recipientId.toString() : f.requesterId.toString();
      friendshipMap.set(otherId, {
        status: f.status,
        isRequester: f.requesterId.toString() === userId,
      });
    }

    const results = users.map((u) => {
      const relationship = friendshipMap.get(u._id.toString());
      let friendStatus = "none";
      if (relationship) {
        if (relationship.status === "accepted") friendStatus = "friends";
        else if (relationship.status === "pending" && relationship.isRequester) friendStatus = "outgoing_request";
        else if (relationship.status === "pending" && !relationship.isRequester) friendStatus = "incoming_request";
        else if (relationship.status === "blocked") friendStatus = "blocked";
      }

      return {
        id: u._id,
        username: u.username,
        image: u.image,
        discordLinked: !!u.connectedAccounts?.discord?.discordUserId,
        friendStatus,
      };
    });

    return NextResponse.json({ users: results.filter(u => u.friendStatus !== "blocked") });
  } catch (error) {
    console.error("Error searching friends:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
