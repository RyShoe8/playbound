import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Party from "@/lib/models/Party";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { partyLanEnrollment } from "@/lib/virtualLan/provision";
import { isIP } from "node:net";

type RouteContext = { params: Promise<{ id: string }> };

function isPrivateOverlayAddress(value: unknown): value is string {
  if (typeof value !== "string" || isIP(value) !== 4) return false;
  const [a, b] = value.split(".").map(Number);
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

/**
 * POST /api/parties/:id/lan — hand this member's launcher what it needs to
 * enrol on the party's overlay segment.
 *
 * A setup key enrols a machine, so it is a credential and does not belong in
 * the party payload every client polls. It goes out here, once, to a caller
 * confirmed to be in the party — membership is the authorization check, and
 * the key is ephemeral, party-scoped and usage-limited on NetBird's side so a
 * leaked one expires into nothing.
 */
export async function POST(req: Request, ctx: RouteContext) {
  const userId = await getFriendsUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await ctx.params;
    await dbConnect();
    const doc = await Party.findById(id);
    if (!doc) return NextResponse.json({ error: "Party not found" }, { status: 404 });
    if (doc.status === "ended") {
      return NextResponse.json({ error: "Party has ended" }, { status: 400 });
    }

    const member = doc.members.find(
      (m: { userId: unknown }) => String(m.userId) === userId
    );
    if (!member) {
      return NextResponse.json({ error: "Not in this party" }, { status: 403 });
    }

    const result = partyLanEnrollment(doc);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    const body = await req.json().catch(() => ({}));
    if (body.address !== undefined) {
      if (!isPrivateOverlayAddress(body.address)) {
        return NextResponse.json({ error: "Invalid party network address" }, { status: 400 });
      }
      member.lanAddress = body.address;
      doc.lastActivity = new Date();
      await doc.save();
    }

    const leader = doc.members.find(
      (candidate: { userId: unknown }) => String(candidate.userId) === String(doc.leaderId)
    );

    return NextResponse.json({
      ...result,
      isLeader: String(doc.leaderId) === userId,
      leaderAddress: isPrivateOverlayAddress(leader?.lanAddress) ? leader.lanAddress : null,
      peerAddresses: doc.members
        .filter((candidate: { userId: unknown; lanAddress?: string | null }) =>
          String(candidate.userId) !== userId && isPrivateOverlayAddress(candidate.lanAddress)
        )
        .map((candidate: { lanAddress: string }) => candidate.lanAddress),
    });
  } catch (err) {
    console.error("POST /api/parties/[id]/lan failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
