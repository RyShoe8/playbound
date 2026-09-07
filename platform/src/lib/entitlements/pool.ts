import dbConnect from "@/lib/db";
import Party from "@/lib/models/Party";
import PlatformLimits from "@/lib/models/PlatformLimits";
import { poolSlotsUsed } from "@/lib/entitlements/slots";
import { PARTY_STRUCTURAL_MAX } from "@/lib/playTogether/types";


/**
 * How much of the shared party pool is spoken for right now.
 *
 * Counted from live parties rather than kept as a running total. A counter is
 * exact until something dies without decrementing it — a crashed process, a
 * party that ends by timeout, a member removed by a path that forgot — and
 * then it drifts upward forever and the pool silently shrinks. Recomputing
 * cannot drift: whatever the parties say is true by definition.
 *
 * The cost is an aggregate per read, so callers that need it repeatedly should
 * hold the result for the length of one request rather than asking again.
 */

/** Statuses that hold slots. An ended party has released everything. */
const LIVE_STATUSES = ["forming", "ready", "launching", "playing"] as const;

export type PoolStatus = {
  /** Total free seats the platform funds. */
  pool: number;
  /** Seats held by live parties right now. */
  inUse: number;
  /** Seats anyone could still claim. */
  available: number;
  /** The largest a party can get without a subscription. */
  maxFreePartySize: number;
};

/** The limits document, created with its defaults on first read. */
export async function getPlatformLimits() {
  await dbConnect();
  const doc = await PlatformLimits.findOneAndUpdate(
    { singletonKey: "default" },
    { $setOnInsert: { singletonKey: "default" } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  const limits = doc as unknown as {
    freePartySlotPool?: number;
    maxFreePartySize?: number;
    /* Earlier names for the free cap, read so a live document is not lost. */
    freePartyHardCap?: number;
    partyHardCap?: number;
  };
  /*
   * Defaults applied on read rather than trusted from the schema, so a
   * document written before a field existed still answers sensibly instead of
   * returning undefined into the arithmetic.
   */
  return {
    freePartySlotPool: limits.freePartySlotPool ?? 200,
    maxFreePartySize:
      limits.maxFreePartySize ?? limits.freePartyHardCap ?? limits.partyHardCap ?? 8,
  };
}

/**
 * Plan slots a user's subscription grants.
 *
 * Zero for everyone until subscriptions exist — this is the seam tiers plug
 * into, kept here so every caller already asks the right question and none of
 * them need changing when the answer starts varying.
 */
export async function planSlotsForUser(_userId: string | null | undefined): Promise<number> {
  return 0;
}

/**
 * Pool usage across every live party.
 *
 * A party costs the pool whatever its plan does not cover, which is why the
 * host's plan size is part of the sum rather than a flat member count. With no
 * subscriptions yet every host is on zero, so today this is simply the number
 * of people in parties — but the shape is already right for when it is not.
 */
export async function getPoolStatus(): Promise<PoolStatus> {
  const limits = await getPlatformLimits();
  // Zero is how free parties are turned off; no separate switch for it.
  const pool = limits.freePartySlotPool;

  const live = await Party.find(
    { status: { $in: LIVE_STATUSES } },
    { members: 1, leaderId: 1 }
  ).lean();

  let inUse = 0;
  for (const party of live as Array<{ members?: unknown[]; leaderId?: string }>) {
    const memberCount = Array.isArray(party.members) ? party.members.length : 0;
    const planSlots = await planSlotsForUser(party.leaderId);
    inUse += poolSlotsUsed(memberCount, planSlots);
  }

  return {
    pool,
    inUse,
    available: Math.max(0, pool - inUse),
    maxFreePartySize: limits.maxFreePartySize,
  };
}

/**
 * Everything one party needs to know about its own capacity.
 *
 * `poolAvailable` is reported net of this party's own claim, which is the
 * contract SlotContext documents: the members already seated are counted in
 * memberCount, so counting their slots as available too would seat them twice.
 */
export async function getPartySlotContext(opts: {
  leaderId: string | null | undefined;
  memberCount: number;
}) {
  const [status, planSlots] = await Promise.all([
    getPoolStatus(),
    planSlotsForUser(opts.leaderId),
  ]);
  return {
    planSlots,
    poolAvailable: status.available,
    memberCount: opts.memberCount,
    freeHardCap: status.maxFreePartySize,
    /*
     * Subscribers are bounded by what they bought plus the pool, not by an
     * admin number — the structural guard is only there to stop a runaway.
     */
    absoluteCap: PARTY_STRUCTURAL_MAX,
    pool: status,
  };
}
