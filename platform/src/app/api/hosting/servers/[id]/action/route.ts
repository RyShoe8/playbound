import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { restartServer, startServer, stopServer } from "@/lib/dedicatedHosting/servers";

type Ctx = { params: Promise<{ id: string }> };
const ACTIONS = { start: startServer, stop: stopServer, restart: restartServer } as const;

/** POST /api/hosting/servers/:id/action — { action: "start" | "stop" | "restart" }. */
export async function POST(req: Request, ctx: Ctx) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { action?: string } | null;
  const run = body?.action && ACTIONS[body.action as keyof typeof ACTIONS];
  if (!run) return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  const result = await run(userId, id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
