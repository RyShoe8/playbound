import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import DiscordConnection from "@/lib/models/DiscordConnection";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await dbConnect();
    const connection = await DiscordConnection.findOne({ userId: session.user.id }).lean();
    
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
