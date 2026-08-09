import dbConnect from "@/lib/db";
import Presence from "@/lib/models/Presence";
import EventRsvp from "@/lib/models/EventRsvp";
import type { Types } from "mongoose";

const ONLINE_STATUSES = new Set([
  "online",
  "browsing",
  "viewing_game",
  "installing",
  "launching",
  "playing",
  "away",
]);

export async function getEventPresenceAggregates(opts: {
  eventId: string | Types.ObjectId;
  gameSlug?: string | null;
}): Promise<{ online: number; playing: number }> {
  await dbConnect();
  const going = await EventRsvp.find({
    eventId: opts.eventId,
    status: "going",
  })
    .select({ userId: 1 })
    .lean();
  if (!going.length) return { online: 0, playing: 0 };

  const userIds = going.map((r) => r.userId);
  const presences = await Presence.find({
    userId: { $in: userIds },
    status: { $in: [...ONLINE_STATUSES] },
  }).lean();

  let online = 0;
  let playing = 0;
  for (const p of presences) {
    online++;
    if (p.status === "playing") {
      if (
        !opts.gameSlug ||
        !p.currentGameId ||
        p.currentGameId === opts.gameSlug
      ) {
        playing++;
      }
    }
  }
  return { online, playing };
}
