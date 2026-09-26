import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { deleteServer, updateServer } from "@/lib/dedicatedHosting/servers";
import { customerServerView } from "@/lib/dedicatedHosting/view";
import { getControl } from "@/lib/dedicatedHosting/control";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/hosting/servers/:id — the server plus its Server Control view for
 * the caller's role: live status, capabilities, permissions and the settings
 * the game declares (minus the slot count, which PlayBound owns).
 */
export async function GET(req: Request, ctx: Ctx) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const control = await getControl(userId, id);
  if ("error" in control) return NextResponse.json({ error: control.error }, { status: control.status });
  const { server, ...rest } = control;
  return NextResponse.json({ server, control: rest }, { headers: { "cache-control": "no-store" } });
}

/** PATCH /api/hosting/servers/:id — name, description, visibility, size (size only while stopped). */
export async function PATCH(req: Request, ctx: Ctx) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const result = await updateServer(userId, id, body);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ server: customerServerView(result.server as Record<string, unknown>), restartNeeded: result.restartNeeded });
}

/** DELETE /api/hosting/servers/:id — remove a stopped saved server. */
export async function DELETE(req: Request, ctx: Ctx) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const result = await deleteServer(userId, id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
