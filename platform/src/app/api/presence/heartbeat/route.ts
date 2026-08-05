import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { heartbeat } from "@/lib/presence/server";
import { presenceBodySchema } from "@/app/api/presence/start/route";

/**
 * POST /api/presence/heartbeat
 *
 * The hot path: one call per minute per open client. Kept to two indexed
 * writes and a deliberately tiny response — no lookups, no aggregation, and
 * only the fields the client actually sent.
 *
 * Upserts, so a heartbeat arriving after the staleness sweep (or a restart)
 * restores presence rather than failing and forcing the client to re-`start`.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    // 401 tells the client to stop beating rather than retry forever — the
    // user signed out or the session expired.
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    const body = presenceBodySchema.parse(await req.json().catch(() => ({})));
    await heartbeat(
      {
        userId: session.user.id,
        userAgent: req.headers.get("user-agent"),
        referrer: null,
      },
      body
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
    }
    console.error("[presence] heartbeat failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
