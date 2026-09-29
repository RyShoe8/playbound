import Stripe from "stripe";

export async function retrievePaidCheckout(sessionId: string) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe secret key is not configured");
  const stripe = new Stripe(key);
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.mode !== "subscription" || session.status !== "complete" || session.payment_status !== "paid" ||
      !session.subscription || typeof session.subscription !== "string" || !session.customer || typeof session.customer !== "string") {
    throw new Error("Checkout is not a paid subscription");
  }
  const subscription = await stripe.subscriptions.retrieve(session.subscription, { expand: ["latest_invoice"] });
  const invoice = subscription.latest_invoice;
  if (subscription.status !== "active" || !invoice || typeof invoice === "string" || invoice.status !== "paid") {
    throw new Error("Subscription's first invoice is not paid");
  }
  return { session, subscription };
}

export async function retrieveCheckoutStatus(sessionId: string) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe secret key is not configured");
  const session = await new Stripe(key).checkout.sessions.retrieve(sessionId);
  return { status: session.status, paymentStatus: session.payment_status };
}

export async function retrieveBillingSubscription(subscriptionId: string) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe secret key is not configured");
  return new Stripe(key).subscriptions.retrieve(subscriptionId);
}

/** Customer cancellation takes effect at the end of the paid period. Never
 * cancel immediately from a local dashboard action. */
export async function setStripeCancelAtPeriodEnd(subscriptionId: string, cancel: boolean) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe secret key is not configured");
  return new Stripe(key).subscriptions.update(subscriptionId, { cancel_at_period_end: cancel });
}
