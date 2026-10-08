import type { HostingTier } from "./tier";

export type StripeMode = "test" | "live" | "unknown" | "missing";

export function stripeMode(secret: string | undefined): StripeMode {
  if (!secret) return "missing";
  if (secret.startsWith("sk_test_")) return "test";
  if (secret.startsWith("sk_live_")) return "live";
  return "unknown";
}

/** Checkout remains closed unless the saved Basic plan and Stripe environment agree. */
export function basicSalesBlockers(
  tier: HostingTier,
  env: { secretKey?: string; webhookSecret?: string; vercelEnv?: string },
): string[] {
  const blockers: string[] = [];
  if (tier.key !== "basic") blockers.push("Paid checkout is currently available only for Basic");
  const mode = stripeMode(env.secretKey);
  if (mode === "missing" || mode === "unknown") blockers.push("Configure a valid Stripe secret key");
  if (env.vercelEnv === "production" && mode !== "live") blockers.push("Production requires a live Stripe key; use a Preview deployment for test payments");
  if (env.vercelEnv === "preview" && mode !== "test") blockers.push("Preview checkout requires a Stripe test key");
  if (!env.webhookSecret?.startsWith("whsec_")) blockers.push("Configure the Stripe webhook signing secret");
  if (!tier.stripeProductId) blockers.push("Sync this plan's prices to Stripe");
  if (!tier.regions.some((region) => region.salesEnabled)) blockers.push("Enable a sales region");
  const packages = tier.packages.filter((pkg) => pkg.enabled);
  if (!packages.length) blockers.push("Enable at least one slot package");
  if (packages.some((pkg) => pkg.priceCents <= 0 || !/^price_[a-zA-Z0-9_]+$/.test(pkg.stripePriceId || ""))) {
    blockers.push("Sync every enabled slot package to Stripe");
  }
  if (!tier.games.some((game) => game.enabled && game.newServerCreationEnabled)) blockers.push("Enable at least one game for new servers");
  return blockers;
}
