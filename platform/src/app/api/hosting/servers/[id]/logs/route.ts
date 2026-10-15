import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { getServerLogs } from "@/lib/dedicatedHosting/logs";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "private, no-store" };
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  const { id } = await ctx.params;
  const result = await getServerLogs(userId, id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status, headers });
  return NextResponse.json(result.snapshot, { headers });
}
