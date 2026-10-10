import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Friend from "@/lib/models/Friend";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { markFriendRequestNotificationsRead } from "@/lib/notifications";
import { trackServerEvent } from "@/lib/telemetry/server/trackServerEvent";

/** Recipient declines an incoming pending request → status declined. */
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
      return NextResponse.json({ error: "Friend request not found" }, { status: 404 });
    }

    const friendshipId = String(friendRequest._id);
    friendRequest.status = "declined";
    await friendRequest.save();

    void markFriendRequestNotificationsRead({
      userId,
      friendshipId,
    });
    void trackServerEvent({
      event: "friend_request_declined",
      properties: { friendshipId },
      userId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error declining friend request:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
