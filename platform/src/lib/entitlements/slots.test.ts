import { describe, expect, it } from "vitest";
import {
  canSeatAnother,
  describeCapacity,
  partyCapacity,
  poolSlotsUsed,
  seatsRemaining,
  unusedPlanSlots,
} from "@/lib/entitlements/slots";

/**
 * The rules a shared pool implies, pinned before anything depends on them.
 *
 * The one worked example given: a host on a 4-slot plan, with 7 pool slots
 * free, can seat 11. Everything else here follows from that plus the fact that
 * the pool is shared — so the same host can seat fewer later, through no
 * change of their own.
 */

const HARD_CAP = 20;
const ctx = (over: Partial<Parameters<typeof partyCapacity>[0]> = {}) => ({
  planSlots: 0,
  poolAvailable: 0,
  memberCount: 1,
  hardCap: HARD_CAP,
  ...over,
});

describe("the worked example", () => {
  it("a 4-slot plan with 7 pool slots free seats 11", () => {
    const c = ctx({ planSlots: 4, poolAvailable: 7, memberCount: 1 });
    expect(partyCapacity(c)).toBe(11);
  });

  it("the same host seats 4 when the pool is empty", () => {
    // The point of a shared pool: capacity moves without the host doing
    // anything. Their own plan is the floor.
    const c = ctx({ planSlots: 4, poolAvailable: 0, memberCount: 1 });
    expect(partyCapacity(c)).toBe(4);
  });

  it("a free account with 7 still free seats 8 — themselves plus seven", () => {
    /*
     * poolAvailable is net of this party. A free host is already holding a
     * pool slot, so seven more free means eight in total. The subscriber case
     * differs because their plan covers them and they hold no pool slot.
     */
    expect(partyCapacity(ctx({ planSlots: 0, poolAvailable: 7, memberCount: 1 }))).toBe(8);
  });

  it("a free account seats nobody new when the pool is dry", () => {
    const c = ctx({ planSlots: 0, poolAvailable: 0, memberCount: 1 });
    expect(partyCapacity(c)).toBe(1);
    expect(seatsRemaining(c)).toBe(0);
  });
});

describe("what a party costs the pool", () => {
  it("the plan covers the first members, host included", () => {
    // A 4-slot subscriber hosting four people costs the pool nothing.
    expect(poolSlotsUsed(4, 4)).toBe(0);
    expect(poolSlotsUsed(3, 4)).toBe(0);
  });

  it("the member after the plan runs out is the first on the pool", () => {
    expect(poolSlotsUsed(5, 4)).toBe(1);
    expect(poolSlotsUsed(11, 4)).toBe(7);
  });

  it("a free account draws on the pool from its first member", () => {
    expect(poolSlotsUsed(1, 0)).toBe(1);
    expect(poolSlotsUsed(8, 0)).toBe(8);
  });

  it("unused plan slots are reported, so a host is not charged for them", () => {
    expect(unusedPlanSlots(1, 4)).toBe(3);
    expect(unusedPlanSlots(4, 4)).toBe(0);
    expect(unusedPlanSlots(9, 4)).toBe(0);
  });
});

describe("capacity as the party fills", () => {
  it("plan seats are used before pool seats", () => {
    /*
     * A subscriber's own slots cost nobody anything, so they should be spent
     * first — otherwise a subscriber drains shared capacity while their paid
     * slots sit idle.
     */
    const c = ctx({ planSlots: 4, poolAvailable: 7, memberCount: 3 });
    expect(poolSlotsUsed(3, 4)).toBe(0);
    expect(partyCapacity(c)).toBe(11);
  });

  it("capacity holds steady as the plan fills, then tracks the pool", () => {
    for (const members of [1, 2, 3, 4]) {
      expect(partyCapacity(ctx({ planSlots: 4, poolAvailable: 7, memberCount: members }))).toBe(11);
    }
  });

  it("a party already over its plan still sees the pool's remainder", () => {
    // Six members on a 4-slot plan: two are on the pool already, and three
    // more are free, so eleven is still reachable.
    const c = ctx({ planSlots: 4, poolAvailable: 5, memberCount: 6 });
    expect(partyCapacity(c)).toBe(11);
    expect(seatsRemaining(c)).toBe(5);
  });
});

describe("the hard cap", () => {
  it("no amount of plan or pool exceeds it", () => {
    expect(partyCapacity(ctx({ planSlots: 50, poolAvailable: 50, memberCount: 1 }))).toBe(HARD_CAP);
  });

  it("is reported distinctly from an empty pool", () => {
    /*
     * Two different problems for the reader: one is about everyone else and
     * will pass, the other is about this party and will not.
     */
    const capped = canSeatAnother(ctx({ planSlots: 40, poolAvailable: 40, memberCount: HARD_CAP }));
    expect(capped.ok).toBe(false);
    expect(capped.reason).toMatch(/cap at 20/);

    const drained = canSeatAnother(ctx({ planSlots: 0, poolAvailable: 0, memberCount: 3 }));
    expect(drained.ok).toBe(false);
    expect(drained.reason).toMatch(/free party slots are in use/);
  });
});

describe("seating one more", () => {
  it("allows it from an unused plan slot even with a dry pool", () => {
    expect(canSeatAnother(ctx({ planSlots: 4, poolAvailable: 0, memberCount: 2 })).ok).toBe(true);
  });

  it("allows it from the pool once the plan is spent", () => {
    expect(canSeatAnother(ctx({ planSlots: 4, poolAvailable: 1, memberCount: 4 })).ok).toBe(true);
  });

  it("refuses when plan is spent and pool is dry", () => {
    expect(canSeatAnother(ctx({ planSlots: 4, poolAvailable: 0, memberCount: 4 })).ok).toBe(false);
  });
});

describe("what the party screen is told", () => {
  it("separates the host's own slots from the shared ones", () => {
    const d = describeCapacity(ctx({ planSlots: 4, poolAvailable: 7, memberCount: 2 }));
    expect(d).toMatchObject({
      capacity: 11,
      seatsRemaining: 9,
      fromPlan: 4,
      fromPool: 7,
      poolAvailable: 7,
      atHardCap: false,
    });
  });

  it("a free host sees no plan slots and all pool", () => {
    const d = describeCapacity(ctx({ planSlots: 0, poolAvailable: 6, memberCount: 1 }));
    expect(d.fromPlan).toBe(0);
    // The host's own seat is pool-funded too, so all seven are pool seats.
    expect(d.fromPool).toBe(7);
  });

  it("flags the hard cap so the screen can say why it stops", () => {
    expect(describeCapacity(ctx({ planSlots: 30, poolAvailable: 30, memberCount: 5 })).atHardCap).toBe(true);
  });
});

describe("numbers that should not crash it", () => {
  it("treats missing, negative and fractional figures as zero or floored", () => {
    /*
     * These come from an admin-edited settings document and from live
     * aggregation, so absent and below-zero are both reachable.
     */
    expect(partyCapacity(ctx({ planSlots: -5, poolAvailable: -5, memberCount: 1 }))).toBe(1);
    expect(poolSlotsUsed(-1, -1)).toBe(0);
    expect(
      partyCapacity({
        planSlots: undefined as never,
        poolAvailable: null as never,
        memberCount: 2,
        hardCap: HARD_CAP,
      })
    ).toBe(2);
    expect(partyCapacity(ctx({ planSlots: 4.9, poolAvailable: 7.9, memberCount: 1 }))).toBe(11);
  });

  it("never returns a negative seat count", () => {
    // A party over the cap (cap lowered under a live party) must read zero.
    expect(seatsRemaining(ctx({ memberCount: 30, hardCap: 20 }))).toBe(0);
  });
});
