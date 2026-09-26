import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { kickPlayer, listPlayers } from "@/lib/dedicatedHosting/control";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/hosting/servers/:id/players — who is connected, for games that report it. */
export async function GET(req: Request, ctx: Ctx) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const result = await listPlayers(userId, id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ players: result.players }, { headers: { "cache-control": "no-store" } });
}

/** POST /api/hosting/servers/:id/players — { action: "kick", playerId, playerName? }. */
export async function POST(req: Request, ctx: Ctx) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { action?: string; playerId?: string; playerName?: string } | null;
  if (body?.action !== "kick") return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  const result = await kickPlayer(userId, id, String(body.playerId ?? ""), body.playerName ? String(body.playerName).slice(0, 64) : undefined);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
