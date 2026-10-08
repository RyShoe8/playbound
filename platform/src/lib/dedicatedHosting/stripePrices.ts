/** Explicit, admin-triggered synchronization of a hosting tier's catalog prices.
 * This never enables sales or changes prices on existing subscriptions.
 */
import { createHash } from "node:crypto";
import dbConnect from "@/lib/db";
import DedicatedHostingTier from "@/lib/models/DedicatedHostingTier";
import { getTier, HOSTING_TIER_KEYS, saveTier, type HostingTierKey } from "./tier";

type StripeObject = { id: string; active?: boolean; product?: string; unit_amount?: number; currency?: string; recurring?: { interval?: string } };

function key(parts: unknown[]): string {
  return `playbound-basic-${createHash("sha256").update(JSON.stringify(parts)).digest("hex")}`;
}

async function stripeRequest(path: string, method: "GET" | "POST", fields?: Record<string, string>, idempotencyKey?: string): Promise<StripeObject> {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error("Stripe secret key is not configured");
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(fields ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: fields ? new URLSearchParams(fields) : undefined,
    cache: "no-store",
  });
  const data = await response.json() as StripeObject & { error?: { message?: string } };
  if (!response.ok || !data.id) throw new Error(data.error?.message || `Stripe returned ${response.status}`);
  return data;
}

function matchesPrice(price: StripeObject, productId: string, cents: number, currency: string): boolean {
  return price.active !== false && price.product === productId && price.unit_amount === cents &&
    price.currency?.toLowerCase() === currency.toLowerCase() && price.recurring?.interval === "month";
}

export async function syncTierStripePrices(tierKey: HostingTierKey): Promise<{ productId: string; synced: number; created: number }> {
  if (!HOSTING_TIER_KEYS.includes(tierKey)) throw new Error("Unknown hosting tier");
  await dbConnect();
  const tier = await getTier(tierKey);
  if (tier.salesEnabled) throw new Error("Pause sales before synchronizing prices");
  if (!tier.packages.length) throw new Error("Configure at least one package first");
  if (new Set(tier.packages.map((p) => p.slots)).size !== tier.packages.length) throw new Error("Duplicate slot packages");
  // getTier can return unsaved defaults; persist those before claiming a product.
  if (!(await DedicatedHostingTier.exists({ key: tier.key }))) await saveTier(tier.key, {});

  let productId = tier.stripeProductId;
  if (productId) {
    const product = await stripeRequest(`products/${encodeURIComponent(productId)}`, "GET");
    if (product.active === false) throw new Error("Stripe product is archived");
  } else {
    const product = await stripeRequest("products", "POST", {
      name: tier.name,
      "metadata[playbound_tier]": tier.key,
    }, key(["product", tier.key]));
    productId = product.id;
    const claimed = await DedicatedHostingTier.updateOne({ key: tier.key, stripeProductId: null }, { $set: { stripeProductId: productId } });
    if (claimed.modifiedCount !== 1) {
      const current = await getTier(tierKey);
      if (current.stripeProductId !== productId) throw new Error("Tier changed during Stripe product sync; retry");
    }
  }

  let synced = 0;
  let created = 0;
  for (const pkg of tier.packages) {
    if (!pkg.enabled) continue;
    if (pkg.priceCents <= 0 || !/^[a-z]{3}$/i.test(pkg.currency)) throw new Error(`Invalid price for ${pkg.slots} slots`);
    // If admin changed the amount after this request started, the conditional
    // update below cannot attach the obsolete Stripe Price to the new amount.
    const current = await getTier(tierKey);
    const latest = current.packages.find((p) => p.slots === pkg.slots);
    if (!latest || latest.priceCents !== pkg.priceCents || latest.currency !== pkg.currency || !latest.enabled) {
      throw new Error(`Package ${pkg.slots} changed during sync; retry`);
    }
    let priceId = latest.stripePriceId;
    if (priceId) {
      const remote = await stripeRequest(`prices/${encodeURIComponent(priceId)}`, "GET");
      if (!matchesPrice(remote, productId, pkg.priceCents, pkg.currency)) priceId = null;
    }
    if (!priceId) {
      const price = await stripeRequest("prices", "POST", {
        product: productId,
        unit_amount: String(pkg.priceCents),
        currency: pkg.currency.toLowerCase(),
        "recurring[interval]": "month",
        "metadata[playbound_tier]": tier.key,
        "metadata[slots]": String(pkg.slots),
      }, key(["price", productId, pkg.slots, pkg.priceCents, pkg.currency.toLowerCase()]));
      if (!matchesPrice(price, productId, pkg.priceCents, pkg.currency)) throw new Error(`Stripe returned a mismatched price for ${pkg.slots} slots`);
      priceId = price.id;
      created++;
    }
    if (priceId !== latest.stripePriceId) {
      const updated = await DedicatedHostingTier.updateOne({
        key: tier.key,
        packages: { $elemMatch: { slots: pkg.slots, priceCents: pkg.priceCents, currency: pkg.currency, enabled: true } },
      }, { $set: { "packages.$.stripePriceId": priceId } });
      if (updated.modifiedCount !== 1) throw new Error(`Package ${pkg.slots} changed during sync; retry`);
    }
    synced++;
  }
  return { productId, synced, created };
}

/** Preserve the original Basic-only entry point for existing callers. */
export const syncBasicStripePrices = () => syncTierStripePrices("basic");
