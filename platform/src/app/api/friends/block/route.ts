import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Friend from "@/lib/models/Friend";
import { getFriendsUserId } from "@/lib/friendsAuth";

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
      return NextResponse.json({ error: "Cannot block yourself" }, { status: 400 });
    }

    await dbConnect();

    // Upsert a block record. The requester is the one blocking.
    const blockedRelationship = await Friend.findOneAndUpdate(
      {
        $or: [
          { requesterId: userId, recipientId: targetUserId },
          { requesterId: targetUserId, recipientId: userId },
        ],
      },
      {
        requesterId: userId, // Ensure the blocker is the requester so they can unblock
        recipientId: targetUserId,
        status: "blocked",
      },
      { upsert: true, new: true }
    );

    return NextResponse.json({ success: true, request: blockedRelationship });
  } catch (error) {
    console.error("Error blocking user:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
