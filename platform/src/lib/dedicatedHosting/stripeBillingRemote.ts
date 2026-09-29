import Stripe from "stripe";

export async function retrievePaidCheckout(sessionId: string) {
  const session = await retrieveCompletedCheckout(sessionId);
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe secret key is not configured");
  const stripe = new Stripe(key);
  const subscription = await stripe.subscriptions.retrieve(session.subscription as string, { expand: ["latest_invoice"] });
  const invoice = subscription.latest_invoice;
  if (subscription.status !== "active" || !invoice || typeof invoice === "string" || invoice.status !== "paid") {
    throw new Error("Subscription's first invoice is not paid");
  }
  return { session, subscription };
}

export async function retrieveCompletedCheckout(sessionId: string) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe secret key is not configured");
  const session = await new Stripe(key).checkout.sessions.retrieve(sessionId);
  if (session.mode !== "subscription" || session.status !== "complete" || session.payment_status !== "paid" ||
      !session.subscription || typeof session.subscription !== "string" || !session.customer || typeof session.customer !== "string") {
    throw new Error("Checkout is not a paid subscription");
  }
  return session;
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

/** Charge any upgrade proration now; Stripe leaves the subscription untouched
 * if the new invoice cannot be paid. The stable key makes retries safe. */
export async function applyPaidUpgrade(subscriptionId: string, itemId: string, priceId: string, idempotencyKey: string) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe secret key is not configured");
  return new Stripe(key).subscriptions.update(subscriptionId, {
    items: [{ id: itemId, price: priceId, quantity: 1 }],
    proration_behavior: "always_invoice",
    payment_behavior: "error_if_incomplete",
  }, { idempotencyKey });
}

/** A scheduled price transition at the next renewal. Creating a schedule from
 * the subscription is idempotent; a retry can discover it on the subscription
 * when the first response was lost. */
export async function ensureStripeDowngrade(input: {
  subscriptionId: string; scheduleId?: string | null; requestKey: string;
  currentPriceId: string; targetPriceId: string; originalHoldId: string;
  currentPeriodEnd: number;
}) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe secret key is not configured");
  const stripe = new Stripe(key);
  const remote = await stripe.subscriptions.retrieve(input.subscriptionId);
  const attachedId = typeof remote.schedule === "string" ? remote.schedule : remote.schedule?.id || null;
  if (attachedId && input.scheduleId && attachedId !== input.scheduleId) throw new Error("Subscription is attached to another Stripe schedule");
  if (remote.items.data.length !== 1 || remote.items.data[0].price.id !== input.currentPriceId) {
    throw new Error("Subscription price changed before the downgrade was scheduled");
  }
  let schedule = attachedId ? await stripe.subscriptionSchedules.retrieve(attachedId) :
    await stripe.subscriptionSchedules.create({ from_subscription: input.subscriptionId }, { idempotencyKey: `playbound-downgrade-create-${input.requestKey}` });
  if (schedule.subscription !== input.subscriptionId || schedule.status !== "active" ||
      !schedule.current_phase || schedule.current_phase.end_date !== input.currentPeriodEnd) {
    throw new Error("Stripe schedule does not match the current billing period");
  }
  const targetPhase = schedule.phases.find((p) => p.start_date === input.currentPeriodEnd);
  const targetPrice = targetPhase?.items[0]?.price;
  if (targetPhase && (typeof targetPrice === "string" ? targetPrice : targetPrice?.id) === input.targetPriceId) {
    return { scheduleId: schedule.id, effectiveAt: new Date(input.currentPeriodEnd * 1000) };
  }
  if (schedule.phases.length > 1) throw new Error("Stripe schedule already has another future change");
  schedule = await stripe.subscriptionSchedules.update(schedule.id, {
    end_behavior: "release",
    proration_behavior: "none",
    phases: [
      { start_date: schedule.current_phase.start_date, end_date: schedule.current_phase.end_date,
        items: [{ price: input.currentPriceId, quantity: 1 }], metadata: { playbound_hold_id: input.originalHoldId } },
      { start_date: input.currentPeriodEnd, duration: { interval: "month", interval_count: 1 },
        items: [{ price: input.targetPriceId, quantity: 1 }],
        proration_behavior: "none", metadata: { playbound_hold_id: input.originalHoldId } },
    ],
  }, { idempotencyKey: `playbound-downgrade-phases-${input.requestKey}` });
  return { scheduleId: schedule.id, effectiveAt: new Date(input.currentPeriodEnd * 1000) };
}

/** Releasing a schedule preserves the subscription and its current price. */
export async function releaseStripeDowngrade(scheduleId: string, subscriptionId: string) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe secret key is not configured");
  const stripe = new Stripe(key);
  const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
  const linked = typeof schedule.subscription === "string" ? schedule.subscription : schedule.subscription?.id || schedule.released_subscription;
  if (linked !== subscriptionId || !["active", "released"].includes(schedule.status)) {
    throw new Error("Stripe schedule does not belong to this subscription");
  }
  if (schedule.status === "active") await stripe.subscriptionSchedules.release(scheduleId);
}
