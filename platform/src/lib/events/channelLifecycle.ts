/**
 * When an event's Discord channels stop existing.
 *
 * Pulled out of the cron because the rule was previously implicit in *where*
 * the cleanup call sat, and that placement was the bug: cleanup lived inside
 * the status-transition branch, so it ran on exactly one tick. If the bot was
 * unreachable on that tick the channel was orphaned permanently — the event
 * was already `completed`, so the transition never fired again, and the cron's
 * query excluded completed events from being looked at at all.
 *
 * Expressing it as a predicate over current state instead means every tick
 * re-asks the question, and a failed cleanup is retried until it succeeds.
 */

import { defaultEndsAt } from "@/lib/events/time";

/**
 * How long a channel outlives its event.
 *
 * Events run over and people keep talking afterwards; cutting voice at the
 * scheduled end time would drop players mid-conversation.
 */
export const EVENT_CHANNEL_GRACE_MS = 30 * 60_000;

export interface ChannelLifecycleInput {
  status: string;
  startsAt: Date | string;
  endsAt?: Date | string | null;
  discordVoiceChannelId?: string | null;
  discordTextChannelId?: string | null;
  discordVoiceCleanedAt?: Date | string | null;
}

/** The moment an event's channels become removable. */
export function channelExpiresAt(input: ChannelLifecycleInput): Date {
  const startsAt = new Date(input.startsAt);
  const endsAt = input.endsAt ? new Date(input.endsAt) : defaultEndsAt(startsAt);
  return new Date(endsAt.getTime() + EVENT_CHANNEL_GRACE_MS);
}

export function hasChannel(input: ChannelLifecycleInput): boolean {
  return Boolean(input.discordVoiceChannelId || input.discordTextChannelId);
}

/**
 * Should this event's channels be removed now?
 *
 * Deliberately independent of whether the status *changed* this tick, so the
 * answer stays true until the cleanup actually lands.
 */
export function channelCleanupDue(input: ChannelLifecycleInput, now: Date): boolean {
  if (!hasChannel(input)) return false;
  if (input.discordVoiceCleanedAt) return false;

  /*
   * A cancelled event is not going to happen, so its channel has no future to
   * wait for. Applying the grace window to its end time would keep the channel
   * alive until an event that was called off would have finished — a week, for
   * something cancelled a week early.
   */
  if (input.status === "cancelled") return true;

  return now.getTime() >= channelExpiresAt(input).getTime();
}
