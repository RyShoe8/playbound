import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Friend from "@/lib/models/Friend";
import { getFriendsUserId } from "@/lib/friendsAuth";

export async function GET(req: Request) {
  const userId = await getFriendsUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await dbConnect();

    const [incomingDocs, outgoingDocs] = await Promise.all([
      Friend.find({ recipientId: userId, status: "pending" })
        .populate({ path: "requesterId", select: "username email image connectedAccounts" })
        .lean(),
      Friend.find({ requesterId: userId, status: "pending" })
        .populate({ path: "recipientId", select: "username email image connectedAccounts" })
        .lean(),
    ]);

    const formatUser = (userDoc: any) => {
      if (!userDoc || !userDoc._id) {
        return { id: "", username: "Unknown", email: null, image: null, discordLinked: false };
      }
      return {
        id: userDoc._id,
        username: userDoc.username,
        email: userDoc.email,
        image: userDoc.image,
        discordLinked: !!userDoc.connectedAccounts?.discord?.discordUserId,
      };
    };

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
