import dbConnect from "@/lib/db";
import EventRsvp from "@/lib/models/EventRsvp";
import PlatformEvent from "@/lib/models/PlatformEvent";
import {
  Tournament,
  TournamentParticipant,
} from "@/lib/models/Tournament";
import {
  canRsvp,
  deriveEventStatus,
  isRsvpStatus,
  type RsvpStatus,
} from "@/lib/events/types";
import { defaultEndsAt } from "@/lib/events/time";
import { getRsvpCounts } from "@/lib/events/rsvpCounts";

export type SetRsvpResult =
  | { ok: true; status: RsvpStatus; counts: Awaited<ReturnType<typeof getRsvpCounts>> }
  | { ok: false; error: string; code: number };

export async function setEventRsvp(opts: {
  eventId: string;
  userId: string;
  status: string;
}): Promise<SetRsvpResult> {
  if (!isRsvpStatus(opts.status)) {
    return { ok: false, error: "Invalid RSVP status", code: 400 };
  }

  await dbConnect();
  const event = await PlatformEvent.findById(opts.eventId);
  if (!event) return { ok: false, error: "Event not found", code: 404 };

  const endsAt = event.endsAt || defaultEndsAt(new Date(event.startsAt));
  const status = deriveEventStatus({
    status: event.status as Parameters<typeof deriveEventStatus>[0]["status"],
    startsAt: new Date(event.startsAt),
    endsAt: new Date(endsAt),
    registrationDeadline: event.registrationDeadline,
  });

  if (status === "cancelled") {
    return { ok: false, error: "Event is cancelled", code: 400 };
  }
  if (status === "completed") {
    return { ok: false, error: "Event has ended", code: 400 };
  }
  if (!canRsvp(status)) {
    return { ok: false, error: "RSVP is closed for this event", code: 400 };
  }

  const existing = await EventRsvp.findOne({
    eventId: event._id,
    userId: opts.userId,
  });

  if (opts.status === "going") {
    const deadline = event.registrationDeadline
      ? new Date(event.registrationDeadline)
      : new Date(event.startsAt);
    if (new Date() > deadline && existing?.status !== "going") {
      return { ok: false, error: "Registration deadline has passed", code: 400 };
    }
    if (event.maxParticipants) {
      const counts = await getRsvpCounts(event._id);
      const alreadyGoing = existing?.status === "going";
      if (!alreadyGoing && counts.going >= event.maxParticipants) {
        return { ok: false, error: "Event is at capacity", code: 409 };
      }
    }
  }

  await EventRsvp.findOneAndUpdate(
    { eventId: event._id, userId: opts.userId },
    {
      $set: { status: opts.status },
      $setOnInsert: { eventId: event._id, userId: opts.userId },
    },
    { upsert: true, returnDocument: "after" }
  );

  // Tournament: keep participant row in sync with going RSVP.
  if (event.eventType === "tournament") {
    const tournament = await Tournament.findOne({ eventId: event._id });
    if (tournament) {
      if (opts.status === "going") {
        await TournamentParticipant.findOneAndUpdate(
          { tournamentId: tournament._id, userId: opts.userId },
          {
            $setOnInsert: {
              tournamentId: tournament._id,
              userId: opts.userId,
              state: "registered",
            },
          },
          { upsert: true }
        );
      } else {
        await TournamentParticipant.deleteOne({
          tournamentId: tournament._id,
          userId: opts.userId,
          state: { $in: ["registered", "checked_in"] },
        });
      }
    }
  }

  const counts = await getRsvpCounts(event._id);
  return { ok: true, status: opts.status, counts };
}
