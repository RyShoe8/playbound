import { describe, expect, it } from "vitest";
import { addCalendarDays } from "./nightlySchedule";
import { eventsInWeeklySchedule } from "./weeklyScheduleWindow";

describe("weekly Game Nights window", () => {
  it("excludes the previous weekend and the next Monday in the configured timezone", () => {
    const week = new Set(Array.from({ length: 7 }, (_, day) => addCalendarDays("2026-11-02", day)));
    const events = [
      { title: "Previous Saturday", startsAt: new Date("2026-11-01T00:00:00Z") },
      { title: "Previous Sunday", startsAt: new Date("2026-11-02T01:00:00Z") },
      { title: "Monday", startsAt: new Date("2026-11-03T01:00:00Z") },
      { title: "This Saturday", startsAt: new Date("2026-11-08T01:00:00Z") },
      { title: "This Sunday", startsAt: new Date("2026-11-09T01:00:00Z") },
      { title: "Next Monday", startsAt: new Date("2026-11-10T01:00:00Z") },
    ];
    expect(eventsInWeeklySchedule(events, week, "America/Chicago").map((event) => event.title))
      .toEqual(["Monday", "This Saturday", "This Sunday"]);
  });
});
