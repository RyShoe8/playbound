import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { manageFiles } from "@/lib/dedicatedHosting/files";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (Number(req.headers.get("content-length") || 0) > 4 * 1024 ** 2 + 4096) return NextResponse.json({ error: "Browser file transfers are limited to 3 MB" }, { status: 413 });
  const result = await manageFiles(userId, (await ctx.params).id, await req.json().catch(() => null));
  return "error" in result ? NextResponse.json({ error: result.error }, { status: result.status }) : NextResponse.json(result.data, { headers: { "cache-control": "no-store" } });
}
