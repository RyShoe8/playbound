import dbConnect from "@/lib/db";
import Notification from "@/lib/models/Notification";

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
