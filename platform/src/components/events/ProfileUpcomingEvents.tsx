import Link from "next/link";
import { Types } from "mongoose";
import dbConnect from "@/lib/db";
import EventRsvp from "@/lib/models/EventRsvp";
import PlatformEvent from "@/lib/models/PlatformEvent";
import { serializeEvent } from "@/lib/events/serialize";
import { PUBLIC_LISTABLE_STATUSES } from "@/lib/events/types";

/** Upcoming events the user RSVP'd going/maybe to (self profile only). */
export async function ProfileUpcomingEvents({ userId }: { userId: string }) {
  if (!Types.ObjectId.isValid(userId)) return null;
  await dbConnect();
  const rsvps = await EventRsvp.find({
    userId,
    status: { $in: ["going", "maybe"] },
  })
    .limit(40)
    .lean();
  if (!rsvps.length) return null;

  const eventIds = rsvps.map((r) => r.eventId);
  const now = new Date();
  const events = await PlatformEvent.find({
    _id: { $in: eventIds },
    status: { $in: PUBLIC_LISTABLE_STATUSES.filter((s) => s !== "completed") },
    startsAt: { $gte: new Date(now.getTime() - 2 * 3600_000) },
  })
    .sort({ startsAt: 1 })
    .limit(6)
    .lean();
  if (!events.length) return null;

  const statusByEvent = new Map(rsvps.map((r) => [String(r.eventId), r.status]));

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-bold tracking-wide text-muted-foreground uppercase">
        Upcoming events
      </h2>
      <ul className="mt-3 space-y-2">
        {events.map((e) => {
          const s = serializeEvent(e);
          return (
            <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
              <div>
                <Link href={`/events/${s.id}`} className="font-semibold hover:underline">
                  {s.title}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {s.when.dateLine} · {statusByEvent.get(s.id)}
                </p>
              </div>
              <Link
                href={`/events/${s.id}`}
                className="text-xs font-bold text-primary hover:underline"
              >
                View
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
