import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Notification from "@/lib/models/Notification";
import { getFriendsUserId } from "@/lib/friendsAuth";

/**
 * GET /api/notifications — the bell's feed, or just its badge.
 *
 * `?count=1` returns `{ unreadCount, items: [] }` and skips the list entirely.
 *
 * The bell polls this every 10s from every signed-in page, but it only renders
 * `items` while the panel is open — which is almost never. Fetching fifty full
 * documents and serialising them on every pass, to display a single integer,
 * was the most expensive thing on the polling path.
 *
 * Deliberately not a cache: this is the only delivery path for `party_invite`,
 * `play_invite` and `party_launched`, so a TTL here would add straight to the
 * "we are starting, get in" latency that the 10s cadence exists to bound (see
 * lib/realtime/cadence.ts). Sending less costs nothing; sending it later does.
 */
export async function GET(req: Request) {
  const userId = await getFriendsUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const countOnly = new URL(req.url).searchParams.get("count") === "1";

  try {
    await dbConnect();

    if (countOnly) {
      const unreadCount = await Notification.countDocuments({ userId, readAt: null });
      // `items` is still present so a caller can read the response the same way
      // regardless of which form it asked for.
      return NextResponse.json({ unreadCount, items: [] });
    }

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
