import { NextResponse } from "next/server";
import { processDedicatedStripeEvent } from "@/lib/dedicatedHosting/billingEvents";
import { verifyStripeWebhook } from "@/lib/dedicatedHosting/stripeWebhook";

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
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[dedicated-stripe-webhook] Event processing failed:", event.id, event.type, error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Billing event could not be applied" }, { status: 503 });
  }
}
