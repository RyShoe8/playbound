import dbConnect from "@/lib/db";
import PlatformEvent from "@/lib/models/PlatformEvent";
import EventRsvp from "@/lib/models/EventRsvp";
import { deriveEventStatus } from "@/lib/events/types";
import { defaultEndsAt } from "@/lib/events/time";
import { syncEventAttendance } from "@/lib/events/attendance";
import { createEventReminderNotification } from "@/lib/events/notifications";
import {
  cleanupEventDiscordVoice,
  provisionEventDiscordVoice,
} from "@/lib/events/discordEventProvision";
import { channelCleanupDue } from "@/lib/events/channelLifecycle";

/**
 * Status transitions, reminders, attendance sync, Discord voice lifecycle.
 */
export async function runEventsCron(now = new Date()): Promise<{
  statusUpdates: number;
  reminders: number;
  attendanceSynced: number;
  discordActions: number;
}> {
  await dbConnect();
  const events = await PlatformEvent.find({
    status: {
      $in: [
        "published",
        "registration_open",
        "registration_closed",
        "live",
      ],
    },
  }).limit(200);

  let statusUpdates = 0;
  let reminders = 0;
  let attendanceSynced = 0;
  let discordActions = 0;

  for (const event of events) {
    if (event.status === "cancelled") continue;

    const startsAt = new Date(event.startsAt);
    const endsAt = event.endsAt ? new Date(event.endsAt) : defaultEndsAt(startsAt);
    const next = deriveEventStatus({
      status: event.status as Parameters<typeof deriveEventStatus>[0]["status"],
      startsAt,
      endsAt,
      registrationDeadline: event.registrationDeadline,
      now,
    });

    if (next !== event.status) {
      const prev = event.status;
      event.status = next;
      if (next !== "draft" && !event.publishedAt) event.publishedAt = now;
      await event.save();
      statusUpdates++;

      // Provision voice when going live (or registering open for early gather).
      if (
        (next === "live" || next === "registration_open") &&
        !event.discordVoiceChannelId &&
        !event.discordVoiceCleanedAt
      ) {
        const ok = await provisionEventDiscordVoice(event);
        if (ok) discordActions++;
      }
      // Cleanup is not done here. It is a state predicate swept below, so a
      // Discord outage on this exact tick does not orphan the channel forever.
      void prev;
    }

    if (next === "live") {
      await syncEventAttendance(String(event._id));
      attendanceSynced++;
      if (!event.discordVoiceChannelId && !event.discordVoiceCleanedAt) {
        const ok = await provisionEventDiscordVoice(event);
        if (ok) discordActions++;
      }
    }

    // Reminders for going RSVPs
    const msToStart = startsAt.getTime() - now.getTime();
    const remindersSent = event.remindersSent || { h24: false, h1: false, start: false };

    async function notifyGoing(kind: "h24" | "h1" | "start") {
      const going = await EventRsvp.find({
        eventId: event._id,
        status: "going",
      })
        .select({ userId: 1 })
        .lean();
      await Promise.all(
        going.map((r) =>
          createEventReminderNotification({
            userId: String(r.userId),
            eventId: String(event._id),
            eventTitle: event.title,
            kind,
          })
        )
      );
      reminders += going.length;
    }

    if (!remindersSent.h24 && msToStart > 0 && msToStart <= 24 * 3600_000 + 60_000) {
      await notifyGoing("h24");
      event.set("remindersSent.h24", true);
      await event.save();
    }
    if (!remindersSent.h1 && msToStart > 0 && msToStart <= 3600_000 + 60_000) {
      await notifyGoing("h1");
      event.set("remindersSent.h1", true);
      await event.save();
    }
    if (
      !remindersSent.start &&
      msToStart <= 60_000 &&
      now.getTime() <= endsAt.getTime()
    ) {
      await notifyGoing("start");
      event.set("remindersSent.start", true);
      await event.save();
    }
  }

  discordActions += await cleanupDueEventChannels(now);

  return { statusUpdates, reminders, attendanceSynced, discordActions };
}

/**
 * Remove the Discord channels of events that are over.
 *
 * Queried by channel state rather than by event status: the set of events
 * holding an un-cleaned channel is naturally small and self-emptying, whereas
 * filtering on `completed` would grow without bound and eventually crowd out
 * live events under the main loop's limit.
 *
 * Every tick re-evaluates, so a cleanup that fails because the bot is down is
 * simply retried on the next run instead of being lost.
 */
export async function cleanupDueEventChannels(now = new Date()): Promise<number> {
  await dbConnect();

  const pending = await PlatformEvent.find({
    discordVoiceCleanedAt: null,
    $or: [
      { discordVoiceChannelId: { $nin: [null, ""] } },
      { discordTextChannelId: { $nin: [null, ""] } },
    ],
  }).limit(200);

  let cleaned = 0;
  for (const event of pending) {
    if (!channelCleanupDue(event, now)) continue;
    if (await cleanupEventDiscordVoice(event)) cleaned++;
  }
  return cleaned;
}
