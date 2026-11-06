import { NextResponse } from "next/server";
import { z } from "zod";
import { getFriendsUserId } from "@/lib/friendsAuth";
import dbConnect from "@/lib/db";
import Notification from "@/lib/models/Notification";
import User from "@/lib/models/User";
import PlatformEvent from "@/lib/models/PlatformEvent";
import { checkInviteRecipient } from "@/lib/playTogether/invites";
import { checkRateLimit } from "@/lib/discussion/rateLimit";

const schema = z.object({ friendId: z.string().regex(/^[a-f0-9]{24}$/i), message: z.string().trim().min(1).max(500), eventId: z.string().regex(/^[a-f0-9]{24}$/i).optional() });
export async function POST(req: Request) {
  const sender = await getFriendsUserId(req);
  if (!sender) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const result = schema.safeParse(await req.json().catch(() => null));
  if (!result.success) return NextResponse.json({ error: "Enter a message of up to 500 characters." }, { status: 400 });
  await dbConnect();
  const { friendId, message, eventId } = result.data;
  const allowed = await checkInviteRecipient(sender, friendId);
  if ("error" in allowed) return NextResponse.json(allowed, { status: allowed.status });
  if (eventId && !await PlatformEvent.exists({ _id: eventId, createdBy: sender })) return NextResponse.json({ error: "Event unavailable" }, {status:404});
  const quota = await checkRateLimit(`friend-message:${sender}`, { max: 30, windowMs: 3600000 });
  if (!quota.ok) return NextResponse.json({ error: "Try sending again later." }, { status: 429 });
  const user = await User.findById(sender).select("username").lean();
  const notification = { userId: friendId, type: "friend_message", title: `Message from ${user?.username || "a friend"}`, body: message, href: eventId ? `/events/${eventId}` : `/?friend=${sender}`, meta: { senderId: sender } };
  if (eventId) {
    const dedupeKey = `planned-party:${eventId}`;
    await Notification.updateOne({ userId: friendId, dedupeKey }, { $setOnInsert: { ...notification, dedupeKey } }, { upsert: true });
  } else {
    await Notification.create(notification);
  }
  return NextResponse.json({ ok: true });
}
