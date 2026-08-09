import dbConnect from "@/lib/db";
import PlatformEvent from "@/lib/models/PlatformEvent";
import EventRsvp from "@/lib/models/EventRsvp";
import Presence from "@/lib/models/Presence";
import TelemetryEvent from "@/lib/models/TelemetryEvent";
import { defaultEndsAt } from "@/lib/events/time";
import type { Types } from "mongoose";

/**
 * For live events: mark going RSVPs as attended (online) / played (playing game).
 * Never trust the client — only presence + telemetry.
 */
export async function syncEventAttendance(eventId: string): Promise<{
  attended: number;
  played: number;
}> {
  await dbConnect();
  const event = await PlatformEvent.findById(eventId).lean();
  if (!event) return { attended: 0, played: 0 };

  const startsAt = new Date(event.startsAt);
  const endsAt = event.endsAt ? new Date(event.endsAt) : defaultEndsAt(startsAt);
  const now = new Date();
  if (now < startsAt) return { attended: 0, played: 0 };

  const going = await EventRsvp.find({
    eventId: event._id,
    status: "going",
  }).lean();
  if (!going.length) return { attended: 0, played: 0 };

  const userIds = going.map((r) => r.userId as Types.ObjectId);
  const presences = await Presence.find({
    userId: { $in: userIds },
    status: { $nin: ["offline"] },
  }).lean();
  const presenceByUser = new Map(
    presences.map((p) => [String(p.userId), p] as const)
  );

  const gameSlug = event.gameSlug || null;
  let telemetryPlayers = new Set<string>();
  if (gameSlug) {
    const tele = await TelemetryEvent.find({
      event: { $in: ["game_started", "game_finished", "game_ended"] },
      userId: { $in: userIds.map(String) },
      createdAt: { $gte: startsAt, $lte: endsAt },
      "properties.gameSlug": gameSlug,
    })
      .select({ userId: 1 })
      .lean();
    telemetryPlayers = new Set(tele.map((t) => String(t.userId)).filter(Boolean));
  }

  let attended = 0;
  let played = 0;
  const ops: Promise<unknown>[] = [];

  for (const rsvp of going) {
    const uid = String(rsvp.userId);
    const p = presenceByUser.get(uid);
    const isOnline = Boolean(p);
    const isPlaying =
      (p?.status === "playing" &&
        (!gameSlug || p.currentGameId === gameSlug || !p.currentGameId)) ||
      telemetryPlayers.has(uid);

    const set: Record<string, Date> = {};
    if (isOnline && !rsvp.attendedAt) {
      set.attendedAt = now;
      attended++;
    } else if (rsvp.attendedAt) {
      attended++;
    }
    if (isPlaying && !rsvp.playedAt) {
      set.playedAt = now;
      if (!rsvp.attendedAt && !set.attendedAt) set.attendedAt = now;
      played++;
    } else if (rsvp.playedAt) {
      played++;
    }

    if (Object.keys(set).length) {
      ops.push(EventRsvp.updateOne({ _id: rsvp._id }, { $set: set }));
    }
  }

  await Promise.all(ops);
  return { attended, played };
}
