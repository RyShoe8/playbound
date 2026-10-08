import { after, NextResponse } from "next/server";
import { processDedicatedStripeEvent } from "@/lib/dedicatedHosting/billingEvents";
import { verifyStripeWebhook } from "@/lib/dedicatedHosting/stripeWebhook";
import { reconcileCommunityHosting } from "@/lib/communityHosting/reconcile";

export const maxDuration = 60;

/** Verify first; acknowledge only events whose local side effects completed. */
export async function POST(req: Request) {
  if (!process.env.STRIPE_WEBHOOK_SECRET || !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Webhook is not configured" }, { status: 503 });
  }
  let event;
  try {
    event = verifyStripeWebhook(await req.text(), req.headers.get("stripe-signature"));
  } catch {
    return NextResponse.json({ error: "Invalid Stripe signature or webhook configuration" }, { status: 400 });
  }
  try {
    await processDedicatedStripeEvent(event);
    if (event.type === "checkout.session.completed" || event.type === "customer.subscription.updated") {
      // The paid entitlement is committed before the community budget changes.
      // Do not delay or fail Stripe's acknowledgement while free rooms yield.
      after(async () => {
        try { await reconcileCommunityHosting(); }
        catch (error) { console.error("[dedicated-stripe-webhook] Community capacity reclaim failed:", error); }
      });
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[dedicated-stripe-webhook] Event processing failed:", event.id, event.type, error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Billing event could not be applied" }, { status: 503 });
  }
}
