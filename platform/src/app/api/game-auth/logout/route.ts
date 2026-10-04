import { NextResponse } from "next/server";
import { revokeLauncherToken } from "@/lib/library";

/**
 * POST /api/game-auth/logout   Authorization: Bearer <game token>
 *
 * Signs this game out by revoking its token. The player's other devices
 * (launcher, other games) stay signed in.
 */
export async function POST(req: Request) {
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") || "");
  if (!match?.[1]) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  try {
    await revokeLauncherToken(match[1].trim());
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/game-auth/logout failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
