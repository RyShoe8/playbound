import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import Friend from "@/lib/models/Friend";
import User from "@/lib/models/User";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { targetUserId } = await req.json();
    if (!targetUserId) {
      return NextResponse.json({ error: "Target user ID is required" }, { status: 400 });
    }

    const userId = session.user.id;

    if (userId === targetUserId) {
      return NextResponse.json({ error: "Cannot send a friend request to yourself" }, { status: 400 });
    }

    await dbConnect();

    // Check if user exists
    const targetUser = await User.findById(targetUserId).lean();
    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check if there is already a relationship
    const existingRelationship = await Friend.findOne({
      $or: [
        { requesterId: userId, recipientId: targetUserId },
        { requesterId: targetUserId, recipientId: userId },
      ],
    });

    if (existingRelationship) {
      if (existingRelationship.status === "blocked") {
        return NextResponse.json({ error: "Cannot send request" }, { status: 403 });
      }
      return NextResponse.json(
        { error: `Relationship already exists (status: ${existingRelationship.status})` },
        { status: 400 }
      );
    }

    const friendRequest = await Friend.create({
      requesterId: userId,
      recipientId: targetUserId,
      status: "pending",
    });

    return NextResponse.json({ success: true, request: friendRequest });
  } catch (error) {
    console.error("Error sending friend request:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
