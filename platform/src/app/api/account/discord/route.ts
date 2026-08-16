import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import dbConnect from "@/lib/db";
import DiscordConnection from "@/lib/models/DiscordConnection";

export async function GET(req: Request) {
  const userId = await getFriendsUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await dbConnect();
    const connection = await DiscordConnection.findOne({ userId }).lean();
    
    if (!connection) {
      return NextResponse.json({ linked: false });
    }

    return NextResponse.json({
      linked: true,
      username: connection.username,
      globalName: connection.globalName,
      avatar: connection.avatar,
      linkedAt: connection.linkedAt,
    });
  } catch (error) {
    console.error("Error fetching Discord connection:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
