import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Party from "@/lib/models/Party";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { partyLanEnrollment } from "@/lib/virtualLan/provision";

type RouteContext = { params: Promise<{ id: string }> };

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
    return NextResponse.json(result);
  } catch (err) {
    console.error("POST /api/parties/[id]/lan failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
