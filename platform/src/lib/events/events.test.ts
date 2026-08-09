import { describe, expect, it } from "vitest";
import { deriveEventStatus, canRsvp } from "@/lib/events/types";
import { defaultEndsAt, formatEventWhen } from "@/lib/events/time";

describe("deriveEventStatus", () => {
  const startsAt = new Date("2026-08-14T20:00:00.000Z");
  const endsAt = new Date("2026-08-14T22:00:00.000Z");

  it("keeps cancelled sticky", () => {
    expect(
      deriveEventStatus({
        status: "cancelled",
        startsAt,
        endsAt,
        now: new Date("2026-08-14T21:00:00.000Z"),
      })
    ).toBe("cancelled");
  });

  it("opens registration before start", () => {
    expect(
      deriveEventStatus({
        status: "published",
        startsAt,
        endsAt,
        now: new Date("2026-08-14T10:00:00.000Z"),
      })
    ).toBe("registration_open");
  });

  it("goes live after start", () => {
    expect(
      deriveEventStatus({
        status: "registration_open",
        startsAt,
        endsAt,
        now: new Date("2026-08-14T20:30:00.000Z"),
      })
    ).toBe("live");
  });

  it("completes after end", () => {
    expect(
      deriveEventStatus({
        status: "live",
        startsAt,
        endsAt,
        now: new Date("2026-08-14T23:00:00.000Z"),
      })
    ).toBe("completed");
  });
});

describe("canRsvp", () => {
  it("blocks cancelled", () => {
    expect(canRsvp("cancelled")).toBe(false);
  });
  it("allows live", () => {
    expect(canRsvp("live")).toBe(true);
  });
});

describe("formatEventWhen", () => {
  it("returns date and time lines", () => {
    const { dateLine, timeLine } = formatEventWhen(
      new Date("2026-08-14T20:00:00.000Z"),
      { timezone: "UTC", locale: "en-US" }
    );
    expect(dateLine).toMatch(/August/);
    expect(timeLine.length).toBeGreaterThan(3);
  });

  it("defaultEndsAt is +2h", () => {
    const s = new Date("2026-01-01T00:00:00.000Z");
    expect(defaultEndsAt(s).toISOString()).toBe("2026-01-01T02:00:00.000Z");
  });
});
