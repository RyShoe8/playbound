import { NextResponse } from "next/server";
import { z } from "zod";
import { getPresenceUserId } from "@/lib/presenceAuth";
import { startPresence } from "@/lib/presence/server";
import { CLIENT_REPORTABLE_STATUSES, HEARTBEAT_INTERVAL_MS } from "@/lib/presence/types";

export const presenceBodySchema = z.object({
  status: z.enum(CLIENT_REPORTABLE_STATUSES).optional(),
  page: z.string().max(500).nullish(),
  gameId: z.string().max(120).nullish(),
  editionId: z.string().max(120).nullish(),
  sessionId: z.string().max(100).nullish(),
});

export async function POST(req: Request) {
  const userId = await getPresenceUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    const body = presenceBodySchema.parse(await req.json().catch(() => ({})));
    const result = await startPresence(
      {
        userId,
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
