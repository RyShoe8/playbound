import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { setReady } from "@/lib/playTogether/party";

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/parties/:id/ready — toggle ready status. */
export async function POST(req: Request, ctx: RouteContext) {
  const userId = await getFriendsUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const ready = body.ready === true;

    const result = await setReady(id, userId, ready);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ party: result.party });
  } catch (err) {
    console.error("POST /api/parties/[id]/ready failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
