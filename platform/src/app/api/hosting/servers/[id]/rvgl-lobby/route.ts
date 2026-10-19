import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { authorizeServer } from "@/lib/dedicatedHosting/access";
import { getRvglLobbyDisplay, listManagedHostRooms, sendRvglLobbyControl } from "@/lib/gameHost/client";
import { customerRvglRoom } from "@/lib/dedicatedHosting/rvglLobby";

type Ctx = { params: Promise<{ id: string }> };

async function customerLobby(req: Request, ctx: Ctx, permission: "server:view" | "server:configure") {
  const userId = await getFriendsUserId(req);
  if (!userId) return { error: "Unauthorized", status: 401 } as const;
  const { id } = await ctx.params;
  const access = await authorizeServer(userId, id, permission);
  if ("error" in access) return access;
  if (access.server.gameSlug !== "re-volt-rvgl") return { error: "This server has no RVGL lobby", status: 409 } as const;
  const managed = await listManagedHostRooms();
  if (!managed.ok) return { error: managed.error, status: 503 } as const;
  const roomId = customerRvglRoom(managed.rooms, id);
  if (!roomId) return { error: "Start the server to control its lobby", status: 409 } as const;
  return { roomId } as const;
}

export async function GET(req: Request, ctx: Ctx) {
  const access = await customerLobby(req, ctx, "server:view");
  if (!("roomId" in access && typeof access.roomId === "string")) return NextResponse.json({ error: access.error }, { status: access.status });
  const result = await getRvglLobbyDisplay(access.roomId);
  return NextResponse.json(result, { status: result.error ? 502 : 200, headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request, ctx: Ctx) {
  const access = await customerLobby(req, ctx, "server:configure");
  if (!("roomId" in access && typeof access.roomId === "string")) return NextResponse.json({ error: access.error }, { status: access.status });
  const input = await req.json().catch(() => null);
  const result = await sendRvglLobbyControl(access.roomId, input);
  return NextResponse.json(result, { status: result.error ? 502 : 200, headers: { "cache-control": "no-store" } });
}
