import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Party from "@/lib/models/Party";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { resolvedHostMode } from "@/lib/multiplayer/hostModes";
import { getRvglLobbyDisplay, sendRvglLobbyControl } from "@/lib/gameHost/client";

type Context = { params: Promise<{ id: string }> };

async function leaderRoom(req: Request, ctx: Context) {
  const userId = await getFriendsUserId(req);
  if (!userId) return { error: "Unauthorized", status: 401 } as const;
  const { id } = await ctx.params;
  if (!/^[a-f0-9]{24}$/i.test(id)) return { error: "Invalid party", status: 400 } as const;
  await dbConnect();
  const party = await Party.findById(id);
  if (!party) return { error: "Party not found", status: 404 } as const;
  if (String(party.leaderId) !== userId) return { error: "Only the party leader can control this lobby", status: 403 } as const;
  const roomId = party.hosted?.roomId;
  if (party.status === "ended" || party.gameSlug !== "re-volt-rvgl" ||
      resolvedHostMode(party.gameSlug, party.hostMode, party.hosted) !== "dedicated" ||
      party.hosted?.status !== "ready" || !roomId) {
    return { error: "No active Re-Volt VPS lobby", status: 409 } as const;
  }
  return { roomId } as const;
}

export async function GET(req: Request, ctx: Context) {
  const access = await leaderRoom(req, ctx);
  if (!("roomId" in access)) return NextResponse.json({ error: access.error }, { status: access.status });
  const result = await getRvglLobbyDisplay(access.roomId);
  return NextResponse.json(result, { status: result.error ? 502 : 200, headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request, ctx: Context) {
  const access = await leaderRoom(req, ctx);
  if (!("roomId" in access)) return NextResponse.json({ error: access.error }, { status: access.status });
  const input = await req.json().catch(() => null);
  const result = await sendRvglLobbyControl(access.roomId, input);
  return NextResponse.json(result, { status: result.error ? 502 : 200, headers: { "cache-control": "no-store" } });
}
