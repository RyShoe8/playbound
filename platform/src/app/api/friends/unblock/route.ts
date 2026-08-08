import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Friend from "@/lib/models/Friend";
import { getFriendsUserId } from "@/lib/friendsAuth";

/** Remove a block the current user created (requesterId = blocker). */
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

    const result = await Friend.deleteOne({
      requesterId: userId,
      recipientId: targetUserId,
      status: "blocked",
    });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Block not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error unblocking user:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
