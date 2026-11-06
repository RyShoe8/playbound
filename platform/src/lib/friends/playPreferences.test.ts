import { expect, it } from "vitest";
import { acceptsGame, defaultPlayPreferences, nextPlayTime } from "./playPreferences";
import { emptyAvailability } from "./availability";

it("includes a short play window entirely between the time picker's quarter hours", () => {
  const now = Date.parse("2026-11-06T23:00:00Z");
  const start = now + 5 * 60000;
  const availability = { ...emptyAvailability(), window: { startsAt: new Date(start).toISOString(), endsAt: new Date(start + 60000).toISOString() } };
  expect(nextPlayTime(availability, now, now + 6 * 3600000)).toBe(start);
  expect(nextPlayTime(availability, now, now + 60000)).toBeUndefined();
});

it("matches selected genres and exact catalog games", () => {
  const game = { slug: "openra", title: "OpenRA", free: true, genres: ["Strategy"] };
  expect(acceptsGame({ ...defaultPlayPreferences, mode: "genres", genres: ["Strategy"] }, game)).toBe(true);
  expect(acceptsGame({ ...defaultPlayPreferences, mode: "games", games: ["openhv"] }, game)).toBe(false);
});
