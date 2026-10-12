import { expect, it } from "vitest";
import { availableAt, commonAvailability, emptyAvailability } from "./availability";
import { availabilitySchema } from "./availabilitySchema";
import { serializeAvailability } from "./availabilityService";
it("expires one-time availability at its end", () => {
  const person = { ...emptyAvailability(), window: { startsAt: "2026-10-12T18:00:00Z", endsAt: "2026-10-12T20:00:00Z" } };
  expect(availableAt(person, Date.parse("2026-10-12T19:00:00Z"))).toBe(true);
  expect(availableAt(person, Date.parse("2026-10-12T20:00:00Z"))).toBe(false);
  expect(serializeAvailability({ ...person, window: { startsAt: new Date(person.window.startsAt), endsAt: new Date(person.window.endsAt) } }, Date.parse("2026-10-12T20:00:00Z")).window).toBe(null);
});
it("finds overlap across timezones and rejects short windows", () => {
  const chicago = { ...emptyAvailability("America/Chicago"), weekly: [{ day: 1, startMinute: 19 * 60, endMinute: 21 * 60 }] };
  const london = { ...emptyAvailability("Europe/London"), weekly: [{ day: 2, startMinute: 60, endMinute: 150 }] };
  const now = Date.parse("2026-10-12T12:00:00Z");
  expect(commonAvailability([chicago, london], now, 60)[0]).toEqual({ startsAt: "2026-10-13T00:00:00.000Z", endsAt: "2026-10-13T01:30:00.000Z" });
  expect(commonAvailability([chicago, london], now, 120)).toEqual([]);
  expect(commonAvailability([chicago, emptyAvailability()], now)).toEqual([]);
});
it("handles the repeated hour at daylight-saving fall-back", () => {
  const chicago = { ...emptyAvailability("America/Chicago"), weekly: [{ day: 0, startMinute: 60, endMinute: 120 }] };
  expect(commonAvailability([chicago], Date.parse("2026-11-01T00:00:00Z"), 120)[0]).toEqual({ startsAt: "2026-11-01T06:00:00.000Z", endsAt: "2026-11-01T08:00:00.000Z" });
});
it("does not invent the skipped hour at daylight-saving spring-forward", () => {
  const chicago = { ...emptyAvailability("America/Chicago"), weekly: [{ day: 0, startMinute: 120, endMinute: 180 }] };
  expect(commonAvailability([chicago], Date.parse("2026-03-08T00:00:00Z"))).toEqual([]);
});
it("validates timezone, duration, weekly limits and reversed windows", () => {
  expect(availabilitySchema.safeParse(emptyAvailability("made/up")).success).toBe(false);
  expect(availabilitySchema.safeParse({ ...emptyAvailability(), weekly: [{ day: 1, startMinute: 100, endMinute: 99 }] }).success).toBe(false);
  expect(availabilitySchema.safeParse({ ...emptyAvailability(), window: { startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 25 * 3600_000).toISOString() } }).success).toBe(false);
});
it("preserves overlaps that start between quarter-hour boundaries", () => {
  const person = { ...emptyAvailability(), window: { startsAt: "2026-10-12T18:07:00Z", endsAt: "2026-10-12T19:07:00Z" } };
  expect(commonAvailability([person], Date.parse("2026-10-12T18:00:00Z"), 60)[0]).toEqual({ startsAt: "2026-10-12T18:07:00.000Z", endsAt: "2026-10-12T19:07:00.000Z" });
});
