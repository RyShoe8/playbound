import { Types } from "mongoose";
import dbConnect from "@/lib/db";
import DedicatedSupportTicket from "@/lib/models/DedicatedSupportTicket";
import CommunityServer from "@/lib/models/CommunityServer";
import DedicatedSubscription from "@/lib/models/DedicatedSubscription";
import { checkRateLimit } from "@/lib/discussion/rateLimit";

export type SupportCategory = "billing" | "server" | "game" | "other";
export type SupportStatus = "open" | "waiting_on_customer" | "resolved";
export const SUPPORT_CATEGORIES: SupportCategory[] = ["billing", "server", "game", "other"];
export const SUPPORT_STATUSES: SupportStatus[] = ["open", "waiting_on_customer", "resolved"];

export function supportText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 && text.length <= max ? text : null;
}

export function ticketView(ticket: Record<string, unknown>) {
  return {
    id: String(ticket._id), ownerId: String(ticket.ownerId),
    serverId: ticket.serverId ? String(ticket.serverId) : null,
    category: ticket.category, subject: ticket.subject, status: ticket.status,
    lastMessageAt: ticket.lastMessageAt,
    messages: ((ticket.messages || []) as Array<Record<string, unknown>>).map((m) => ({
      id: String(m._id), authorRole: m.authorRole, body: m.body, createdAt: m.createdAt,
    })),
  };
}

export async function createSupportTicket(ownerId: string, input: Record<string, unknown>) {
  const subject = supportText(input.subject, 120);
  const body = supportText(input.body, 4000);
  if (!subject || !body || !SUPPORT_CATEGORIES.includes(input.category as SupportCategory)) {
    return { error: "Choose a category and enter a subject (up to 120 characters) and message (up to 4000 characters).", status: 400 as const };
  }
  if (!Types.ObjectId.isValid(ownerId)) return { error: "Unauthorized", status: 401 as const };
  await dbConnect();
  const serverId = input.serverId == null || input.serverId === "" ? null : String(input.serverId);
  if (serverId) {
    if (!Types.ObjectId.isValid(serverId) || !await CommunityServer.exists({ _id: serverId, ownerType: "user", ownerId })) {
      return { error: "Server not found", status: 404 as const };
    }
  } else if (!await DedicatedSubscription.exists({ userId: ownerId })) {
    return { error: "Hosting support is available to Dedicated customers.", status: 403 as const };
  }
  const limit = await checkRateLimit(`hosting-support-create:${ownerId}`, { max: 3, windowMs: 60 * 60_000 });
  if (!limit.ok) return { error: "Please wait before opening another support request.", status: 429 as const };
  // An ordinary customer should not be able to flood the admin queue.
  const openCount = await DedicatedSupportTicket.countDocuments({ ownerId, status: { $ne: "resolved" } });
  if (openCount >= 5) return { error: "You have five open requests. Reply to one of those first.", status: 409 as const };
  const now = new Date();
  const ticket = await DedicatedSupportTicket.create({
    ownerId, serverId, category: input.category, subject, lastMessageAt: now,
    messages: [{ authorId: ownerId, authorRole: "customer", body, createdAt: now }],
  });
  return { ticket: ticketView(ticket.toObject()), status: 201 as const };
}

export async function replyToSupportTicket(ticketId: string, actorId: string, role: "customer" | "admin", bodyValue: unknown) {
  const body = supportText(bodyValue, 4000);
  if (!body) return { error: "Enter a message of up to 4000 characters.", status: 400 as const };
  if (!Types.ObjectId.isValid(ticketId) || !Types.ObjectId.isValid(actorId)) return { error: "Request not found", status: 404 as const };
  await dbConnect();
  if (role === "customer") {
    const limit = await checkRateLimit(`hosting-support-reply:${actorId}`, { max: 12, windowMs: 60 * 60_000 });
    if (!limit.ok) return { error: "Please wait before sending another reply.", status: 429 as const };
  }
  const now = new Date();
  const query = { _id: ticketId, ...(role === "customer" ? { ownerId: actorId } : {}) };
  const ticket = await DedicatedSupportTicket.findOneAndUpdate(query, {
    $push: { messages: { authorId: actorId, authorRole: role, body, createdAt: now } },
    $set: { status: role === "admin" ? "waiting_on_customer" : "open", lastMessageAt: now },
  }, { returnDocument: "after" });
  return ticket ? { ticket: ticketView(ticket.toObject()), status: 200 as const } : { error: "Request not found", status: 404 as const };
}
