import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import dbConnect from "@/lib/db";
import Party from "@/lib/models/Party";
import { runRoomTes3mpCommand } from "@/lib/gameHost/client";
import { resolvedHostMode } from "@/lib/multiplayer/hostModes";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/parties/:id/tes3mp-command
 *
 * Party leader runs a TES3MP admin command from the overlay:
 * `{ command: "invite", targetPid }` ("Make Ally", same as `/invite <pid>`)
 * or `{ command: "runstartup" }` (same as `/runstartup`).
 */
export async function POST(req: Request, ctx: RouteContext) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { command?: string; targetPid?: number };
    const command = body.command === "invite" || body.command === "runstartup" ? body.command : null;
    if (!command) return NextResponse.json({ error: "Unknown command" }, { status: 400 });
    const targetPid = command === "invite" ? Number(body.targetPid) : null;
    if (command === "invite" && (!Number.isInteger(targetPid) || (targetPid as number) < 0)) {
      return NextResponse.json({ error: "Choose a player" }, { status: 400 });
    }

    await dbConnect();
    const party = await Party.findById(id);
    if (!party) return NextResponse.json({ error: "Party not found" }, { status: 404 });
    if (String(party.leaderId) !== String(userId)) {
      return NextResponse.json({ error: "Only the party leader can run server commands" }, { status: 403 });
    }
    if (String(party.gameSlug || "") !== "morrowind") {
      return NextResponse.json({ error: "Not a Morrowind party" }, { status: 409 });
    }
    const hostMode = resolvedHostMode(String(party.gameSlug || ""), party.hostMode, party.hosted);
    if (hostMode === "self") {
      // Same convention as set-hour: the host's launcher runs it locally.
      return NextResponse.json(
        { error: "Self-hosted commands are handled by the host launcher.", hostMode: "self" },
        { status: 409 }
      );
    }
    if (hostMode !== "dedicated") {
      return NextResponse.json({ error: "Only PlayBound servers support this" }, { status: 409 });
    }
    const roomId = party.hosted?.roomId;
    if (!roomId || party.hosted?.status !== "ready") {
      return NextResponse.json({ error: "Hosted room is not ready" }, { status: 409 });
    }

    const result = await runRoomTes3mpCommand(roomId, command, targetPid);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
    return NextResponse.json({ ok: true, command });
  } catch (err) {
    console.error("POST /api/parties/[id]/tes3mp-command failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
