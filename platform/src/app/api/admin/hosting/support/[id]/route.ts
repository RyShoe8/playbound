import { NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/db";
import { requireAdminSession } from "@/lib/requireAdmin";
import DedicatedSupportTicket from "@/lib/models/DedicatedSupportTicket";
import { replyToSupportTicket, SUPPORT_STATUSES, ticketView } from "@/lib/dedicatedHosting/support";

type Context = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Context) {
  const { session, error } = await requireAdminSession();
  if (error) return error;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const actorId = session?.user?.id;
  if (!actorId) return NextResponse.json({ error: "Admin identity missing" }, { status: 403 });
  const result = await replyToSupportTicket(id, actorId, "admin", body?.body);
  return NextResponse.json("error" in result ? { error: result.error } : { ticket: result.ticket }, { status: result.status });
}

export async function PATCH(req: Request, { params }: Context) {
  const { error } = await requireAdminSession();
  if (error) return error;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  if (!SUPPORT_STATUSES.includes(body?.status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  await dbConnect();
  const ticket = await DedicatedSupportTicket.findByIdAndUpdate(id, { $set: { status: body.status } }, { returnDocument: "after" });
  if (!ticket) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  return NextResponse.json({ ticket: ticketView(ticket.toObject()) });
}
