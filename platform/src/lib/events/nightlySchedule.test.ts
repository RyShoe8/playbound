import { describe, expect, it } from "vitest";
import { addCalendarDays, chooseNightlyGame, instantForLocal, nightlyInstant, normalizeNightly } from "./nightlySchedule";

describe("nightly schedule", () => {
  it("uses local calendar days across DST instead of adding 24 hours", () => {
    expect(addCalendarDays("2026-03-07", 1)).toBe("2026-03-08");
    expect(instantForLocal("2026-03-07", "19:00", "America/Chicago")?.toISOString()).toBe("2026-03-08T01:00:00.000Z");
    expect(instantForLocal("2026-03-08", "19:00", "America/Chicago")?.toISOString()).toBe("2026-03-09T00:00:00.000Z");
  });

  it("does not invent a time in a DST gap and takes the first repeated hour", () => {
    expect(instantForLocal("2026-03-08", "02:30", "America/Chicago")).toBeNull();
    expect(nightlyInstant("2026-03-08", "02:30", "America/Chicago")?.toISOString()).toBe("2026-03-08T08:00:00.000Z");
    expect(instantForLocal("2026-11-01", "01:30", "America/Chicago")?.toISOString()).toBe("2026-11-01T06:30:00.000Z");
  });

  it("keeps eligibility independent of whether the game has a VPS recipe", () => {
    const selected = chooseNightlyGame("2026-09-24", [
      { slug: "peer-to-peer-game", enabled: true, weight: 1, minimumDaysBetweenEvents: 5 },
    ], []);
    expect(selected?.slug).toBe("peer-to-peer-game");
  });

  it("respects minimum separation and rejects duplicate entries", () => {
    const game = { slug: "openra", enabled: true, weight: 1, minimumDaysBetweenEvents: 5 };
    expect(chooseNightlyGame("2026-09-24", [game], [{ slug: "openra", day: "2026-09-22" }])).toBeNull();
    expect(() => normalizeNightly({ enabled: true, timezone: "America/Chicago", localTime: "19:00", durationHours: 2, horizonDays: 7, warmupHours: 4, graceHours: 1, weeklyNotification: { enabled: false, weekday: 1, localTime: "10:00" }, games: [game, game] })).toThrow(/duplicate/);
    expect(() => normalizeNightly({ enabled: true, timezone: "America/Chicago", localTime: "19:00", durationHours: 2, horizonDays: 7, warmupHours: 4, graceHours: 1, weeklyNotification: { enabled: false, weekday: 1, localTime: "10:00" }, games: [game] })).toThrow(/cannot fill every evening/);
  });
});
