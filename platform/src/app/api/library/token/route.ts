import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import User from "@/lib/models/User";
import { hashLauncherToken, mintLauncherToken } from "@/lib/library";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    await dbConnect();
    const token = mintLauncherToken();
    const tokenHash = hashLauncherToken(token);
    await User.findByIdAndUpdate(session.user.id, {
      launcherTokenHash: tokenHash,
      launcherTokenCreatedAt: new Date(),
    });

    return NextResponse.json({
      token,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Launcher token mint error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    await dbConnect();
    await User.findByIdAndUpdate(session.user.id, {
      $unset: { launcherTokenHash: 1, launcherTokenCreatedAt: 1 },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Launcher token revoke error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    await dbConnect();
    const user = await User.findById(session.user.id).select("+launcherTokenHash +launcherTokenCreatedAt");
    return NextResponse.json({
      connected: Boolean(user?.launcherTokenHash),
      createdAt: user?.launcherTokenCreatedAt
        ? new Date(user.launcherTokenCreatedAt).toISOString()
        : null,
    });
  } catch (error) {
    console.error("Launcher token status error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
