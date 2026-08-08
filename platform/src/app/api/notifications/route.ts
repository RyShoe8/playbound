import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import Notification from "@/lib/models/Notification";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await dbConnect();
    const userId = session.user.id;
    const [items, unreadCount] = await Promise.all([
      Notification.find({ userId })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
      Notification.countDocuments({ userId, readAt: null }),
    ]);

    return NextResponse.json({
      unreadCount,
      items: items.map((n) => ({
        id: String(n._id),
        type: n.type,
        title: n.title,
        body: n.body || null,
        href: n.href || "/friends",
        readAt: n.readAt || null,
        createdAt: n.createdAt,
        meta: n.meta || {},
      })),
    });
  } catch (error) {
    console.error("Error listing notifications:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
