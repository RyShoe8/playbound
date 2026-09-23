import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import User from "@/lib/models/User";
import LauncherCredential from "@/lib/models/LauncherCredential";
import {
  hasLauncherConnection,
  issueLauncherTokenForUser,
  LAUNCHER_TOKEN_TTL_MS,
  revokeAllLauncherTokensForUser,
  revokeLauncherToken,
  userFromLauncherBearer,
} from "@/lib/library";
import { saveEvent } from "@/lib/telemetry/server/saveEvent";
import { canAccessTesting } from "@/lib/requestIncludesTesting";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    await dbConnect();
    const existing = await User.findById(session.user.id).select("+launcherTokenHash");
    const firstConnect = !(await hasLauncherConnection(session.user.id, existing?.launcherTokenHash));

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

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") || "")?.[1]?.trim();
  if (!bearer && !session?.user?.id) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    if (bearer) {
      if (!(await revokeLauncherToken(bearer))) {
        return NextResponse.json({ error: "Invalid launcher token" }, { status: 401 });
      }
    } else if (session?.user?.id) {
      await revokeAllLauncherTokensForUser(session.user.id);
    }
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
        // The launcher needs this to tell "me" apart from the other members of
        // a party — leader checks, the (You) marker, and hiding kick/promote on
        // your own row. Username would mostly work but the party payload keys
        // members by id, so matching on anything else is guesswork.
        userId: String(user._id),
        email: user.email || null,
        username: user.username || null,
        role: user.role || "user",
        isAdmin: user.role === "admin",
        isTester: Boolean((user as { tester?: boolean }).tester),
        canUseAdminChannel: canAccessTesting(user as { role?: string; tester?: boolean }),
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
    const credential = await LauncherCredential.findOne({
      userId: session.user.id,
      revokedAt: null,
      createdAt: { $gt: new Date(Date.now() - LAUNCHER_TOKEN_TTL_MS) },
    }).sort({ createdAt: -1 }).select("createdAt");
    const createdAt = credential?.createdAt || user?.launcherTokenCreatedAt || null;
    return NextResponse.json({
      connected: Boolean(credential || user?.launcherTokenHash),
      createdAt: createdAt ? new Date(createdAt).toISOString() : null,
    });
  } catch (error) {
    console.error("Launcher token status error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
