import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { replyToSupportTicket } from "@/lib/dedicatedHosting/support";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const result = await replyToSupportTicket(id, userId, "customer", body?.body);
  return NextResponse.json("error" in result ? { error: result.error } : { ticket: result.ticket }, { status: result.status });
}
