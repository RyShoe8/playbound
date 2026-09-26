import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { runConsole } from "@/lib/dedicatedHosting/control";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/hosting/servers/:id/console — { command }. A game console command
 * over the server's own control channel (never a shell), checked by the
 * customer console guard and recorded in the activity log.
 */
export async function POST(req: Request, ctx: Ctx) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { command?: string } | null;
  const result = await runConsole(userId, id, String(body?.command ?? ""));
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ output: result.output });
}
