/** Checkout preparation only. The public sales switch stays locked until
 * verified webhooks can turn a paid Session into exactly one entitlement. */
import dbConnect from "@/lib/db";
import DedicatedSubscription from "@/lib/models/DedicatedSubscription";
import { SITE_URL } from "@/lib/site";
import { attachCheckoutSessionToHold, createCapacityHold, markCheckoutAttempt, releaseCapacityHold } from "./capacity";
import { getTier } from "./tier";

type CheckoutSession = { id: string; url: string | null; expires_at: number; status?: string };

async function stripeSession(path: string, fields?: Record<string, string>, idempotencyKey?: string): Promise<CheckoutSession> {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error("Stripe secret key is not configured");
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: fields ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(fields ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: fields ? new URLSearchParams(fields) : undefined,
    cache: "no-store",
  });
  const data = await response.json() as CheckoutSession & { error?: { message?: string } };
  if (!response.ok || !data.id) throw new Error(data.error?.message || `Stripe returned ${response.status}`);
  return data;
}

export async function prepareBasicCheckout(input: { userId: string; regionKey: string; slots: number; checkoutKey: string }) {
  await dbConnect();
  const tier = await getTier();
  if (!tier.salesEnabled) throw new Error("Dedicated Basic checkout is not open");
  if (!tier.regions.some((r) => r.key === input.regionKey && r.salesEnabled)) throw new Error("Region is not for sale");
  const pkg = tier.packages.find((p) => p.slots === input.slots && p.enabled);
  if (!pkg?.stripePriceId || !/^price_[a-zA-Z0-9_]+$/.test(pkg.stripePriceId)) throw new Error("Package price is not synced");
  if (await DedicatedSubscription.exists({ userId: input.userId, tier: tier.key, status: { $in: ["active", "past_due", "suspended"] } })) {
    throw new Error("This account already has Dedicated Basic");
  }
  const hold = await createCapacityHold({
    ...input, stripePriceId: pkg.stripePriceId, monthlyPriceCents: pkg.priceCents, currency: pkg.currency.toLowerCase(),
  });
  if (hold.checkoutSessionId) {
    const existing = await stripeSession(`checkout/sessions/${encodeURIComponent(hold.checkoutSessionId)}`);
    if (existing.status !== "open" || !existing.url || !existing.url.startsWith("https://checkout.stripe.com/")) throw new Error("Checkout session is no longer open");
    return { url: existing.url, sessionId: existing.id };
  }

  // Never release on an uncertain create failure: Stripe may have accepted it
  // while the network response was lost. A retry uses the same idempotency key.
  const attempted = await markCheckoutAttempt(String(hold._id));
  let session: CheckoutSession;
  try {
    session = await stripeSession("checkout/sessions", {
      mode: "subscription",
      // Keep initial payment synchronous; deferred payment methods can settle
      // after the capacity hold has expired.
      "payment_method_types[0]": "card",
      "line_items[0][price]": pkg.stripePriceId,
      "line_items[0][quantity]": "1",
      client_reference_id: input.userId,
      success_url: `${SITE_URL}/hosting?checkout=returned`,
      cancel_url: `${SITE_URL}/hosting?checkout=canceled`,
      expires_at: String(Math.floor(attempted.requestedSessionExpiresAt!.getTime() / 1000)),
      "metadata[playbound_hold_id]": String(hold._id),
      "metadata[playbound_checkout_key]": input.checkoutKey,
      "subscription_data[metadata][playbound_hold_id]": String(hold._id),
    }, `playbound-checkout-${input.checkoutKey}`);
  } catch (error) {
    // Keep the conservative hold for a possibly-created remote Session.
    throw error;
  }
  try {
    if (!session.id.startsWith("cs_") || !session.url || !session.url.startsWith("https://checkout.stripe.com/")) {
      throw new Error("Stripe returned an invalid Checkout Session");
    }
    await attachCheckoutSessionToHold(String(hold._id), session.id, new Date(session.expires_at * 1000));
    return { url: session.url, sessionId: session.id };
  } catch (error) {
    // Once created, the Session must be expired BEFORE freeing the hold.
    try {
      await stripeSession(`checkout/sessions/${encodeURIComponent(session.id)}/expire`, {});
      await releaseCapacityHold(String(hold._id));
    } catch {
      // A payable Session might remain; hold its capacity until expiry.
    }
    throw error;
  }
}
