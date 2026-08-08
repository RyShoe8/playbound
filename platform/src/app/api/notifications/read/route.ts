import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import Notification from "@/lib/models/Notification";

const bodySchema = z.object({
  id: z.string().min(1).optional(),
  all: z.boolean().optional(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
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
    const userId = session.user.id;
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
