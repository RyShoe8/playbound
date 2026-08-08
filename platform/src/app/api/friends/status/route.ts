import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Friend from "@/lib/models/Friend";
import { getFriendsUserId } from "@/lib/friendsAuth";

export type FriendshipStatus =
  | "none"
  | "outgoing_request"
  | "incoming_request"
  | "friends"
  | "blocked";

export async function GET(req: Request) {
  const userId = await getFriendsUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const otherId = searchParams.get("userId");
  if (!otherId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  if (otherId === userId) {
    return NextResponse.json({ status: "none" as FriendshipStatus, friendshipId: null });
  }

  try {
    await dbConnect();

    const rel = await Friend.findOne({
      $or: [
        { requesterId: userId, recipientId: otherId },
        { requesterId: otherId, recipientId: userId },
      ],
    }).lean();

    if (!rel) {
      return NextResponse.json({ status: "none" as FriendshipStatus, friendshipId: null });
    }

    let status: FriendshipStatus = "none";
    if (rel.status === "accepted") status = "friends";
    else if (rel.status === "blocked") status = "blocked";
    else if (rel.status === "pending") {
      status = rel.requesterId.toString() === userId ? "outgoing_request" : "incoming_request";
    }
    // declined / cancelled → none for UI purposes

    return NextResponse.json({
      status,
      friendshipId: status === "none" ? null : String(rel._id),
      isBlocker: rel.status === "blocked" && rel.requesterId.toString() === userId,
    });
  } catch (error) {
    console.error("Error fetching friendship status:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
