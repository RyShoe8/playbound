import { describe, it, expect } from "vitest";
import { formatDuration } from "./adminPartyHistory";

describe("formatDuration", () => {
  it("formats sub-minute durations as < 1m", () => {
    expect(formatDuration(0)).toBe("< 1m");
    expect(formatDuration(15_000)).toBe("< 1m");
    expect(formatDuration(59_000)).toBe("< 1m");
  });

  it("formats minute-only durations", () => {
    expect(formatDuration(60_000)).toBe("1m");
    expect(formatDuration(120_000)).toBe("2m");
    expect(formatDuration(45 * 60_000)).toBe("45m");
  });

  it("formats hours and minutes", () => {
    expect(formatDuration(60 * 60_000)).toBe("1h");
    expect(formatDuration(75 * 60_000)).toBe("1h 15m");
    expect(formatDuration(120 * 60_000)).toBe("2h");
    expect(formatDuration(155 * 60_000)).toBe("2h 35m");
  });
});
