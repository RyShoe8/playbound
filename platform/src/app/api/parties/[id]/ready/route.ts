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
    let ready = true;
    try {
      const body = (await req.json()) as { ready?: unknown };
      ready = body.ready === true;
    } catch {
      // Empty / non-JSON body — treat as ready-up (launcher always sends JSON).
      ready = true;
    }

    const result = await setReady(id, userId, ready);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ party: result.party });
  } catch (err) {
    console.error("POST /api/parties/[id]/ready failed:", err);
    return NextResponse.json(
      {
        error: "Internal Server Error",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
