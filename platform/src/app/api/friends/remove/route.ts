import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import Friend from "@/lib/models/Friend";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { friendId } = await req.json();
    if (!friendId) {
      return NextResponse.json({ error: "Friend user ID is required" }, { status: 400 });
    }

    const userId = session.user.id;
    await dbConnect();

    const friendship = await Friend.findOne({
      $or: [
        { requesterId: userId, recipientId: friendId },
        { requesterId: friendId, recipientId: userId },
      ],
      status: "accepted",
    });

    if (!friendship) {
      return NextResponse.json({ error: "Friendship not found" }, { status: 404 });
    }

    await friendship.deleteOne();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing friend:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
