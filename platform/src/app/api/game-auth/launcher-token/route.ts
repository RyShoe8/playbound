import { NextResponse } from "next/server";
import { issueLauncherTokenForUser, userFromLauncherBearer } from "@/lib/library";
import { normalizeGameSlug } from "@/lib/gameAuth";

/**
 * POST /api/game-auth/launcher-token  { gameSlug }   Authorization: Bearer <launcher token>
 *
 * The signed-in launcher asks for a token for a game it is about to start,
 * and passes it to the game (PLAYBOUND_TOKEN environment variable), so a game
 * launched from PlayBound is signed in without any prompt. The game gets its
 * own revocable credential rather than the launcher's.
 */
export async function POST(req: Request) {
  try {
    const user = await userFromLauncherBearer(req);
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const body = (await req.json().catch(() => ({}))) as { gameSlug?: unknown };
    const gameSlug = normalizeGameSlug(body.gameSlug);
    if (!gameSlug) return NextResponse.json({ error: "gameSlug required" }, { status: 400 });
    const token = await issueLauncherTokenForUser(String(user._id), `game:${gameSlug}`);
    return NextResponse.json(
      { token, user: { id: String(user._id), username: String(user.username || "Player") } },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("POST /api/game-auth/launcher-token failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
