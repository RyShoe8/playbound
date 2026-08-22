import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { exitPartyGame } from "@/lib/playTogether/party";

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/parties/:id/exit-game — member closed the game; end session when nobody is left in it. */
export async function POST(_req: Request, ctx: RouteContext) {
  const userId = await getFriendsUserId(_req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await ctx.params;
    const result = await exitPartyGame(id, userId);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ party: result.party });
  } catch (err) {
    console.error("POST /api/parties/[id]/exit-game failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
