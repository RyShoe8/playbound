import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Party from "@/lib/models/Party";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { authorizePartyLanNode } from "@/lib/virtualLan/provision";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/parties/:id/lan — let this member's machine onto the party's
 * overlay segment.
 *
 * The launcher only learns its own node ID after the overlay client is
 * installed and running, so authorization cannot happen at provision time and
 * gets its own call. Membership in the party is the authorization check: a
 * node ID is not a secret, so the guard has to be who is asking, not what
 * they know.
 */
export async function POST(req: Request, ctx: RouteContext) {
  const userId = await getFriendsUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { nodeId?: unknown };
    const nodeId = String(body.nodeId || "").trim().toLowerCase();

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

    const result = await authorizePartyLanNode(doc, nodeId);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ networkId: result.networkId });
  } catch (err) {
    console.error("POST /api/parties/[id]/lan failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
