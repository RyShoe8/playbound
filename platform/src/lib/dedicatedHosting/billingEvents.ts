import type Stripe from "stripe";
import { Types } from "mongoose";
import dbConnect from "@/lib/db";
import DedicatedCapacityHold from "@/lib/models/DedicatedCapacityHold";
import DedicatedSubscription from "@/lib/models/DedicatedSubscription";
import CommunityServer from "@/lib/models/CommunityServer";
import StripeWebhookReceipt from "@/lib/models/StripeWebhookReceipt";
import { regionalInventory, withRegionCapacityLease } from "./capacity";
import { reconcileDedicatedCapacityReservations } from "./reservations";
import { retrieveBillingSubscription, retrieveCompletedCheckout, retrievePaidCheckout } from "./stripeBillingRemote";
import { getTier } from "./tier";

async function recordReceipt(event: Stripe.Event, objectId: string) {
  await StripeWebhookReceipt.updateOne(
    { eventId: event.id },
    { $setOnInsert: { eventId: event.id, eventType: event.type, objectId, processedAt: new Date() } },
    { upsert: true }
  );
}

/** The only initial paid-entitlement creation path. A verified event is a
 * notification; retrieve the current Checkout and subscription from Stripe. */
export async function completeCheckoutSession(sessionId: string, event?: Stripe.Event) {
  if (!sessionId?.startsWith("cs_")) throw new Error("Invalid Checkout session");
  await dbConnect();
  const session = await retrieveCompletedCheckout(sessionId);
  const holdId = session.metadata?.playbound_hold_id;
  if (!holdId || !Types.ObjectId.isValid(holdId)) throw new Error("Paid Checkout has no valid capacity hold");
  const initial = await DedicatedCapacityHold.findById(holdId).select({ regionKey: 1 }).lean();
  if (!initial) throw new Error("Paid Checkout capacity hold is missing");

  await withRegionCapacityLease(initial.regionKey, async () => {
    const hold = await DedicatedCapacityHold.findById(holdId);
    if (!hold || hold.state === "released" ||
        (hold.checkoutSessionId && hold.checkoutSessionId !== session.id) ||
        String(hold.userId) !== session.client_reference_id ||
        hold.tier !== "basic" || !hold.stripePriceId || !hold.monthlyPriceCents || !hold.currency) {
      throw new Error("Paid Checkout does not match its capacity hold");
    }
    const subId = session.subscription as string;
    const existing = await DedicatedSubscription.findOne({ stripeSubscriptionId: subId });
    if (existing) {
      const remote = await retrieveBillingSubscription(subId);
      if ((hold.checkoutSessionId && hold.checkoutSessionId !== session.id) ||
          String(existing.userId) !== String(hold.userId) || existing.regionKey !== hold.regionKey ||
          existing.source !== "stripe" || existing.stripeCustomerId !== session.customer ||
          String(remote.customer) !== session.customer || remote.metadata?.playbound_hold_id !== String(hold._id)) {
        throw new Error("Existing paid entitlement does not match Checkout");
      }
      if (hold.state === "held") {
        const { subscription } = await retrievePaidCheckout(sessionId);
        const original = subscription.items.data[0];
        if (existing.slotCapacity !== hold.slots || existing.stripePriceId !== hold.stripePriceId ||
            original?.price.id !== hold.stripePriceId || original?.price.unit_amount !== hold.monthlyPriceCents ||
            original?.price.currency?.toLowerCase() !== hold.currency) {
          throw new Error("Interrupted Checkout conversion does not match the original package");
        }
        hold.state = "converted";
        hold.checkoutSessionId = session.id;
        hold.convertedAt = new Date();
        await hold.save();
      }
      await reconcileDedicatedCapacityReservations();
      if (event) await recordReceipt(event, session.id);
      return;
    }
    const { subscription } = await retrievePaidCheckout(sessionId);
    if (String(hold._id) !== subscription.metadata?.playbound_hold_id) throw new Error("Paid subscription does not match its capacity hold");
    if (subscription.customer !== session.customer || subscription.items.data.length !== 1) {
      throw new Error("Paid subscription does not match Checkout");
    }
    const item = subscription.items.data[0];
    if (item.quantity !== 1 || item.price.id !== hold.stripePriceId ||
        item.price.unit_amount !== hold.monthlyPriceCents ||
        item.price.currency.toLowerCase() !== hold.currency) {
      throw new Error("Paid subscription price does not match reserved package");
    }
    if (!item.current_period_start || !item.current_period_end || item.current_period_end <= item.current_period_start) {
      throw new Error("Paid subscription has no valid billing period");
    }
    await DedicatedSubscription.init(); // Enforce unique Stripe subscription ID before granting access.
    const competing = await DedicatedSubscription.exists({
        userId: hold.userId, tier: hold.tier, status: { $in: ["active", "past_due", "suspended"] },
    });
    if (competing) throw new Error("Account already has an active Dedicated entitlement");
    if (hold.expiresAt <= new Date()) {
      const inventory = await regionalInventory(hold.regionKey);
      if (inventory.availableSlots < hold.slots) throw new Error("Paid Checkout hold expired and capacity is unavailable");
    }
    await DedicatedSubscription.create({
        userId: hold.userId, tier: hold.tier, regionKey: hold.regionKey, slotCapacity: hold.slots,
        status: "active", source: "stripe", stripeCustomerId: session.customer,
        stripeSubscriptionId: subscription.id, stripePriceId: hold.stripePriceId,
        currentPeriodStart: new Date(item.current_period_start * 1000),
        currentPeriodEnd: new Date(item.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        billingSnapshot: { slots: hold.slots, monthlyPriceCents: hold.monthlyPriceCents, currency: hold.currency },
    });
    // Creating the sub first can temporarily double-reserve capacity, which is
    // safe. If this update fails, a retry finds the sub and finishes conversion.
    if (hold.state === "held") {
      hold.state = "converted";
      hold.checkoutSessionId = session.id;
      hold.convertedAt = new Date();
      await hold.save();
    }
    await reconcileDedicatedCapacityReservations();
    if (event) await recordReceipt(event, session.id);
  });
}

function subscriptionIdForEvent(event: Stripe.Event): string | null {
  if (event.type.startsWith("customer.subscription.")) return (event.data.object as Stripe.Subscription).id;
  if (event.type.startsWith("invoice.")) {
    const invoice = event.data.object as Stripe.Invoice;
    const value = invoice.parent?.subscription_details?.subscription;
    return typeof value === "string" ? value : value?.id || null;
  }
  return null;
}

async function reconcileSubscriptionEvent(event: Stripe.Event) {
  const subId = subscriptionIdForEvent(event);
  if (!subId?.startsWith("sub_")) throw new Error("Billing event has no subscription ID");
  return syncDedicatedStripeSubscription(subId, event);
}

/** Also called by the periodic reconciler: missed webhooks cannot leave a
 * PlayBound entitlement permanently out of sync with Stripe. */
export async function syncDedicatedStripeSubscription(subId: string, event?: Stripe.Event) {
  await dbConnect();
  const remote = await retrieveBillingSubscription(subId);
  // This Stripe account may contain other products. Only manage subscriptions
  // created with our hold metadata.
  if (!remote.metadata?.playbound_hold_id) {
    if (event) await recordReceipt(event, subId);
    return;
  }
  const initial = await DedicatedSubscription.findOne({ stripeSubscriptionId: subId }).select({ regionKey: 1 }).lean();
  if (!initial) throw new Error("Paid subscription is not provisioned yet; retry after Checkout");
  await withRegionCapacityLease(initial.regionKey, async () => {
    const local = await DedicatedSubscription.findOne({ stripeSubscriptionId: subId });
    const hold = await DedicatedCapacityHold.findById(remote.metadata.playbound_hold_id).lean();
    if (!local || local.source !== "stripe" || !hold || hold.state !== "converted" || String(hold.userId) !== String(local.userId) ||
        hold.regionKey !== local.regionKey || hold.tier !== local.tier) {
      throw new Error("Subscription billing identity does not match a converted hold");
    }
    const item = remote.items.data[0];
    const pendingUpgrade = await DedicatedCapacityHold.findOne({ planChangeSubscriptionId: local._id, state: "held" });
    const priceChanged = Boolean(item && item.price.id !== local.stripePriceId);
    const downgrade = local.scheduledChange;
    const scheduledDowngradeApplies = Boolean(priceChanged && downgrade &&
      downgrade.targetSlots < local.slotCapacity && downgrade.stripePriceId === item?.price.id &&
      new Date(downgrade.effectiveAt).getTime() <= Date.now() + 60_000 &&
      downgrade.monthlyPriceCents === item?.price.unit_amount &&
      downgrade.currency === item?.price.currency?.toLowerCase() &&
      local.allocatedSlots <= downgrade.targetSlots && ["active", "past_due", "unpaid"].includes(remote.status) && item?.quantity === 1);
    if (priceChanged && !scheduledDowngradeApplies && (!pendingUpgrade || pendingUpgrade.fromSlots !== local.slotCapacity ||
        pendingUpgrade.toSlots !== local.slotCapacity + pendingUpgrade.slots ||
        pendingUpgrade.stripePriceId !== item.price.id || pendingUpgrade.regionKey !== local.regionKey ||
        String(pendingUpgrade.userId) !== String(local.userId) || pendingUpgrade.tier !== local.tier ||
        item.quantity !== 1 || item.price.unit_amount !== pendingUpgrade.monthlyPriceCents ||
        item.price.currency?.toLowerCase() !== pendingUpgrade.currency || remote.status !== "active")) {
      throw new Error("Stripe price changed without a paid, capacity-reserved PlayBound upgrade");
    }
    if (String(remote.customer) !== local.stripeCustomerId ||
        (remote.status !== "canceled" && (remote.items.data.length !== 1 || !item || (!priceChanged && item.price.id !== local.stripePriceId) || item.quantity !== 1)) ||
        (remote.status === "canceled" && item && (remote.items.data.length !== 1 || item.price.id !== local.stripePriceId))) {
      throw new Error("Stripe subscription changed outside PlayBound's capacity controls");
    }
    const now = new Date();
    const tier = await getTier(local.tier);
    if (remote.status === "active") {
      if (local.status === "suspended" || local.status === "canceled" || local.status === "expired") {
        const competing = await DedicatedSubscription.exists({
          _id: { $ne: local._id }, userId: local.userId, tier: local.tier,
          status: { $in: ["active", "past_due"] },
        });
        if (competing) throw new Error("Account has a competing active entitlement");
        const rooms = await CommunityServer.find({
          regionKey: local.regionKey, ownerType: "user", dedicatedSubscriptionId: local._id,
          $or: [{ slotsHeld: true }, { runtimeState: { $in: ["pending", "running"] } }],
        }).select({ allocatedSlots: 1, maxPlayerCount: 1 }).lean();
        const alreadyOccupied = Math.min(local.slotCapacity, rooms.reduce((sum, room) => sum + Math.max(room.allocatedSlots || 0, room.maxPlayerCount || 0, tier.minAllocation), 0));
        const inventory = await regionalInventory(local.regionKey);
        if (inventory.availableSlots < local.slotCapacity - alreadyOccupied) {
          throw new Error("Recovered payment cannot be reactivated until regional capacity is available");
        }
      }
      local.status = "active";
      local.graceUntil = null;
      local.retainDataUntil = null;
    } else if (remote.status === "past_due" || remote.status === "unpaid") {
      if (local.status !== "past_due" && local.status !== "suspended") {
        local.graceUntil = new Date(now.getTime() + tier.paymentGraceHours * 60 * 60_000);
      }
      if (local.graceUntil && now >= local.graceUntil) {
        local.status = "suspended";
        if (!local.retainDataUntil) local.retainDataUntil = new Date(now.getTime() + tier.cancellationRetentionDays * 24 * 60 * 60_000);
      } else if (local.status !== "suspended") local.status = "past_due";
    } else if (remote.status === "canceled") {
      local.status = "canceled";
      local.graceUntil = null;
      local.scheduledChange = null;
      if (!local.retainDataUntil) local.retainDataUntil = new Date(now.getTime() + tier.cancellationRetentionDays * 24 * 60 * 60_000);
    } else {
      throw new Error(`Stripe subscription status ${remote.status} is not supported yet`);
    }
    local.cancelAtPeriodEnd = remote.cancel_at_period_end;
    if (priceChanged && pendingUpgrade) {
      local.slotCapacity = pendingUpgrade.toSlots;
      local.stripePriceId = pendingUpgrade.stripePriceId;
      local.billingSnapshot = {
        slots: pendingUpgrade.toSlots,
        monthlyPriceCents: pendingUpgrade.monthlyPriceCents,
        currency: pendingUpgrade.currency,
      };
    } else if (scheduledDowngradeApplies && downgrade) {
      local.slotCapacity = downgrade.targetSlots;
      local.stripePriceId = downgrade.stripePriceId;
      local.billingSnapshot = {
        slots: downgrade.targetSlots,
        monthlyPriceCents: downgrade.monthlyPriceCents,
        currency: downgrade.currency,
      };
      local.scheduledChange = null;
    }
    if (item?.current_period_start && item.current_period_end) {
      local.currentPeriodStart = new Date(item.current_period_start * 1000);
      local.currentPeriodEnd = new Date(item.current_period_end * 1000);
    }
    local.billingLastCheckedAt = now;
    local.billingLastError = null;
    await local.save();
    await reconcileDedicatedCapacityReservations();
    if (pendingUpgrade && !priceChanged && (pendingUpgrade.toSlots !== local.slotCapacity || pendingUpgrade.stripePriceId !== local.stripePriceId)) {
      // The remote update has not landed. Keep the extra capacity held; the
      // next billing pass can observe a delayed Stripe success.
    } else if (pendingUpgrade && remote.status === "active") {
      await DedicatedCapacityHold.updateOne({ _id: pendingUpgrade._id, state: "held" }, { $set: { state: "converted", convertedAt: now } });
    }
    if (event) await recordReceipt(event, subId);
  });
}

export async function processDedicatedStripeEvent(event: Stripe.Event) {
  if (!/^evt_[a-zA-Z0-9_]+$/.test(event.id)) throw new Error("Invalid Stripe event ID");
  await dbConnect();
  await StripeWebhookReceipt.init();
  if (await StripeWebhookReceipt.exists({ eventId: event.id })) return;
  if (event.type === "checkout.session.completed") return completeCheckoutSession((event.data.object as Stripe.Checkout.Session).id, event);
  if (event.type === "checkout.session.expired") {
    const session = event.data.object as Stripe.Checkout.Session;
    const holdId = session.metadata?.playbound_hold_id;
    if (!holdId || !Types.ObjectId.isValid(holdId)) throw new Error("Expired Checkout has no valid capacity hold");
    const initial = await DedicatedCapacityHold.findById(holdId).select({ regionKey: 1 }).lean();
    if (!initial) throw new Error("Expired Checkout capacity hold is missing");
    return withRegionCapacityLease(initial.regionKey, async () => {
      const hold = await DedicatedCapacityHold.findById(holdId);
      if (!hold || (hold.checkoutSessionId && hold.checkoutSessionId !== session.id)) throw new Error("Expired Checkout hold mismatch");
      if (hold.state === "held") {
        hold.state = "released";
        hold.releasedAt = new Date();
        hold.checkoutSessionId = session.id;
        await hold.save();
      }
      await recordReceipt(event, session.id);
    });
  }
  if (["invoice.paid", "invoice.payment_failed", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
    return reconcileSubscriptionEvent(event);
  }
  // Irrelevant Stripe account events need no local side effects.
  await recordReceipt(event, String((event.data.object as { id?: string }).id || "unknown"));
}
