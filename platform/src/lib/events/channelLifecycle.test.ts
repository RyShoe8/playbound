import { describe, it, expect } from "vitest";
import {
  channelCleanupDue,
  channelExpiresAt,
  channelProvisionDue,
  EVENT_CHANNEL_JOIN_EARLY_MS,
  EVENT_CHANNEL_GRACE_MS,
} from "./channelLifecycle";

/**
 * The rule that decides when an event's Discord channels are removed.
 *
 * Written as a predicate over current state rather than a reaction to a status
 * change, because the reaction form is what leaked channels: it fired on one
 * tick only, and a bot outage on that tick orphaned the channel for good.
 * The tests below fix that property in place.
 */

const HOUR = 3600_000;
const start = new Date("2026-08-18T18:00:00Z");
const end = new Date("2026-08-18T20:00:00Z");

const live = {
  status: "live",
  startsAt: start,
  endsAt: end,
  discordVoiceChannelId: "v1",
  discordTextChannelId: "t1",
  discordVoiceCleanedAt: null,
};

const at = (ms: number) => new Date(end.getTime() + ms);

describe("join window", () => {
  it("opens event voice 15 minutes before the start", () => {
    expect(
      channelProvisionDue(live, new Date(start.getTime() - EVENT_CHANNEL_JOIN_EARLY_MS - 1))
    ).toBe(false);
    expect(
      channelProvisionDue(live, new Date(start.getTime() - EVENT_CHANNEL_JOIN_EARLY_MS))
    ).toBe(true);
    expect(channelProvisionDue(live, start)).toBe(true);
  });

  it("does not open rooms for inactive events", () => {
    expect(channelProvisionDue({ ...live, status: "draft" }, start)).toBe(false);
    expect(channelProvisionDue({ ...live, status: "cancelled" }, start)).toBe(false);
    expect(channelProvisionDue({ ...live, status: "completed" }, start)).toBe(false);
  });
});

describe("grace window", () => {
  it("keeps the channel while the event is still running", () => {
    expect(channelCleanupDue(live, new Date(end.getTime() - HOUR))).toBe(false);
  });

  it("keeps the channel at the moment the event ends", () => {
    // People are still talking; cutting voice on the dot drops them.
    expect(channelCleanupDue(live, end)).toBe(false);
  });

  it("keeps the channel 29 minutes after the end", () => {
    expect(channelCleanupDue(live, at(29 * 60_000))).toBe(false);
  });

  it("removes the channel 30 minutes after the end", () => {
    expect(channelCleanupDue(live, at(EVENT_CHANNEL_GRACE_MS))).toBe(true);
  });

  it("still removes it long afterwards", () => {
    // The predicate must stay true, or a missed tick becomes permanent.
    expect(channelCleanupDue(live, at(72 * HOUR))).toBe(true);
  });

  it("falls back to the default 2-hour duration when no end is set", () => {
    const noEnd = { ...live, endsAt: null };
    expect(channelExpiresAt(noEnd).getTime()).toBe(
      start.getTime() + 2 * HOUR + EVENT_CHANNEL_GRACE_MS
    );
    expect(channelCleanupDue(noEnd, at(-HOUR))).toBe(false);
    expect(channelCleanupDue(noEnd, at(HOUR))).toBe(true);
  });
});

describe("cancelled events", () => {
  it("removes the channel immediately rather than waiting out the schedule", () => {
    // An event cancelled a week early must not hold a channel for a week.
    const cancelled = { ...live, status: "cancelled" };
    expect(channelCleanupDue(cancelled, new Date(start.getTime() - 7 * 24 * HOUR))).toBe(
      true
    );
  });
});

describe("nothing to do", () => {
  it("does not act on an event that never had a channel", () => {
    expect(
      channelCleanupDue(
        { ...live, discordVoiceChannelId: null, discordTextChannelId: null },
        at(HOUR)
      )
    ).toBe(false);
  });

  it("does not act twice once cleaned", () => {
    expect(
      channelCleanupDue({ ...live, discordVoiceCleanedAt: new Date() }, at(HOUR))
    ).toBe(false);
  });

  it("still acts when only a text channel exists", () => {
    expect(
      channelCleanupDue({ ...live, discordVoiceChannelId: null }, at(HOUR))
    ).toBe(true);
  });

  it("reads string dates the same as Date objects", () => {
    // Lean documents hand back strings; the rule must not silently differ.
    const asStrings = {
      ...live,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
    };
    expect(channelCleanupDue(asStrings, at(29 * 60_000))).toBe(false);
    expect(channelCleanupDue(asStrings, at(31 * 60_000))).toBe(true);
  });
});
