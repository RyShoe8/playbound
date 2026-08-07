import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import DiscordConnection from "@/lib/models/DiscordConnection";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await dbConnect();
    await DiscordConnection.deleteOne({ userId: session.user.id });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error unlinking Discord:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
