import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import { requireAdminSession } from "@/lib/requireAdmin";
import DedicatedSupportTicket from "@/lib/models/DedicatedSupportTicket";
import User from "@/lib/models/User";
import { ticketView } from "@/lib/dedicatedHosting/support";

export async function GET(req: Request) {
  const { error } = await requireAdminSession();
  if (error) return error;
  await dbConnect();
  if (new URL(req.url).searchParams.get("summary") === "1") {
    return NextResponse.json({ open: await DedicatedSupportTicket.countDocuments({ status: { $ne: "resolved" } }) });
  }
  const rows = await DedicatedSupportTicket.find({}).sort({ lastMessageAt: -1 }).limit(200).lean();
  const owners = await User.find({ _id: { $in: rows.map((row) => row.ownerId) } }).select({ username: 1, email: 1 }).lean();
  const ownerById = new Map(owners.map((u) => [String(u._id), { username: u.username || null, email: u.email || null }]));
  return NextResponse.json({ tickets: rows.map((row) => ({ ...ticketView(row as Record<string, unknown>), owner: ownerById.get(String(row.ownerId)) || null })) });
}
