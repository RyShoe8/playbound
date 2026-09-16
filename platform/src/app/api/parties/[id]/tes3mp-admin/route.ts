import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import dbConnect from "@/lib/db";
import Party from "@/lib/models/Party";
import { updateRoomAdmins } from "@/lib/gameHost/client";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/parties/:id/tes3mp-admin
 *
 * Party leader registers their real TES3MP client login name on the VPS
 * allowlist. staffRank is keyed on that name, which is often not the
 * PlayBound username.
 */
export async function POST(req: Request, ctx: RouteContext) {
  const userId = await getFriendsUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { adminName?: string };
    const adminName = String(body.adminName || "")
      .trim()
      .replace(/[\r\n\t\0]/g, "")
      .slice(0, 32);
    if (!adminName) {
      return NextResponse.json({ error: "adminName is required" }, { status: 400 });
    }

    await dbConnect();
    const party = await Party.findById(id);
    if (!party) {
      return NextResponse.json({ error: "Party not found" }, { status: 404 });
    }
    if (String(party.leaderId) !== String(userId)) {
      return NextResponse.json({ error: "Only the party leader can set TES3MP admin" }, { status: 403 });
    }
    if (String(party.gameSlug || "") !== "morrowind") {
      return NextResponse.json({ error: "Not a Morrowind party" }, { status: 409 });
    }
    const roomId = party.hosted?.roomId;
    if (!roomId || party.hosted?.status !== "ready") {
      return NextResponse.json({ error: "Hosted room is not ready" }, { status: 409 });
    }

    const updated = await updateRoomAdmins(roomId, [adminName]);
    if (!updated.ok) {
      return NextResponse.json({ error: updated.error }, { status: 502 });
    }

    party.hosted.leaderUsername = adminName;
    await party.save();

    return NextResponse.json({ ok: true, admins: updated.admins });
  } catch (err) {
    console.error("POST /api/parties/[id]/tes3mp-admin failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
