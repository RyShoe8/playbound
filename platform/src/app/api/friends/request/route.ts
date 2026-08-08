import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Friend from "@/lib/models/Friend";
import User from "@/lib/models/User";
import { getFriendsUserId } from "@/lib/friendsAuth";
import {
  createFriendRequestNotification,
  createFriendAcceptedNotification,
} from "@/lib/notifications";
import { saveEvent } from "@/lib/telemetry/server/saveEvent";

export async function POST(req: Request) {
  const userId = await getFriendsUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { targetUserId } = await req.json();
    if (!targetUserId) {
      return NextResponse.json({ error: "Target user ID is required" }, { status: 400 });
    }

    if (userId === targetUserId) {
      return NextResponse.json({ error: "Cannot send a friend request to yourself" }, { status: 400 });
    }

    await dbConnect();

    const targetUser = await User.findById(targetUserId).select("username").lean();
    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const existing = await Friend.findOne({
      $or: [
        { requesterId: userId, recipientId: targetUserId },
        { requesterId: targetUserId, recipientId: userId },
      ],
    });

    const fromUsername =
      (await User.findById(userId).select("username").lean())?.username || "Someone";

    if (existing) {
      if (existing.status === "blocked") {
        return NextResponse.json({ error: "Cannot send request" }, { status: 403 });
      }
      if (existing.status === "accepted") {
        return NextResponse.json({ error: "Already friends" }, { status: 400 });
      }
      if (existing.status === "pending") {
        // Reverse pending: treat as accept.
        if (existing.requesterId.toString() === targetUserId && existing.recipientId.toString() === userId) {
          existing.status = "accepted";
          existing.acceptedAt = new Date();
          await existing.save();
          void createFriendAcceptedNotification({
            recipientId: String(existing.requesterId),
            fromUserId: userId,
            fromUsername: String(fromUsername),
            friendshipId: String(existing._id),
          });
          void saveEvent({
            event: "friend_request_accepted",
            properties: { friendshipId: String(existing._id), via: "reverse_request" },
            userId,
          });
          return NextResponse.json({ success: true, request: existing, autoAccepted: true });
        }
        return NextResponse.json({ error: "Friend request already pending" }, { status: 400 });
      }
      // Reuse declined/cancelled rows.
      if (existing.status === "declined" || existing.status === "cancelled") {
        existing.set({
          requesterId: userId,
          recipientId: targetUserId,
          status: "pending",
          acceptedAt: null,
        });
        await existing.save();
        void createFriendRequestNotification({
          recipientId: String(targetUserId),
          fromUserId: userId,
          fromUsername: String(fromUsername),
          friendshipId: String(existing._id),
        });
        void saveEvent({
          event: "friend_request_sent",
          properties: { targetUserId: String(targetUserId) },
          userId,
        });
        return NextResponse.json({ success: true, request: existing });
      }
      return NextResponse.json(
        { error: `Relationship already exists (status: ${existing.status})` },
        { status: 400 }
      );
    }

    const friendRequest = await Friend.create({
      requesterId: userId,
      recipientId: targetUserId,
      status: "pending",
    });

    void createFriendRequestNotification({
      recipientId: String(targetUserId),
      fromUserId: userId,
      fromUsername: String(fromUsername),
      friendshipId: String(friendRequest._id),
    });
    void saveEvent({
      event: "friend_request_sent",
      properties: { targetUserId: String(targetUserId) },
      userId,
    });

    return NextResponse.json({ success: true, request: friendRequest });
  } catch (error) {
    console.error("Error sending friend request:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
