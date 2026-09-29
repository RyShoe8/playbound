import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import DedicatedCapacityHold from "@/lib/models/DedicatedCapacityHold";
import { releaseCapacityHold } from "@/lib/dedicatedHosting/capacity";
import { verifyStripeWebhook } from "@/lib/dedicatedHosting/stripeWebhook";

/** This endpoint deliberately does not acknowledge payment events until the
 * billing reconciler is implemented. Sales remain locked off in admin. */
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
  if (event.type !== "checkout.session.expired") {
    // A 2xx here would permanently acknowledge money without entitlement.
    return NextResponse.json({ error: "Billing event handler is not active" }, { status: 503 });
  }
  const session = event.data.object;
  try {
    await dbConnect();
    const hold = await DedicatedCapacityHold.findOne({ checkoutSessionId: session.id, state: "held" }).select({ _id: 1 }).lean();
    if (hold) await releaseCapacityHold(String(hold._id));
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ error: "Could not release capacity hold" }, { status: 503 });
  }
}
