import Stripe from "stripe";

/** Verify the exact raw request body. The endpoint signing secret is distinct
 * from STRIPE_SECRET_KEY and differs between test and live destinations. */
export function verifyStripeWebhook(rawBody: string, signature: string | null): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error("Stripe webhook signing secret is not configured");
  if (!apiKey) throw new Error("Stripe secret key is not configured");
  if (!signature) throw new Error("Missing Stripe signature");
  const stripe = new Stripe(apiKey);
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}
