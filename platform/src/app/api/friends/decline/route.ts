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
    const { requestId } = await req.json();
    if (!requestId) {
      return NextResponse.json({ error: "Request ID is required" }, { status: 400 });
    }

    const userId = session.user.id;
    await dbConnect();

    // The user declining must be the recipient or the requester cancelling it.
    const friendRequest = await Friend.findOne({
      _id: requestId,
      $or: [{ recipientId: userId }, { requesterId: userId }],
      status: "pending",
    });

    if (!friendRequest) {
      return NextResponse.json({ error: "Friend request not found" }, { status: 404 });
    }

    // Either delete or mark declined. Deleting makes it possible to send again cleanly.
    await friendRequest.deleteOne();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error declining friend request:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
