import { NextResponse } from "next/server";
import { getPresenceUserId } from "@/lib/presenceAuth";
import { endPresence } from "@/lib/presence/server";

export async function POST(req: Request) {
  const userId = await getPresenceUserId(req);
  if (!userId) {
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
    /* best-effort */
  }

  try {
    await endPresence(
      { userId, userAgent: req.headers.get("user-agent"), referrer: null },
      sessionId
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[presence] end failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
