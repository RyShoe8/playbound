import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import dbConnect from "@/lib/db";
import DedicatedSupportTicket from "@/lib/models/DedicatedSupportTicket";
import { createSupportTicket, ticketView } from "@/lib/dedicatedHosting/support";

export async function GET(req: Request) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();
  const rows = await DedicatedSupportTicket.find({ ownerId: userId }).sort({ lastMessageAt: -1 }).limit(50).lean();
  return NextResponse.json({ tickets: rows.map((row) => ticketView(row as Record<string, unknown>)) });
}

export async function POST(req: Request) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const result = await createSupportTicket(userId, body as Record<string, unknown>);
  return NextResponse.json("error" in result ? { error: result.error } : { ticket: result.ticket }, { status: result.status });
}
