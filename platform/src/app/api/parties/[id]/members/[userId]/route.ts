import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { removeMember, transferLeadership } from "@/lib/playTogether/party";

type RouteContext = { params: Promise<{ id: string; userId: string }> };

/** DELETE /api/parties/:id/members/:userId — remove a member (leader only). */
export async function DELETE(req: Request, ctx: RouteContext) {
  const actorId = await getFriendsUserId(req);
  if (!actorId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id, userId: targetId } = await ctx.params;
    const result = await removeMember(id, actorId, targetId);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ party: result.party });
  } catch (err) {
    console.error("DELETE /api/parties/[id]/members/[userId] failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/** POST /api/parties/:id/members/:userId — transfer leadership. */
export async function POST(req: Request, ctx: RouteContext) {
  const actorId = await getFriendsUserId(req);
  if (!actorId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id, userId: targetId } = await ctx.params;
    const body = await req.json();

    if (body.role === "leader") {
      const result = await transferLeadership(id, actorId, targetId);
      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return NextResponse.json({ party: result.party });
    }

    return NextResponse.json({ error: "Only role='leader' transfer is supported" }, { status: 400 });
  } catch (err) {
    console.error("POST /api/parties/[id]/members/[userId] failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
