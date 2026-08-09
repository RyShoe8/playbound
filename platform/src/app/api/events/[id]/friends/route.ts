import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { Types } from "mongoose";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import Friend from "@/lib/models/Friend";
import EventRsvp from "@/lib/models/EventRsvp";
import Presence from "@/lib/models/Presence";
import User from "@/lib/models/User";
import { maskPresenceForOthers } from "@/lib/friends/presenceMask";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ friends: [] });
  }
  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ friends: [] });
  }

  try {
    await dbConnect();
    const uid = new Types.ObjectId(session.user.id);
    const friendships = await Friend.find({
      status: "accepted",
      $or: [{ requesterId: uid }, { recipientId: uid }],
    }).lean();

    const friendIds = friendships.map((f) =>
      String(f.requesterId) === session.user.id ? f.recipientId : f.requesterId
    );
    if (!friendIds.length) return NextResponse.json({ friends: [] });

    const rsvps = await EventRsvp.find({
      eventId: id,
      userId: { $in: friendIds },
      status: { $in: ["going", "maybe"] },
    }).lean();
    if (!rsvps.length) return NextResponse.json({ friends: [] });

    const rsvpUserIds = rsvps.map((r) => r.userId);
    const [users, presences, me] = await Promise.all([
      User.find({ _id: { $in: rsvpUserIds } })
        .select({ username: 1, preferences: 1 })
        .lean(),
      Presence.find({ userId: { $in: rsvpUserIds } }).lean(),
      User.findById(uid).select({ preferences: 1 }).lean(),
    ]);

    const userById = new Map(users.map((u) => [String(u._id), u]));
    const presenceById = new Map(presences.map((p) => [String(p.userId), p]));
    const rsvpById = new Map(rsvps.map((r) => [String(r.userId), r]));

    const friends = rsvpUserIds
      .map((fid) => {
        const u = userById.get(String(fid));
        if (!u) return null;
        const raw = presenceById.get(String(fid));
        const appearOffline = Boolean(
          (u as { preferences?: { appearOffline?: boolean } }).preferences
            ?.appearOffline
        );
        const masked = raw
          ? maskPresenceForOthers(
              {
                status: raw.status,
                currentGameId: raw.currentGameId,
                platform: raw.platform,
              },
              appearOffline
            )
          : { status: "offline", currentGameId: null, platform: undefined };
        const rsvp = rsvpById.get(String(fid));
        return {
          userId: String(fid),
          username: u.username || "Player",
          rsvpStatus: rsvp?.status || null,
          presence: masked,
        };
      })
      .filter(Boolean);

    void me;
    return NextResponse.json({ friends });
  } catch (err) {
    console.error("Event friends error:", err);
    return NextResponse.json({ friends: [] });
  }
}
