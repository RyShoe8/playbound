import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { checkConfigSync } from "@/lib/playTogether/party";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/parties/:id/sync — check config sync status. */
export async function GET(req: Request, ctx: RouteContext) {
  const userId = await getFriendsUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await ctx.params;
    const result = await checkConfigSync(id);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ sync: result.sync });
  } catch (err) {
    console.error("GET /api/parties/[id]/sync failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
