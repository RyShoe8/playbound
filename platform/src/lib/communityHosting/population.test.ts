import { describe, expect, it } from "vitest";
import { populationReading } from "./population";

describe("community population reading", () => {
  const now = new Date("2026-09-25T12:00:00Z");
  it("sums fresh live counts, including a true zero", () => {
    expect(populationReading([
      { playerCount: 2, playerCountCheckedAt: now },
      { playerCount: 0, playerCountCheckedAt: now },
    ], now)).toBe(2);
    expect(populationReading([], now)).toBe(0);
  });
  it("never treats an unqueried or stale server as empty", () => {
    expect(populationReading([{ playerCount: null, playerCountCheckedAt: null }], now)).toBeNull();
    expect(populationReading([{ playerCount: 0, playerCountCheckedAt: new Date("2026-09-25T11:57:00Z") }], now)).toBeNull();
  });
});
