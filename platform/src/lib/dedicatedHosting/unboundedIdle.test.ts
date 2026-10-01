import { describe, expect, it } from "vitest";
import { shouldStopUnboundedIdleServer } from "./reconcile";

const now = new Date("2026-09-30T12:00:00Z");
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

describe("uncapped dedicated server idle stop", () => {
  it("stops an empty OpenRA server only after 30 minutes", () => {
    expect(shouldStopUnboundedIdleServer({ capEnforced: false, players: 0, lastOccupiedAt: null, onlineSince: minutesAgo(29), now })).toBe(false);
    expect(shouldStopUnboundedIdleServer({ capEnforced: false, players: 0, lastOccupiedAt: null, onlineSince: minutesAgo(30), now })).toBe(true);
  });
  it("keeps a recently occupied server online", () => {
    expect(shouldStopUnboundedIdleServer({ capEnforced: false, players: 0, lastOccupiedAt: minutesAgo(5), onlineSince: minutesAgo(60), now })).toBe(false);
  });
  it("never mistakes a failed query for zero players", () => {
    expect(shouldStopUnboundedIdleServer({ capEnforced: false, players: null, lastOccupiedAt: null, onlineSince: minutesAgo(90), now })).toBe(false);
  });
  it("does not idle-stop slot-limited games", () => {
    expect(shouldStopUnboundedIdleServer({ capEnforced: true, players: 0, lastOccupiedAt: null, onlineSince: minutesAgo(90), now })).toBe(false);
  });
});
