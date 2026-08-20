import dbConnect from "@/lib/db";
import Notification from "@/lib/models/Notification";
import EventRsvp from "@/lib/models/EventRsvp";

export async function createEventRsvpNotification(opts: {
  userId: string;
  eventId: string;
  eventTitle: string;
  status: "going" | "maybe";
}): Promise<void> {
  try {
    await dbConnect();
    const going = opts.status === "going";
    await Notification.create({
      userId: opts.userId,
      type: "event_rsvp_confirmed",
      title: going
        ? `You're going to ${opts.eventTitle}`
        : `Maybe: ${opts.eventTitle}`,
      body: going
        ? "We'll remind you before it starts."
        : "You can change your RSVP anytime.",
      href: `/events/${opts.eventId}`,
      meta: { eventId: opts.eventId, rsvpStatus: opts.status },
    });
  } catch (err) {
    console.error("createEventRsvpNotification failed:", err);
  }
}

export async function createEventReminderNotification(opts: {
  userId: string;
  eventId: string;
  eventTitle: string;
  kind: "h24" | "h1" | "start";
}): Promise<void> {
  try {
    await dbConnect();
    const copy =
      opts.kind === "start"
        ? {
            type: "event_starting" as const,
            title: `${opts.eventTitle} is starting now`,
            body: "Jump in and play with the group.",
          }
        : {
            type: "event_reminder" as const,
            title:
              opts.kind === "h24"
                ? `${opts.eventTitle} is tomorrow`
                : `${opts.eventTitle} starts in 1 hour`,
            body: "Open the event to join Discord or play.",
          };
    await Notification.create({
      userId: opts.userId,
      type: copy.type,
      title: copy.title,
      body: copy.body,
      href: `/events/${opts.eventId}`,
      meta: { eventId: opts.eventId, kind: opts.kind },
    });
  } catch (err) {
    console.error("createEventReminderNotification failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Bulk notifications for event lifecycle changes
// ---------------------------------------------------------------------------

/**
 * Fetch user IDs with a given RSVP status for an event.
 * Defaults to "going" if statuses are not specified.
 */
async function getEventRsvpUserIds(
  eventId: string,
  statuses: string[] = ["going"]
): Promise<string[]> {
  await dbConnect();
  const rsvps = await EventRsvp.find({
    eventId,
    status: { $in: statuses },
  })
    .select({ userId: 1 })
    .lean();
  return rsvps.map((r) => String(r.userId));
}

/** Notify going + maybe RSVPs that the event has been cancelled. */
export async function notifyEventCancelled(opts: {
  eventId: string;
  eventTitle: string;
}): Promise<void> {
  try {
    const userIds = await getEventRsvpUserIds(opts.eventId, ["going", "maybe"]);
    if (!userIds.length) return;
    await dbConnect();
    await Notification.insertMany(
      userIds.map((userId) => ({
        userId,
        type: "event_cancelled",
        title: `${opts.eventTitle} has been cancelled`,
        body: "The organizer cancelled this event.",
        href: `/events/${opts.eventId}`,
        meta: { eventId: opts.eventId },
      }))
    );
  } catch (err) {
    console.error("notifyEventCancelled failed:", err);
  }
}

/** Notify going RSVPs that the event time changed. */
export async function notifyEventTimeChanged(opts: {
  eventId: string;
  eventTitle: string;
}): Promise<void> {
  try {
    const userIds = await getEventRsvpUserIds(opts.eventId);
    if (!userIds.length) return;
    await dbConnect();
    await Notification.insertMany(
      userIds.map((userId) => ({
        userId,
        type: "event_updated",
        title: `${opts.eventTitle} has been rescheduled`,
        body: "Check the event page for the new time.",
        href: `/events/${opts.eventId}`,
        meta: { eventId: opts.eventId, change: "time" },
      }))
    );
  } catch (err) {
    console.error("notifyEventTimeChanged failed:", err);
  }
}

/** Notify going RSVPs of a generic event update (title, game, etc.). */
export async function notifyEventUpdated(opts: {
  eventId: string;
  eventTitle: string;
  change: string;
}): Promise<void> {
  try {
    const userIds = await getEventRsvpUserIds(opts.eventId);
    if (!userIds.length) return;
    await dbConnect();
    await Notification.insertMany(
      userIds.map((userId) => ({
        userId,
        type: "event_updated",
        title: `${opts.eventTitle} was updated`,
        body: `The ${opts.change} changed. Check the event page for details.`,
        href: `/events/${opts.eventId}`,
        meta: { eventId: opts.eventId, change: opts.change },
      }))
    );
  } catch (err) {
    console.error("notifyEventUpdated failed:", err);
  }
}

