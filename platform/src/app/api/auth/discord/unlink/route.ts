import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import User from "@/lib/models/User";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  await dbConnect();
  await User.updateOne(
    { _id: session.user.id },
    { $unset: { "connectedAccounts.discord": 1 } }
  );
  return NextResponse.json({ success: true });
}
