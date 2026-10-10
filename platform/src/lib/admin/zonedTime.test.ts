import { describe, expect, it } from "vitest";
import {
  normalizeTimeZone,
  zonedDateEndExclusive,
  zonedDateStart,
  zonedDaysAgo,
  zonedStartOfToday,
} from "./zonedTime";

describe("zonedTime", () => {
  it("falls back to UTC for bad zones", () => {
    expect(normalizeTimeZone("Not/AZone")).toBe("UTC");
    expect(normalizeTimeZone(undefined)).toBe("UTC");
    expect(normalizeTimeZone("America/Chicago")).toBe("America/Chicago");
  });

  it("starts a day at local midnight", () => {
    // Chicago is UTC-5 in October (CDT).
    expect(zonedDateStart("2026-10-09", "America/Chicago")?.toISOString()).toBe("2026-10-09T05:00:00.000Z");
    expect(zonedDateStart("2026-10-09", "UTC")?.toISOString()).toBe("2026-10-09T00:00:00.000Z");
    expect(zonedDateStart("2026-10-09", "Asia/Tokyo")?.toISOString()).toBe("2026-10-08T15:00:00.000Z");
  });

  it("makes the end date inclusive by returning the next midnight", () => {
    expect(zonedDateEndExclusive("2026-10-09", "America/Chicago")?.toISOString()).toBe("2026-10-10T05:00:00.000Z");
  });

  it("handles a DST change inside the day", () => {
    // US clocks go back on 1 Nov 2026: that Chicago day is 25 hours long.
    const start = zonedDateStart("2026-11-01", "America/Chicago")!;
    const end = zonedDateEndExclusive("2026-11-01", "America/Chicago")!;
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(25);
  });

  it("rejects non-dates", () => {
    expect(zonedDateStart("2026-13-40", "UTC")).toBeNull();
    expect(zonedDateStart("yesterday", "UTC")).toBeNull();
  });

  it("finds today's and earlier starts in the viewer's zone", () => {
    const now = new Date("2026-10-10T02:30:00.000Z"); // still Oct 9 in Chicago
    expect(zonedStartOfToday(now, "America/Chicago").toISOString()).toBe("2026-10-09T05:00:00.000Z");
    expect(zonedDaysAgo(7, now, "America/Chicago").toISOString()).toBe("2026-10-02T05:00:00.000Z");
    expect(zonedStartOfToday(now, "UTC").toISOString()).toBe("2026-10-10T00:00:00.000Z");
  });
});
