import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { respondPlayInvite } from "@/lib/playTogether/invites";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as { action?: string };
    const action = body.action;
    if (action !== "accept" && action !== "decline" && action !== "cancel") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
    const result = await respondPlayInvite({ inviteId: id, userId, action });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ invite: result.invite });
  } catch (err) {
    console.error("play-invites action failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
