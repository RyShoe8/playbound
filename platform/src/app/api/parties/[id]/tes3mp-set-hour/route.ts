import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import dbConnect from "@/lib/db";
import Party from "@/lib/models/Party";
import { setRoomTes3mpHour } from "@/lib/gameHost/client";
import { resolvedHostMode } from "@/lib/multiplayer/hostModes";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/parties/:id/tes3mp-set-hour
 *
 * Party leader sets TES3MP time of day (0–23), same as in-game `/sethour`.
 */
export async function POST(req: Request, ctx: RouteContext) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { hour?: number };
    const hour = Math.floor(Number(body.hour));
    if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
      return NextResponse.json(
        { error: "Hour must be a whole number from 0 to 23 (same as /sethour)." },
        { status: 400 }
      );
    }

    await dbConnect();
    const party = await Party.findById(id);
    if (!party) return NextResponse.json({ error: "Party not found" }, { status: 404 });
    if (String(party.leaderId) !== String(userId)) {
      return NextResponse.json({ error: "Only the party leader can set the hour" }, { status: 403 });
    }
    if (String(party.gameSlug || "") !== "morrowind") {
      return NextResponse.json({ error: "Not a Morrowind party" }, { status: 409 });
    }

    const hostMode = resolvedHostMode(String(party.gameSlug || ""), party.hostMode, party.hosted);
    if (hostMode === "self") {
      return NextResponse.json(
        {
          error: "Self-hosted set-hour is handled by the host launcher.",
          hostMode: "self",
        },
        { status: 409 }
      );
    }

    const roomId = party.hosted?.roomId;
    if (!roomId || party.hosted?.status !== "ready") {
      return NextResponse.json({ error: "Hosted room is not ready" }, { status: 409 });
    }

    const set = await setRoomTes3mpHour(roomId, hour);
    if (!set.ok) return NextResponse.json({ error: set.error }, { status: 502 });
    return NextResponse.json({ ok: true, hour: set.hour });
  } catch (err) {
    console.error("POST /api/parties/[id]/tes3mp-set-hour failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
