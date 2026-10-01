/**
 * PlayBound Dedicated tier configuration: load (with 1.0 defaults), validate
 * slot sizes, and decide which server profiles a tier offers.
 */
import dbConnect from "@/lib/db";
import DedicatedHostingTier from "@/lib/models/DedicatedHostingTier";
import { PLAYER_LIMIT_RECIPES } from "@/lib/communityHosting/reconcile";

export const BASIC_TIER_KEY = "basic";

/** The Basic 1.0 launch defaults. Everything here is editable in /admin/hosting. */
export const BASIC_DEFAULTS = {
  key: BASIC_TIER_KEY,
  name: "PlayBound Dedicated Basic",
  description:
    "Your slots. Your servers. Your games. Run one big server or several smaller ones, switch between supported games whenever you want, and manage everything through PlayBound.",
  salesEnabled: false,
  regions: [{ key: "us-central", label: "US Central", salesEnabled: true, latitude: 32.7767, longitude: -96.7970 }],
  packages: [
    { slots: 4, priceCents: 799, order: 0 },
    { slots: 8, priceCents: 1299, order: 1 },
    { slots: 12, priceCents: 1799, order: 2 },
    { slots: 16, priceCents: 2299, order: 3 },
    { slots: 24, priceCents: 3199, order: 4 },
    { slots: 32, priceCents: 3999, order: 5 },
  ],
  // Launch catalog. OpenRA editions are added per edition profile in admin.
  games: [
    { profileKey: "assaultcube:base", maxSlots: 16 },
    { profileKey: "bombsquad:base", maxSlots: 8 },
    { profileKey: "openra:base", maxSlots: 32 },
    { profileKey: "openttd:base", maxSlots: 32 },
    { profileKey: "xonotic:base", maxSlots: 32 },
    { profileKey: "hedgewars:base", maxSlots: 8 },
    { profileKey: "mindustry:base", maxSlots: 32 },
    { profileKey: "supertuxkart:base", maxSlots: 8 },
    { profileKey: "warzone-2100:base", maxSlots: 12 },
  ].map((g) => ({ ...g, supportedRegions: ["us-central"], readinessStatus: "draft" as const })),
};

export type TierGame = {
  profileKey: string;
  enabled: boolean;
  newServerCreationEnabled: boolean;
  existingServerStartEnabled: boolean;
  minSlots: number;
  maxSlots: number;
  slotIncrement: number;
  supportedRegions: string[];
  allowedMods: string[];
  readinessStatus: "draft" | "testing" | "verified";
  adminNote?: string | null;
};

export type HostingTier = {
  key: string;
  name: string;
  description: string;
  salesEnabled: boolean;
  startsDisabled: boolean;
  resourceClass: { key: string; slotsPerUnit: number; memoryMbPerUnit: number; cpuPerUnit: number; storageGbPerUnit: number };
  minAllocation: number;
  allocationIncrement: number;
  maxSlotsSold: number;
  maxSavedServers: number;
  backupRetention: number;
  paymentGraceHours: number;
  cancellationRetentionDays: number;
  safetyReservePercent: number;
  regions: Array<{ key: string; label: string; salesEnabled: boolean; latitude?: number | null; longitude?: number | null }>;
  packages: Array<{ slots: number; priceCents: number; currency: string; enabled: boolean; order: number; stripePriceId: string | null }>;
  stripeProductId: string | null;
  games: TierGame[];
};

/** Client-submitted Stripe IDs are never trusted. An existing ID survives only
 * when the commercial terms that created it are unchanged. */
export function preservedPackagePrices(previous: HostingTier, incoming: HostingTier["packages"]): HostingTier["packages"] {
  return incoming.map((pkg) => {
    const old = previous.packages.find((x) => x.slots === pkg.slots && x.priceCents === pkg.priceCents && x.currency.toLowerCase() === pkg.currency.toLowerCase());
    return { ...pkg, stripePriceId: old?.stripePriceId ?? null };
  });
}

/**
 * The tier as stored, or the launch defaults if admin has never saved it.
 *
 * Reading never writes: the storefront is prerendered at build time and a
 * build must not touch the database. The row is created by the first admin
 * save (saveTier).
 */
export async function getTier(key = BASIC_TIER_KEY): Promise<HostingTier> {
  await dbConnect();
  const doc = await DedicatedHostingTier.findOne({ key }).lean();
  if (doc) {
    const tier = JSON.parse(JSON.stringify(doc)) as HostingTier;
    // The original Basic row predates map coordinates. Use Dallas for this
    // known VPS region until an admin saves its precise location in the DB.
    tier.regions = tier.regions.map((region) => region.key === "us-central" && region.latitude == null && region.longitude == null
      ? { ...region, latitude: 32.7767, longitude: -96.7970 }
      : region);
    return tier;
  }
  // Materialise schema defaults without saving, so the shape is always complete.
  const draft = new DedicatedHostingTier(key === BASIC_TIER_KEY ? BASIC_DEFAULTS : { key }).toObject();
  return JSON.parse(JSON.stringify(draft)) as HostingTier;
}

/** Admin save: write the whole tier, creating it on first save. */
export async function saveTier(key: string, values: Partial<HostingTier>): Promise<HostingTier> {
  await dbConnect();
  const current = (await getTier(key)) as HostingTier & Record<string, unknown>;
  const merged: Record<string, unknown> = { ...current, ...values, key };
  for (const field of ["_id", "__v", "createdAt", "updatedAt"]) delete merged[field];
  await DedicatedHostingTier.updateOne({ key }, { $set: merged }, { upsert: true, runValidators: true });
  return getTier(key);
}

/**
 * Whether the agent can actually hold a server to its slot count.
 *
 * A slot only means something if player N+1 is refused. Recipes outside this
 * list start without a PlayBound-enforced cap; admin sees that flagged on the
 * tier's game list rather than it being hidden.
 */
export function slotCapEnforced(recipeSlug: string): boolean {
  return PLAYER_LIMIT_RECIPES.has(recipeSlug);
}

/** Valid server sizes for a game in a tier: multiples of the increment inside both ranges. */
export function allowedSlotSizes(tier: HostingTier, game: TierGame): number[] {
  const step = Math.max(tier.allocationIncrement, game.slotIncrement || 1);
  const min = Math.max(tier.minAllocation, game.minSlots || 1);
  const max = Math.min(tier.maxSlotsSold, game.maxSlots || tier.maxSlotsSold);
  const sizes: number[] = [];
  for (let s = Math.ceil(min / step) * step; s <= max; s += step) sizes.push(s);
  return sizes;
}

export function tierGame(tier: HostingTier, profileKey: string): TierGame | null {
  return tier.games.find((g) => g.profileKey === profileKey) || null;
}
