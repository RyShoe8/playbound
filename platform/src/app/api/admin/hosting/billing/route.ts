import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import { requireAdminSession } from "@/lib/requireAdmin";
import DedicatedSubscription from "@/lib/models/DedicatedSubscription";
import DedicatedCapacityHold from "@/lib/models/DedicatedCapacityHold";
import StripeWebhookReceipt from "@/lib/models/StripeWebhookReceipt";

export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;
  await dbConnect();
  const [subs, failed, lastReceipt, heldCount] = await Promise.all([
    DedicatedSubscription.find({ source: "stripe" }).select({ status: 1, billingSnapshot: 1, cancelAtPeriodEnd: 1 }).lean(),
    DedicatedSubscription.find({ source: "stripe", billingLastError: { $type: "string", $ne: "" } })
      .sort({ billingLastCheckedAt: -1 }).limit(20).select({ _id: 1, stripeSubscriptionId: 1, billingLastError: 1, billingLastCheckedAt: 1 }).lean(),
    StripeWebhookReceipt.findOne({}).sort({ processedAt: -1 }).select({ eventType: 1, processedAt: 1 }).lean(),
    DedicatedCapacityHold.countDocuments({ state: "held", expiresAt: { $gt: new Date() } }),
  ]);
  const counts = { active: 0, pastDue: 0, suspended: 0, canceled: 0, canceling: 0 };
  let monthlyRevenueCents = 0;
  for (const sub of subs) {
    if (sub.status === "active") counts.active++;
    else if (sub.status === "past_due") counts.pastDue++;
    else if (sub.status === "suspended") counts.suspended++;
    else if (sub.status === "canceled") counts.canceled++;
    if (sub.cancelAtPeriodEnd && sub.status === "active") counts.canceling++;
    if (sub.status === "active" && sub.billingSnapshot?.currency === "usd") monthlyRevenueCents += sub.billingSnapshot.monthlyPriceCents || 0;
  }
  return NextResponse.json({
    stripeKeyConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
    webhookSecretConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    counts, monthlyRevenueCents, heldCount,
    lastWebhook: lastReceipt ? { type: lastReceipt.eventType, at: lastReceipt.processedAt } : null,
    failures: failed.map((sub) => ({ id: String(sub._id), stripeSubscriptionId: sub.stripeSubscriptionId,
      message: sub.billingLastError, checkedAt: sub.billingLastCheckedAt })),
  }, { headers: { "cache-control": "no-store" } });
}
