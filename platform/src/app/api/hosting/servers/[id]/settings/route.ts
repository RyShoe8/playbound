import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { applyControlSettings } from "@/lib/dedicatedHosting/control";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/hosting/servers/:id/settings — { settings: {...} }; reports whether it applied live, restarted or was saved. */
export async function PATCH(req: Request, ctx: Ctx) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { settings?: Record<string, unknown> } | null;
  if (!body?.settings || typeof body.settings !== "object") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const result = await applyControlSettings(userId, id, body.settings);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ applied: result.applied, rejected: result.rejected, outcome: result.outcome, state: result.state });
}
