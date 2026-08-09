import { Types } from "mongoose";
import EventRsvp from "@/lib/models/EventRsvp";
import type { RsvpStatus } from "@/lib/events/types";

export type RsvpCounts = {
  going: number;
  maybe: number;
  not_going: number;
};

function emptyCounts(): RsvpCounts {
  return { going: 0, maybe: 0, not_going: 0 };
}

export async function getRsvpCounts(
  eventId: string | Types.ObjectId
): Promise<RsvpCounts> {
  const oid = typeof eventId === "string" ? new Types.ObjectId(eventId) : eventId;
  const agg = await EventRsvp.aggregate<{ _id: RsvpStatus; n: number }>([
    { $match: { eventId: oid } },
    { $group: { _id: "$status", n: { $sum: 1 } } },
  ]);
  const counts = emptyCounts();
  for (const r of agg) {
    if (r._id in counts) counts[r._id] = r.n;
  }
  return counts;
}

export async function getRsvpCountsForEvents(
  eventIds: Types.ObjectId[]
): Promise<Map<string, RsvpCounts>> {
  const map = new Map<string, RsvpCounts>();
  if (!eventIds.length) return map;
  for (const id of eventIds) map.set(String(id), emptyCounts());

  const agg = await EventRsvp.aggregate<{
    _id: { eventId: Types.ObjectId; status: RsvpStatus };
    n: number;
  }>([
    { $match: { eventId: { $in: eventIds } } },
    { $group: { _id: { eventId: "$eventId", status: "$status" }, n: { $sum: 1 } } },
  ]);
  for (const r of agg) {
    const key = String(r._id.eventId);
    const entry = map.get(key) || emptyCounts();
    if (r._id.status in entry) entry[r._id.status] = r.n;
    map.set(key, entry);
  }
  return map;
}
