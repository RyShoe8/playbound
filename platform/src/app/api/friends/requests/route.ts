import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import Friend from "@/lib/models/Friend";
import User from "@/lib/models/User";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await dbConnect();
    const userId = session.user.id;

    // Fetch incoming and outgoing requests
    const [incomingDocs, outgoingDocs] = await Promise.all([
      Friend.find({ recipientId: userId, status: "pending" })
        .populate({ path: "requesterId", select: "username email image connectedAccounts" })
        .lean(),
      Friend.find({ requesterId: userId, status: "pending" })
        .populate({ path: "recipientId", select: "username email image connectedAccounts" })
        .lean(),
    ]);

    const formatUser = (userDoc: any) => ({
      id: userDoc._id,
      username: userDoc.username,
      email: userDoc.email,
      image: userDoc.image,
      discordLinked: !!userDoc.connectedAccounts?.discord?.discordUserId,
    });

    const incoming = incomingDocs.map((doc) => ({
      id: doc._id,
      user: formatUser(doc.requesterId),
      createdAt: doc.createdAt,
    }));

    const outgoing = outgoingDocs.map((doc) => ({
      id: doc._id,
      user: formatUser(doc.recipientId),
      createdAt: doc.createdAt,
    }));

    return NextResponse.json({ incoming, outgoing });
  } catch (error) {
    console.error("Error fetching friend requests:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
