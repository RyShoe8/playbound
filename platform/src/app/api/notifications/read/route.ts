import { NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/db";
import Notification from "@/lib/models/Notification";
import { getFriendsUserId } from "@/lib/friendsAuth";

const bodySchema = z.object({
  id: z.string().min(1).optional(),
  all: z.boolean().optional(),
});

export async function POST(req: Request) {
  const userId = await getFriendsUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const { id, all } = parsed.data;
    if (!all && !id) {
      return NextResponse.json({ error: "id or all required" }, { status: 400 });
    }

    await dbConnect();
    const now = new Date();

    if (all) {
      await Notification.updateMany({ userId, readAt: null }, { $set: { readAt: now } });
    } else {
      await Notification.updateOne(
        { _id: id, userId, readAt: null },
        { $set: { readAt: now } }
      );
    }

    const unreadCount = await Notification.countDocuments({ userId, readAt: null });
    return NextResponse.json({ success: true, unreadCount });
  } catch (error) {
    console.error("Error marking notifications read:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
