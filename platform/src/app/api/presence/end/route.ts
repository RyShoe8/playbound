import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { endPresence } from "@/lib/presence/server";

/**
 * POST /api/presence/end
 *
 * Marks the user offline and closes their platform session.
 *
 * Best effort by design: this is usually sent from a `pagehide` handler via
 * sendBeacon, which the browser may drop. The staleness sweep is what
 * guarantees the row eventually closes — this just makes the common case
 * immediate instead of waiting two minutes.
 *
 * Reads the body defensively because sendBeacon sends a Blob, not JSON with a
 * content-type the framework will parse for us.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  let sessionId: string | null = null;
  try {
    const raw = await req.text();
    if (raw) {
      const parsed = JSON.parse(raw) as { sessionId?: unknown };
      if (typeof parsed?.sessionId === "string") {
        sessionId = parsed.sessionId.slice(0, 100);
      }
    }
  } catch {
    // A malformed beacon body must still close the session; without a
    // sessionId we simply close all of this user's active ones.
  }

  try {
    await endPresence(
      { userId: session.user.id, userAgent: req.headers.get("user-agent"), referrer: null },
      sessionId
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[presence] end failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
