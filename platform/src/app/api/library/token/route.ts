import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import User from "@/lib/models/User";
import {
  hashLauncherToken,
  issueLauncherTokenForUser,
  userFromLauncherBearer,
} from "@/lib/library";
import { saveEvent } from "@/lib/telemetry/server/saveEvent";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    await dbConnect();
    const existing = await User.findById(session.user.id).select("+launcherTokenHash");
    const firstConnect = !existing?.launcherTokenHash;

    const token = await issueLauncherTokenForUser(session.user.id);

    if (firstConnect) {
      void saveEvent({
        event: "launcher_connected",
        properties: { firstConnect: true },
        userId: session.user.id,
      }).catch(() => undefined);
    }

    return NextResponse.json({
      token,
      createdAt: new Date().toISOString(),
      firstConnect,
    });
  } catch (error) {
    console.error("Launcher token mint error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Deliberately does not go through userFromLauncherBearer: revoking a token
 * must keep working even for a disabled account, so a ban never leaves a live
 * credential behind on the user's machine.
 */
async function userIdFromBearer(req: Request): Promise<string | null> {
  const header = req.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match?.[1]) return null;
  await dbConnect();
  const user = await User.findOne({
    launcherTokenHash: hashLauncherToken(match[1].trim()),
  }).select("+launcherTokenHash _id");
  return user?._id?.toString() ?? null;
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  let userId = session?.user?.id ?? null;
  if (!userId) {
    userId = await userIdFromBearer(req);
  }
  if (!userId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    await dbConnect();
    await User.findByIdAndUpdate(userId, {
      $unset: { launcherTokenHash: 1, launcherTokenCreatedAt: 1 },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Launcher token revoke error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const header = req.headers.get("authorization") || "";
  const bearer = /^Bearer\s+(.+)$/i.exec(header)?.[1]?.trim();

  if (bearer) {
    try {
      // Shared helper so a disabled account cannot keep validating its token
      // (or reading back its own email) from the desktop app.
      const user = await userFromLauncherBearer(req);
      if (!user) {
        return NextResponse.json({ connected: false, valid: false }, { status: 401 });
      }
      return NextResponse.json({
        connected: true,
        valid: true,
        email: user.email || null,
        username: user.username || null,
        role: user.role || "user",
        isAdmin: user.role === "admin",
      });
    } catch (error) {
      console.error("Launcher token validate error:", error);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  }

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
