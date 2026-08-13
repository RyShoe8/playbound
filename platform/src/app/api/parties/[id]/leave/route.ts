import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { leaveParty } from "@/lib/playTogether/party";

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/parties/:id/leave — leave a party (auto-transfers leadership). */
export async function POST(req: Request, ctx: RouteContext) {
  const userId = await getFriendsUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await ctx.params;
    const result = await leaveParty(id, userId);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ party: result.party, ok: true });
  } catch (err) {
    console.error("POST /api/parties/[id]/leave failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
