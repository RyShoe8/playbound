import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { getMaintenance, saveMaintenance } from "@/lib/dedicatedHosting/maintenance";

type Ctx = { params: Promise<{ id: string }> };
export async function GET(req: Request, ctx: Ctx) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await getMaintenance(userId, (await ctx.params).id);
  return NextResponse.json(result, { status: "error" in result ? result.status : 200, headers: { "cache-control": "no-store" } });
}
export async function PUT(req: Request, ctx: Ctx) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await saveMaintenance(userId, (await ctx.params).id, await req.json().catch(() => null));
  return NextResponse.json(result, { status: "error" in result ? result.status : 200 });
}
