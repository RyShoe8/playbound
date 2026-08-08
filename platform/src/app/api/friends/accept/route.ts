import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Friend from "@/lib/models/Friend";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { markFriendRequestNotificationsRead } from "@/lib/notifications";

export async function POST(req: Request) {
  const userId = await getFriendsUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { requestId } = await req.json();
    if (!requestId) {
      return NextResponse.json({ error: "Request ID is required" }, { status: 400 });
    }

    await dbConnect();

    const friendRequest = await Friend.findOne({
      _id: requestId,
      recipientId: userId,
      status: "pending",
    });
    if (!friendRequest) {
      return NextResponse.json(
        { error: "Friend request not found or you are not the recipient" },
        { status: 404 }
      );
    }

    friendRequest.status = "accepted";
    friendRequest.acceptedAt = new Date();
    await friendRequest.save();

    void markFriendRequestNotificationsRead({
      userId,
      friendshipId: String(friendRequest._id),
    });

    return NextResponse.json({ success: true, request: friendRequest });
  } catch (error) {
    console.error("Error accepting friend request:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
