import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { startPresence } from "@/lib/presence/server";
import { CLIENT_REPORTABLE_STATUSES, HEARTBEAT_INTERVAL_MS } from "@/lib/presence/types";

export const presenceBodySchema = z.object({
  status: z.enum(CLIENT_REPORTABLE_STATUSES).optional(),
  page: z.string().max(500).nullish(),
  gameId: z.string().max(120).nullish(),
  editionId: z.string().max(120).nullish(),
  sessionId: z.string().max(100).nullish(),
});

/**
 * POST /api/presence/start
 *
 * Opens presence and an active platform session. Idempotent — calling it again
 * with the same sessionId resumes rather than duplicating, so a remount or a
 * reconnect is harmless.
 *
 * Anonymous callers get 401 and no row is written: presence without an
 * identity has nobody to be shown to.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    const body = presenceBodySchema.parse(await req.json().catch(() => ({})));
    const result = await startPresence(
      {
        userId: session.user.id,
        userAgent: req.headers.get("user-agent"),
        referrer: req.headers.get("referer"),
      },
      body
    );

    return NextResponse.json({
      ok: true,
      sessionId: result.sessionId,
      platform: result.platform,
      device: result.device,
      // Returned so the cadence lives on the server: changing it later does
      // not require every client to ship a new build.
      heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
    }
    console.error("[presence] start failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
