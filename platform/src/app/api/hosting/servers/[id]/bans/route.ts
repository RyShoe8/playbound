import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { banPlayer, listBans, unbanPlayer } from "@/lib/dedicatedHosting/liveControl";

type Ctx = { params: Promise<{ id: string }> };

/** GET — the server's bans: names and dates only (addresses stay on the server). */
export async function GET(req: Request, ctx: Ctx) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const result = await listBans(userId, id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ bans: result.bans }, { headers: { "cache-control": "no-store" } });
}

/** POST — { playerId }: ban a connected player (by the id the Players tab shows) and kick them. */
export async function POST(req: Request, ctx: Ctx) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { playerId?: string } | null;
  const result = await banPlayer(userId, id, String(body?.playerId ?? ""));
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}

/** DELETE — { banId }: lift a ban (immediately where the game allows, otherwise at the next restart). */
export async function DELETE(req: Request, ctx: Ctx) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { banId?: string } | null;
  const result = await unbanPlayer(userId, id, String(body?.banId ?? ""));
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, liftedNow: result.liftedNow });
}
