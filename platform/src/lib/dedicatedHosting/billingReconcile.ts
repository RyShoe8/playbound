import dbConnect from "@/lib/db";
import DedicatedCapacityHold from "@/lib/models/DedicatedCapacityHold";
import DedicatedSubscription from "@/lib/models/DedicatedSubscription";
import { completeCheckoutSession, syncDedicatedStripeSubscription } from "./billingEvents";
import { releaseCapacityHold } from "./capacity";
import { retrieveCheckoutStatus } from "./stripeBillingRemote";

/** Oldest-first bounded scan. Every attempt advances the cursor, including a
 * failure, so one broken account cannot starve everyone behind it. */
export async function reconcileDedicatedBilling() {
  await dbConnect();
  const started = Date.now();
  const subs = await DedicatedSubscription.find({ source: "stripe", stripeSubscriptionId: { $type: "string" } })
    .sort({ billingLastCheckedAt: 1, _id: 1 }).limit(20).select({ _id: 1, stripeSubscriptionId: 1 }).lean();
  const holds = await DedicatedCapacityHold.find({ state: "held", checkoutSessionId: { $type: "string" } })
    .sort({ billingLastCheckedAt: 1, _id: 1 }).limit(10).select({ _id: 1, checkoutSessionId: 1 }).lean();
  if (!subs.length && !holds.length) return { checked: 0, failed: 0, scanned: 0, recovered: 0, scannedHolds: 0 };
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("Stripe secret key is not configured");
  let checked = 0;
  let failed = 0;
  for (const sub of subs) {
    if (Date.now() - started > 45_000) break;
    try {
      await syncDedicatedStripeSubscription(sub.stripeSubscriptionId!);
      checked++;
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message : String(error);
      console.error("[dedicated-billing] reconciliation failed:", String(sub._id), message);
      await DedicatedSubscription.updateOne({ _id: sub._id }, {
        $set: { billingLastCheckedAt: new Date(), billingLastError: message.slice(0, 300) },
      });
    }
  }
  // A completely missed checkout.session.completed webhook has no local
  // subscription to scan. Recover it from its durable capacity hold.
  let recovered = 0;
  for (const hold of holds) {
    if (Date.now() - started > 45_000) break;
    try {
      const remote = await retrieveCheckoutStatus(hold.checkoutSessionId!);
      if (remote.status === "complete" && remote.paymentStatus === "paid") {
        await completeCheckoutSession(hold.checkoutSessionId!);
        recovered++;
      } else if (remote.status === "expired") {
        await releaseCapacityHold(String(hold._id));
      } else if (remote.status === "complete") {
        throw new Error("Completed Checkout has no confirmed payment");
      }
      await DedicatedCapacityHold.updateOne({ _id: hold._id, state: "held" }, { $set: { billingLastCheckedAt: new Date() } });
    } catch (error) {
      failed++;
      console.error("[dedicated-billing] checkout hold reconciliation failed:", String(hold._id), error instanceof Error ? error.message : error);
      await DedicatedCapacityHold.updateOne({ _id: hold._id, state: "held" }, { $set: { billingLastCheckedAt: new Date() } });
    }
  }
  return { checked, failed, scanned: subs.length, recovered, scannedHolds: holds.length };
}
