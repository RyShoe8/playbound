import { NextResponse } from "next/server";
import { z } from "zod";
import { getPresenceUserId } from "@/lib/presenceAuth";
import { heartbeat } from "@/lib/presence/server";
import { presenceBodySchema } from "@/app/api/presence/start/route";

export async function POST(req: Request) {
  const userId = await getPresenceUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    const body = presenceBodySchema.parse(await req.json().catch(() => ({})));
    await heartbeat(
      {
        userId,
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
