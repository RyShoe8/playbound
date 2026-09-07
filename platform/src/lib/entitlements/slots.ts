/**
 * Party slot arithmetic.
 *
 * Two sources of capacity, and they stack:
 *
 *   plan slots  — what a subscriber pays for. Theirs alone, always available,
 *                 never contended.
 *   free pool   — a fixed number of slots PlayBound funds for everyone. Shared
 *                 platform-wide, so how many are left depends on who else is
 *                 playing right now.
 *
 * A host on a 4-slot plan, when 7 pool slots happen to be free, can seat 11.
 * The same host an hour later, with the pool drained, can seat 4. That is the
 * intended behaviour of a shared pool and the reason the party screen has to
 * show what is left rather than a fixed number.
 *
 * Pure functions, no database — the same reason partyRules.ts is pure. The
 * accounting that feeds these lives in the service layer.
 */

/** What a party draws on, at one moment. */
export type SlotContext = {
  /** Slots the host's subscription grants. Zero for a free account. */
  planSlots: number;
  /**
   * Pool slots not currently claimed by anyone, platform-wide.
   *
   * Already net of this party: a free host sitting in their own party is
   * holding a pool slot, and that slot is not counted here. So a free host
   * with seven still free can seat eight — themselves plus seven. A
   * subscriber whose plan covers them holds no pool slot, so their four-slot
   * plan alongside seven free seats eleven.
   */
  poolAvailable: number;
  /** Members already in the party, including the host. */
  memberCount: number;
  /**
   * Cap that applies to parties on no plan.
   *
   * A business limit, not a safety rail — it is how large a party someone can
   * run without paying. A host with any plan slots is not bound by it; they
   * are bound by what they bought plus what the pool has spare.
   */
  freeHardCap: number;
  /**
   * The largest party the schema can store, for anyone.
   *
   * Structural, not policy: Party validates members.length against it, so
   * promising a subscriber more would promise seats that fail to save.
   */
  absoluteCap: number;
};

/**
 * The cap that actually applies to this party.
 *
 * A free host gets the smaller of the admin's free cap and what the schema
 * allows. A subscriber is not subject to the free cap at all — the point of
 * paying — so only the structural ceiling binds them.
 */
export function effectiveCap(ctx: Pick<SlotContext, "planSlots" | "freeHardCap" | "absoluteCap">): number {
  const absolute = safe(ctx.absoluteCap);
  if (safe(ctx.planSlots) > 0) return absolute;
  return Math.min(safe(ctx.freeHardCap), absolute);
}

/**
 * How many of a party's members are drawing on the shared pool.
 *
 * The plan covers the first `planSlots` members, host included. Everyone
 * beyond that is on the pool. A 4-slot subscriber hosting 4 people costs the
 * pool nothing; the fifth member is the first to draw on it.
 */
export function poolSlotsUsed(memberCount: number, planSlots: number): number {
  return Math.max(0, safe(memberCount) - safe(planSlots));
}

/** Plan slots this host has paid for and is not currently using. */
export function unusedPlanSlots(memberCount: number, planSlots: number): number {
  return Math.max(0, safe(planSlots) - safe(memberCount));
}

/**
 * The largest this party can be right now.
 *
 * Current members, plus the plan slots they have not filled, plus whatever the
 * pool has left. Never above the hard cap.
 */
export function partyCapacity(ctx: SlotContext): number {
  const members = safe(ctx.memberCount);
  const headroom = unusedPlanSlots(members, ctx.planSlots) + safe(ctx.poolAvailable);
  return Math.min(members + headroom, effectiveCap(ctx));
}

/** Seats a party could still fill, right now. */
export function seatsRemaining(ctx: SlotContext): number {
  return Math.max(0, partyCapacity(ctx) - safe(ctx.memberCount));
}

/**
 * Whether one more person can join, and why not when they cannot.
 *
 * Distinguishes "the pool is empty" from "this party is at its cap", because
 * they are different problems for the person reading the message: one is
 * temporary and about everyone else, the other is about this party.
 */
export function canSeatAnother(ctx: SlotContext): { ok: boolean; reason?: string } {
  const members = safe(ctx.memberCount);
  const cap = effectiveCap(ctx);
  if (members >= cap) {
    /*
     * Two different dead ends. A free party at its cap can be grown by
     * subscribing; a party at the schema ceiling cannot be grown at all, and
     * saying "subscribe" there would be selling something that does not help.
     */
    return safe(ctx.planSlots) > 0
      ? { ok: false, reason: `Parties cannot exceed ${cap} players` }
      : { ok: false, reason: `Free parties cap at ${cap} players — subscribe for a larger party` };
  }
  if (unusedPlanSlots(members, ctx.planSlots) > 0) return { ok: true };
  if (safe(ctx.poolAvailable) > 0) return { ok: true };
  return {
    ok: false,
    reason: "All free party slots are in use right now — try again shortly, or subscribe for slots of your own",
  };
}

/**
 * What the party screen shows.
 *
 * `poolAvailable` is a live platform number, so it is reported separately from
 * the host's own slots: a host whose party will not grow needs to know whether
 * that is because the pool is empty or because they have hit the cap.
 */
export function describeCapacity(ctx: SlotContext): {
  capacity: number;
  seatsRemaining: number;
  fromPlan: number;
  fromPool: number;
  poolAvailable: number;
  atHardCap: boolean;
  cap: number;
  /** True when the free cap is what stops this party, not the schema. */
  capIsFreeLimit: boolean;
} {
  const members = safe(ctx.memberCount);
  const capacity = partyCapacity(ctx);
  const fromPlan = Math.min(safe(ctx.planSlots), capacity);
  return {
    capacity,
    seatsRemaining: Math.max(0, capacity - members),
    fromPlan,
    fromPool: Math.max(0, capacity - fromPlan),
    poolAvailable: safe(ctx.poolAvailable),
    atHardCap: capacity >= effectiveCap(ctx),
    cap: effectiveCap(ctx),
    capIsFreeLimit: safe(ctx.planSlots) === 0 && safe(ctx.freeHardCap) < safe(ctx.absoluteCap),
  };
}

/**
 * A negative or absent figure is zero, not a crash and not a negative seat.
 *
 * These numbers arrive from a settings document an admin edits and from live
 * aggregation, so "missing" and "somehow below zero" are both reachable.
 */
function safe(n: number | null | undefined): number {
  return Number.isFinite(n) && (n as number) > 0 ? Math.floor(n as number) : 0;
}
