import dbConnect from "@/lib/db";
import DedicatedSubscription from "@/lib/models/DedicatedSubscription";
import DedicatedCapacityHold from "@/lib/models/DedicatedCapacityHold";
import { randomUUID } from "node:crypto";
import { regionalInventory, releaseCapacityHold, withRegionCapacityLease } from "./capacity";
import { getTier } from "./tier";
import { applyPaidUpgrade, ensureStripeDowngrade, releaseStripeDowngrade, retrieveBillingSubscription, setStripeCancelAtPeriodEnd } from "./stripeBillingRemote";
import { syncDedicatedStripeSubscription } from "./billingEvents";

/** Stripe is authoritative. Only the account owner can schedule or undo an
 * end-of-period cancellation; a failed local sync is repaired by billing cron. */
export async function setCustomerCancellation(userId: string, cancel: boolean) {
  await dbConnect();
  let local = await DedicatedSubscription.findOne({ userId, tier: "basic", source: "stripe", status: { $in: ["active", "past_due"] } })
    .select({ stripeSubscriptionId: 1, stripeCustomerId: 1, scheduledChange: 1, stripePriceId: 1 }).lean();
  if (!local?.stripeSubscriptionId || !local.stripeCustomerId) return { error: "No paid Dedicated Basic subscription found.", status: 404 as const };
  if (local.scheduledChange) {
    const remote = await retrieveBillingSubscription(local.stripeSubscriptionId);
    if (remote.items.data[0]?.price.id === local.scheduledChange.stripePriceId) {
      await syncDedicatedStripeSubscription(local.stripeSubscriptionId);
    } else if (local.scheduledChange.scheduleId) {
      await releaseStripeDowngrade(local.scheduledChange.scheduleId, local.stripeSubscriptionId);
      await DedicatedSubscription.updateOne({ _id: local._id, "scheduledChange.requestKey": local.scheduledChange.requestKey }, { $set: { scheduledChange: null } });
    } else {
      return { error: "A plan change is still being prepared. Contact hosting support if it remains pending.", status: 409 as const };
    }
    local = await DedicatedSubscription.findById(local._id).select({ stripeSubscriptionId: 1, stripeCustomerId: 1, scheduledChange: 1 }).lean();
    if (!local || local.scheduledChange) return { error: "Plan change has not finished reconciling.", status: 409 as const };
  }
  if (await DedicatedCapacityHold.exists({ planChangeSubscriptionId: local._id, state: "held" })) {
    return { error: "An upgrade is still being reconciled. Contact hosting support if it remains pending.", status: 409 as const };
  }
  const remote = await retrieveBillingSubscription(local.stripeSubscriptionId);
  if (remote.metadata?.playbound_hold_id == null || String(remote.customer) !== local.stripeCustomerId || remote.id !== local.stripeSubscriptionId ||
      !["active", "past_due"].includes(remote.status)) {
    return { error: "Billing identity could not be verified. Contact hosting support.", status: 409 as const };
  }
  if (remote.cancel_at_period_end !== cancel) await setStripeCancelAtPeriodEnd(remote.id, cancel);
  await syncDedicatedStripeSubscription(remote.id);
  const updated = await DedicatedSubscription.findById(local._id).select({ cancelAtPeriodEnd: 1, currentPeriodEnd: 1 }).lean();
  return { cancelAtPeriodEnd: Boolean(updated?.cancelAtPeriodEnd), currentPeriodEnd: updated?.currentPeriodEnd || null, status: 200 as const };
}

/** Reserve the delta under the regional lease before asking Stripe to bill an
 * upgrade. An ambiguous Stripe failure intentionally retains the hold for
 * the reconciler; only a definitive payment rejection releases it. */
export async function upgradeCustomerPlan(userId: string, targetSlots: number) {
  if (!Number.isSafeInteger(targetSlots)) return { error: "Choose a valid slot package.", status: 400 as const };
  await dbConnect();
  const local = await DedicatedSubscription.findOne({ userId, tier: "basic", source: "stripe", status: "active" }).lean();
  if (!local?.stripeSubscriptionId || !local.stripeCustomerId) return { error: "No active paid Dedicated Basic plan found.", status: 404 as const };
  if (local.cancelAtPeriodEnd) return { error: "Keep your plan before upgrading it.", status: 409 as const };
  if (local.scheduledChange) return { error: "A downgrade is scheduled. Contact hosting support before upgrading.", status: 409 as const };
  if (targetSlots <= local.slotCapacity) return { error: "Choose a larger slot package.", status: 400 as const };
  const tier = await getTier(local.tier);
  const pkg = tier.packages.find((p) => p.enabled && p.slots === targetSlots && p.stripePriceId);
  if (!pkg?.stripePriceId) return { error: "That slot package is not available.", status: 400 as const };
  const remote = await retrieveBillingSubscription(local.stripeSubscriptionId);
  const currentItem = remote.items.data[0];
  if (currentItem?.price.id === pkg.stripePriceId && currentItem.price.id !== local.stripePriceId) {
    const pending = await DedicatedCapacityHold.findOne({ planChangeSubscriptionId: local._id, state: "held", toSlots: targetSlots, stripePriceId: pkg.stripePriceId });
    if (pending) {
      await syncDedicatedStripeSubscription(remote.id);
      const updated = await DedicatedSubscription.findById(local._id).select({ slotCapacity: 1 }).lean();
      return { slots: updated?.slotCapacity || local.slotCapacity, status: 200 as const };
    }
  }
  if (remote.status !== "active" || remote.cancel_at_period_end || remote.items.data.length !== 1 || !currentItem ||
      remote.id !== local.stripeSubscriptionId || String(remote.customer) !== local.stripeCustomerId ||
      !remote.metadata?.playbound_hold_id || currentItem.price.id !== local.stripePriceId || currentItem.quantity !== 1) {
    return { error: "Billing changed outside PlayBound. Contact hosting support.", status: 409 as const };
  }

  const reserved = await withRegionCapacityLease(local.regionKey, async () => {
    const fresh = await DedicatedSubscription.findById(local._id).lean();
    if (!fresh || fresh.status !== "active" || fresh.slotCapacity !== local.slotCapacity || fresh.stripePriceId !== local.stripePriceId || fresh.cancelAtPeriodEnd) {
      return { error: "Your plan changed. Refresh and try again.", status: 409 as const };
    }
    const existing = await DedicatedCapacityHold.findOne({ planChangeSubscriptionId: local._id, state: "held" });
    if (existing) {
      if (existing.toSlots !== targetSlots || existing.stripePriceId !== pkg.stripePriceId) {
        return { error: "Another upgrade is being reconciled. Contact hosting support if it remains pending.", status: 409 as const };
      }
      return { hold: existing };
    }
    const delta = targetSlots - local.slotCapacity;
    const inventory = await regionalInventory(local.regionKey);
    if (inventory.availableSlots < delta) return { error: inventory.reason || "Not enough regional capacity for this upgrade.", status: 409 as const };
    const hold = await DedicatedCapacityHold.create({
      userId, tier: local.tier, regionKey: local.regionKey, slots: delta,
      checkoutKey: `upgrade-${randomUUID()}`, planChangeSubscriptionId: local._id,
      fromSlots: local.slotCapacity, toSlots: targetSlots,
      stripePriceId: pkg.stripePriceId, monthlyPriceCents: pkg.priceCents, currency: pkg.currency.toLowerCase(),
      state: "held", expiresAt: new Date(Date.now() + 60 * 60_000),
    });
    return { hold };
  });
  if ("error" in reserved) return reserved;
  const hold = reserved.hold;
  try {
    await applyPaidUpgrade(remote.id, currentItem.id, pkg.stripePriceId, `playbound-upgrade-${hold._id}`);
  } catch (error) {
    // 402 is a definitive rejected invoice. Network/5xx/unknown results can
    // have succeeded remotely, so they must keep the delta reserved.
    if ((error as { statusCode?: number })?.statusCode === 402) await releaseCapacityHold(String(hold._id));
    throw error;
  }
  await syncDedicatedStripeSubscription(remote.id);
  const updated = await DedicatedSubscription.findById(local._id).select({ slotCapacity: 1 }).lean();
  return { slots: updated?.slotCapacity || local.slotCapacity, status: 200 as const };
}

/** A downgrade is billed from the next period. Limit new allocations as soon
 * as the request is recorded, then configure Stripe's future schedule. */
export async function scheduleCustomerDowngrade(userId: string, targetSlots: number) {
  if (!Number.isSafeInteger(targetSlots)) return { error: "Choose a valid slot package.", status: 400 as const };
  await dbConnect();
  const local = await DedicatedSubscription.findOne({ userId, tier: "basic", source: "stripe", status: "active" });
  if (!local?.stripeSubscriptionId || !local.stripeCustomerId) return { error: "No active paid Dedicated Basic plan found.", status: 404 as const };
  if (local.cancelAtPeriodEnd) return { error: "Keep your plan before changing it.", status: 409 as const };
  if (targetSlots >= local.slotCapacity) return { error: "Choose a smaller slot package.", status: 400 as const };
  const tier = await getTier(local.tier);
  const pkg = tier.packages.find((p) => p.enabled && p.slots === targetSlots && p.stripePriceId);
  if (!pkg?.stripePriceId) return { error: "That slot package is not available.", status: 400 as const };
  if (await DedicatedCapacityHold.exists({ planChangeSubscriptionId: local._id, state: "held" })) {
    return { error: "An upgrade is still being reconciled.", status: 409 as const };
  }
  const remote = await retrieveBillingSubscription(local.stripeSubscriptionId);
  const item = remote.items.data[0];
  if (remote.status !== "active" || remote.cancel_at_period_end || remote.items.data.length !== 1 ||
      !item || item.price.id !== local.stripePriceId || item.quantity !== 1 ||
      String(remote.customer) !== local.stripeCustomerId || !remote.metadata?.playbound_hold_id ||
      !item.current_period_end) {
    return { error: "Billing changed outside PlayBound. Contact hosting support.", status: 409 as const };
  }
  let change = local.scheduledChange;
  if (change && (change.targetSlots !== targetSlots || change.stripePriceId !== pkg.stripePriceId)) {
    return { error: "Another downgrade is already scheduled.", status: 409 as const };
  }
  if (!change) {
    if (remote.schedule) return { error: "A Stripe billing schedule is already attached. Contact hosting support.", status: 409 as const };
    const requestKey = randomUUID();
    const claimed = await DedicatedSubscription.findOneAndUpdate({
      _id: local._id, scheduledChange: null, status: "active", slotCapacity: local.slotCapacity,
      allocatedSlots: { $lte: targetSlots },
    }, { $set: { scheduledChange: {
      targetSlots, stripePriceId: pkg.stripePriceId, monthlyPriceCents: pkg.priceCents,
      currency: pkg.currency.toLowerCase(), effectiveAt: new Date(item.current_period_end * 1000),
      requestKey, scheduleId: null, state: "preparing",
    } } }, { returnDocument: "after" });
    if (!claimed) return { error: "Stop enough servers to fit the smaller plan, then try again.", status: 409 as const };
    change = claimed.scheduledChange;
  }
  if (!change) throw new Error("Downgrade request was not saved");
  const schedule = await ensureStripeDowngrade({
    subscriptionId: local.stripeSubscriptionId, scheduleId: change.scheduleId,
    requestKey: change.requestKey, currentPriceId: local.stripePriceId,
    targetPriceId: change.stripePriceId, originalHoldId: remote.metadata.playbound_hold_id,
    currentPeriodEnd: Math.floor(new Date(change.effectiveAt).getTime() / 1000),
  });
  await DedicatedSubscription.updateOne({ _id: local._id, "scheduledChange.requestKey": change.requestKey }, {
    $set: { "scheduledChange.scheduleId": schedule.scheduleId, "scheduledChange.state": "scheduled" },
  });
  return { slots: targetSlots, effectiveAt: schedule.effectiveAt, status: 200 as const };
}

/** Repair an interrupted schedule create/update from billing cron. */
export async function reconcilePreparingDowngrade(subscriptionId: string) {
  const local = await DedicatedSubscription.findById(subscriptionId).lean();
  const change = local?.scheduledChange;
  if (!local?.stripeSubscriptionId || !local.stripePriceId || !change || change.state !== "preparing" || local.status !== "active") return;
  const remote = await retrieveBillingSubscription(local.stripeSubscriptionId);
  if (remote.items.data[0]?.price.id !== local.stripePriceId || !remote.metadata?.playbound_hold_id) return;
  const schedule = await ensureStripeDowngrade({
    subscriptionId: local.stripeSubscriptionId, scheduleId: change.scheduleId,
    requestKey: change.requestKey, currentPriceId: local.stripePriceId,
    targetPriceId: change.stripePriceId, originalHoldId: remote.metadata.playbound_hold_id,
    currentPeriodEnd: Math.floor(new Date(change.effectiveAt).getTime() / 1000),
  });
  await DedicatedSubscription.updateOne({ _id: local._id, "scheduledChange.requestKey": change.requestKey }, {
    $set: { "scheduledChange.scheduleId": schedule.scheduleId, "scheduledChange.state": "scheduled" },
  });
}
