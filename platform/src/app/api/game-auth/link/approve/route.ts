import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { checkRateLimit } from "@/lib/discussion/rateLimit";
import { normalizeLinkCode, respondToGameLink } from "@/lib/gameAuth";

/**
 * POST /api/game-auth/link/approve  { code, approve }
 *
 * The signed-in player approves (or turns down) the code their game shows.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { code?: unknown; approve?: unknown };
  const code = normalizeLinkCode(body.code);
  if (!code) {
    return NextResponse.json({ error: "That code doesn't look right" }, { status: 400 });
  }

  const limit = await checkRateLimit(`game-link-approve:${session.user.id}`, { max: 20, windowMs: 10 * 60 * 1000 });
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  }

  try {
    const result = await respondToGameLink(code, session.user.id, body.approve !== false);
    if (result === "not_found") {
      return NextResponse.json(
        { error: "That code has expired or was already used. Start sign-in again in the game." },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error("POST /api/game-auth/link/approve failed:", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
