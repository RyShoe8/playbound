import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { issueLauncherHandoffForUser, LAUNCHER_HANDOFF_TTL_MS } from "@/lib/library";

/** Mint a short-lived one-time code for playbound://link?code= (session required). */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    const code = await issueLauncherHandoffForUser(session.user.id);
    return NextResponse.json({
      code,
      expiresInMs: LAUNCHER_HANDOFF_TTL_MS,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Launcher handoff mint error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
