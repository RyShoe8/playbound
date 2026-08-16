import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { Types } from "mongoose";
import { authOptions } from "@/lib/auth";
import { userFromLauncherBearer } from "@/lib/library";
import dbConnect from "@/lib/db";
import Friend from "@/lib/models/Friend";
import EventRsvp from "@/lib/models/EventRsvp";
import PlatformEvent from "@/lib/models/PlatformEvent";
import User from "@/lib/models/User";
import { serializeEvent } from "@/lib/events/serialize";
import { PUBLIC_LISTABLE_STATUSES } from "@/lib/events/types";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const launcherUser = session?.user?.id ? null : await userFromLauncherBearer(req);
  const userId = session?.user?.id || (launcherUser?._id ? launcherUser._id.toString() : null);
  if (!userId) {
    return NextResponse.json({ events: [] });
  }

  try {
    await dbConnect();
    const uid = new Types.ObjectId(userId);
    const friendships = await Friend.find({
      status: "accepted",
      $or: [{ requesterId: uid }, { recipientId: uid }],
    }).lean();
    const friendIds = friendships.map((f) =>
      String(f.requesterId) === userId ? f.recipientId : f.requesterId
    );
    if (!friendIds.length) return NextResponse.json({ events: [] });

    const friendRsvps = await EventRsvp.find({
      userId: { $in: friendIds },
      status: "going",
    }).lean();
    if (!friendRsvps.length) return NextResponse.json({ events: [] });

    const eventIds = [...new Set(friendRsvps.map((r) => String(r.eventId)))];
    const now = new Date();
    const events = await PlatformEvent.find({
      _id: { $in: eventIds.map((id) => new Types.ObjectId(id)) },
      visibility: "public",
      status: { $in: PUBLIC_LISTABLE_STATUSES.filter((s) => s !== "completed") },
      startsAt: { $gte: new Date(now.getTime() - 2 * 3600_000) },
    })
      .sort({ startsAt: 1 })
      .limit(8)
      .lean();

    const users = await User.find({ _id: { $in: friendIds } })
      .select({ username: 1 })
      .lean();
    const nameById = new Map(users.map((u) => [String(u._id), u.username || "Friend"]));

    const rows = events.map((e) => {
      const goingFriends = friendRsvps.filter(
        (r) => String(r.eventId) === String(e._id)
      );
      const names = goingFriends
        .map((r) => nameById.get(String(r.userId)) || "Friend")
        .slice(0, 3);
      const serialized = serializeEvent(e);
      return {
        id: serialized.id,
        title: serialized.title,
        startsAt: serialized.startsAt,
        endsAt: serialized.endsAt,
        friendCount: goingFriends.length,
        friendNames: names,
      };
    });

    return NextResponse.json({ events: rows });
  } catch (err) {
    console.error("friends-upcoming events error:", err);
    return NextResponse.json({ events: [] });
  }
}
