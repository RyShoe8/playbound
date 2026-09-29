import dbConnect from "@/lib/db";
import DedicatedSubscription from "@/lib/models/DedicatedSubscription";
import { retrieveBillingSubscription, setStripeCancelAtPeriodEnd } from "./stripeBillingRemote";
import { syncDedicatedStripeSubscription } from "./billingEvents";

/** Stripe is authoritative. Only the account owner can schedule or undo an
 * end-of-period cancellation; a failed local sync is repaired by billing cron. */
export async function setCustomerCancellation(userId: string, cancel: boolean) {
  await dbConnect();
  const local = await DedicatedSubscription.findOne({ userId, tier: "basic", source: "stripe", status: { $in: ["active", "past_due"] } })
    .select({ stripeSubscriptionId: 1, stripeCustomerId: 1 }).lean();
  if (!local?.stripeSubscriptionId || !local.stripeCustomerId) return { error: "No paid Dedicated Basic subscription found.", status: 404 as const };
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
