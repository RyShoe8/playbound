import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { joinParty } from "@/lib/playTogether/party";

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/parties/:id/join — join a party. */
export async function POST(req: Request, ctx: RouteContext) {
  const userId = await getFriendsUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const password = typeof body?.password === "string" ? body.password : undefined;
    const result = await joinParty(id, userId, password);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({
      party: result.party,
      needsDiscordLink: result.needsDiscordLink,
      inviteUrl: result.inviteUrl,
      moved: result.moved,
    });
  } catch (err) {
    console.error("POST /api/parties/[id]/join failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
