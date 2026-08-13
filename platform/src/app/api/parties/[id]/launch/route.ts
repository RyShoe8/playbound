import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { launchParty } from "@/lib/playTogether/party";

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/parties/:id/launch — launch the party (leader only). */
export async function POST(req: Request, ctx: RouteContext) {
  const userId = await getFriendsUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await ctx.params;
    const result = await launchParty(id, userId);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ party: result.party });
  } catch (err) {
    console.error("POST /api/parties/[id]/launch failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
