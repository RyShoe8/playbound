/**
 * DedicatedEntitlementService — the only code that changes how many of a
 * subscription's slots are in use.
 *
 * Allocation is one conditional update: the subscription's `allocatedSlots`
 * rises by N only if the result still fits `slotCapacity` and the
 * subscription is usable. MongoDB applies that atomically, so two "Start
 * Server" requests racing on a 16-slot plan cannot start 12 + 8 = 20 — the
 * second finds 12 already held and is refused. Every path that holds slots
 * also marks the server (`slotsHeld`), which is what lets reconcile
 * recompute the total and repair a crash between the two writes.
 */
import { Types } from "mongoose";
import dbConnect from "@/lib/db";
import DedicatedSubscription from "@/lib/models/DedicatedSubscription";
import CommunityServer from "@/lib/models/CommunityServer";

/** Statuses whose servers may run. past_due keeps running through the payment grace period. */
export const RUNNABLE_STATUSES = ["active", "past_due"] as const;

export type AllocationResult =
  | { ok: true }
  | { ok: false; code: "NOT_FOUND" | "NOT_RUNNABLE" | "INSUFFICIENT_SLOTS" | "ALREADY_HELD"; error: string };

/** Reserve `slots` for `serverId`. Idempotent: a server that already holds its slots is not charged twice. */
export async function allocateSlots(subscriptionId: string, serverId: string, slots: number): Promise<AllocationResult> {
  await dbConnect();
  const claimed = await CommunityServer.findOneAndUpdate(
    { _id: serverId, dedicatedSubscriptionId: subscriptionId, slotsHeld: { $ne: true } },
    { $set: { slotsHeld: true, allocatedSlots: slots } },
    { new: true }
  );
  if (!claimed) {
    const server = await CommunityServer.findOne({ _id: serverId, dedicatedSubscriptionId: subscriptionId }).lean();
    if (!server) return { ok: false, code: "NOT_FOUND", error: "Server not found" };
    return { ok: false, code: "ALREADY_HELD", error: "This server is already online" };
  }
  const updated = await DedicatedSubscription.findOneAndUpdate(
    {
      _id: subscriptionId,
      status: { $in: [...RUNNABLE_STATUSES] },
      $expr: { $lte: [{ $add: ["$allocatedSlots", slots] }, { $min: ["$slotCapacity", { $ifNull: ["$scheduledChange.targetSlots", "$slotCapacity"] }] }] },
    },
    { $inc: { allocatedSlots: slots } },
    { new: true }
  );
  if (updated) return { ok: true };
  // Refused: give the server's claim back, then say why.
  await CommunityServer.updateOne({ _id: serverId, slotsHeld: true }, { $set: { slotsHeld: false } });
  const sub = await DedicatedSubscription.findById(subscriptionId).lean();
  if (!sub) return { ok: false, code: "NOT_FOUND", error: "Subscription not found" };
  if (!(RUNNABLE_STATUSES as readonly string[]).includes(String(sub.status))) {
    return { ok: false, code: "NOT_RUNNABLE", error: "Your hosting subscription is not active" };
  }
  const free = Math.max(0, Math.min(Number(sub.slotCapacity), Number(sub.scheduledChange?.targetSlots) || Number(sub.slotCapacity)) - Number(sub.allocatedSlots));
  return {
    ok: false,
    code: "INSUFFICIENT_SLOTS",
    error: `Not enough free slots: this server needs ${slots} and ${free} ${free === 1 ? "is" : "are"} free. Stop another server first.`,
  };
}

/** Give a server's slots back. Idempotent: releasing twice returns them once. */
export async function releaseSlots(serverId: string): Promise<void> {
  await dbConnect();
  const server = await CommunityServer.findOneAndUpdate(
    { _id: serverId, slotsHeld: true },
    { $set: { slotsHeld: false } },
    { new: false }
  ).lean();
  if (!server?.dedicatedSubscriptionId) return;
  const slots = Number(server.allocatedSlots) || 0;
  if (slots <= 0) return;
  await DedicatedSubscription.updateOne(
    { _id: server.dedicatedSubscriptionId, allocatedSlots: { $gte: slots } },
    { $inc: { allocatedSlots: -slots } }
  );
}

/**
 * Recompute every subscription's `allocatedSlots` from the servers that hold
 * slots. Repairs a total left wrong by a crash between the server and
 * subscription writes. Run from the hosting reconcile.
 */
export async function reconcileAllocations(): Promise<number> {
  await dbConnect();
  const held = await CommunityServer.aggregate<{ _id: Types.ObjectId; total: number }>([
    { $match: { ownerType: "user", slotsHeld: true, dedicatedSubscriptionId: { $ne: null } } },
    { $group: { _id: "$dedicatedSubscriptionId", total: { $sum: "$allocatedSlots" } } },
  ]);
  const totals = new Map(held.map((h) => [String(h._id), h.total]));
  let fixed = 0;
  const subs = await DedicatedSubscription.find({}).select({ allocatedSlots: 1 }).lean();
  for (const sub of subs) {
    const actual = totals.get(String(sub._id)) || 0;
    if (Number(sub.allocatedSlots) !== actual) {
      await DedicatedSubscription.updateOne({ _id: sub._id }, { $set: { allocatedSlots: actual } });
      fixed += 1;
    }
  }
  return fixed;
}
