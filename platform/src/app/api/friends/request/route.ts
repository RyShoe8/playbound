import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Friend from "@/lib/models/Friend";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { sendFriendRequestBetween } from "@/lib/friends/sendRequest";

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

    await dbConnect();
    const result = await sendFriendRequestBetween(userId, String(targetUserId));
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const request = await Friend.findById(result.friendshipId).lean();
    return NextResponse.json({
      success: true,
      request,
      autoAccepted: Boolean(result.autoAccepted),
    });
  } catch (error) {
    console.error("Error sending friend request:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
