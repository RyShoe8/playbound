import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { addHostingAdmin, listHostingAdmins, removeHostingAdmin } from "@/lib/dedicatedHosting/admins";

export async function GET(req: Request) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await listHostingAdmins(userId);
  return NextResponse.json(result, { status: "error" in result ? result.status : 200, headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const result = await addHostingAdmin(userId, { username: typeof body.username === "string" ? body.username : undefined, email: typeof body.email === "string" ? body.email : undefined });
  return NextResponse.json(result, { status: "error" in result ? result.status : 200 });
}

export async function DELETE(req: Request) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const result = await removeHostingAdmin(userId, { userId: typeof body.userId === "string" ? body.userId : undefined, inviteId: typeof body.inviteId === "string" ? body.inviteId : undefined });
  return NextResponse.json(result, { status: "error" in result ? result.status : 200 });
}
