import dbConnect from "@/lib/db";
import CommunityServer from "@/lib/models/CommunityServer";
import DedicatedCapacityReservation from "@/lib/models/DedicatedCapacityReservation";
import DedicatedSubscription from "@/lib/models/DedicatedSubscription";
import { unitEnvelope } from "./capacity";
import { getTier } from "./tier";

/** Backfills old manual grants and repairs mirrors after interrupted writes.
 * Inventory derives from subscriptions, so a missing mirror never frees slots.
 */
export async function reconcileDedicatedCapacityReservations(now = new Date()): Promise<number> {
  await dbConnect();
  const subs = await DedicatedSubscription.find({}).select({ _id: 1, userId: 1, tier: 1, regionKey: 1, slotCapacity: 1, status: 1 }).lean();
  if (!subs.length) return 0;
  const tier = await getTier();
  const ids = subs.map((s) => s._id);
  const existing = await DedicatedCapacityReservation.find({ subscriptionId: { $in: ids } }).lean();
  const bySubId = new Map(existing.map((r) => [String(r.subscriptionId), r]));
  const activeRooms = await CommunityServer.find({
    ownerType: "user", dedicatedSubscriptionId: { $in: ids },
    $or: [{ slotsHeld: true }, { runtimeState: { $in: ["pending", "running"] } }],
  }).select({ dedicatedSubscriptionId: 1 }).lean();
  const activeIds = new Set(activeRooms.map((s) => String(s.dedicatedSubscriptionId)));
  let changed = 0;
  for (const sub of subs) {
    const runnable = ["active", "past_due", "suspended"].includes(sub.status);
    const state = runnable ? "active" : activeIds.has(String(sub._id)) ? "releasing" : "released";
    const envelope = unitEnvelope(tier, sub.slotCapacity);
    const prior = bySubId.get(String(sub._id));
    if (prior && String(prior.userId) === String(sub.userId) && prior.tier === sub.tier && prior.regionKey === sub.regionKey &&
        prior.slots === sub.slotCapacity && prior.cpuCores === envelope.cpuCores && prior.ramBytes === envelope.ramBytes &&
        prior.storageBytes === envelope.storageBytes && prior.state === state) continue;
    const values = {
      userId: sub.userId, tier: sub.tier, regionKey: sub.regionKey, slots: sub.slotCapacity,
      ...envelope, state, releasedAt: state === "released" ? prior?.releasedAt || now : null, lastSyncedAt: now,
    };
    const result = await DedicatedCapacityReservation.updateOne(
      { subscriptionId: sub._id },
      { $set: values, $setOnInsert: { subscriptionId: sub._id } },
      { upsert: true }
    );
    if (result.modifiedCount || result.upsertedCount) changed++;
  }
  return changed;
}
