import { NextResponse } from "next/server";
import { userFromLauncherBearer } from "@/lib/library";

/**
 * GET /api/game-auth/me   Authorization: Bearer <game token>
 *
 * Who the game is signed in as. 401 means the token was revoked or expired
 * and the game should sign in again.
 */
export async function GET(req: Request) {
  try {
    const user = await userFromLauncherBearer(req);
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    return NextResponse.json(
      { user: { id: String(user._id), username: String(user.username || "Player") } },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("GET /api/game-auth/me failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
