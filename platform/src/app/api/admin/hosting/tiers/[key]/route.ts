import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import dbConnect from "@/lib/db";
import { requireAdminSession } from "@/lib/requireAdmin";
import CommunityServerProfile from "@/lib/models/CommunityServerProfile";
import { getTier, preservedPackagePrices, saveTier, slotCapEnforced } from "@/lib/dedicatedHosting/tier";
import { HOSTING_TIER_TAG } from "@/lib/dedicatedHosting/publicTier";
import { getEffectiveEnvelope } from "@/lib/communityHosting/reconcile";

type Ctx = { params: Promise<{ key: string }> };

const count = z.number().int().min(0);
const tierSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(2000),
  salesEnabled: z.boolean(),
  startsDisabled: z.boolean(),
  resourceClass: z.object({
    key: z.string().min(1).max(40),
    slotsPerUnit: count.min(1),
    memoryMbPerUnit: count,
    cpuPerUnit: z.number().min(0).max(64),
    storageGbPerUnit: count,
  }),
  minAllocation: count.min(1),
  allocationIncrement: count.min(1),
  maxSlotsSold: count.min(1).max(512),
  maxSavedServers: count.min(1).max(100),
  backupRetention: count.max(50),
  paymentGraceHours: count.max(24 * 60),
  cancellationRetentionDays: count.max(365),
  safetyReservePercent: z.number().min(0).max(90),
  regions: z.array(z.object({ key: z.string().regex(/^[a-z0-9-]{2,40}$/), label: z.string().min(1).max(60), salesEnabled: z.boolean() })).max(20),
  packages: z.array(z.object({
    slots: count.min(1).max(512),
    priceCents: count.max(1_000_000),
    currency: z.string().length(3).default("usd"),
    enabled: z.boolean(),
    order: z.number().int(),
    // The client never chooses a Stripe Price. It is preserved only when the
    // saved amount, currency and slot count still match the previous package.
    stripePriceId: z.string().nullable().default(null),
  })).max(20),
  games: z.array(z.object({
    profileKey: z.string().regex(/^[a-z0-9_-]+:[a-z0-9_.-]+$/),
    enabled: z.boolean(),
    newServerCreationEnabled: z.boolean(),
    existingServerStartEnabled: z.boolean(),
    minSlots: count.min(1),
    maxSlots: count.min(1),
    slotIncrement: count.min(1),
    supportedRegions: z.array(z.string()).max(20),
    allowedMods: z.array(z.string()).max(200),
    readinessStatus: z.enum(["draft", "testing", "verified"]),
    adminNote: z.string().max(500).nullable().optional(),
  })).max(200),
});

/**
 * GET — the tier, plus what admin needs to judge each game: whether the agent
 * enforces the slot cap for its recipe, and its measured resource fit against
 * one resource unit.
 */
export async function GET(_req: Request, ctx: Ctx) {
  const { error } = await requireAdminSession();
  if (error) return error;
  const { key } = await ctx.params;
  const tier = await getTier(key);
  await dbConnect();
  const profiles = await CommunityServerProfile.find({}).select({ key: 1, gameSlug: 1, editionSlug: 1, recipeSlug: 1, envelope: 1, sampleCount: 1, verification: 1 }).lean();
  const rc = tier.resourceClass;
  const unitRam = rc.memoryMbPerUnit * 1024 * 1024;
  const profileInfo = profiles.map((p) => {
    const env = getEffectiveEnvelope(p.envelope, p.gameSlug, p.sampleCount);
    const worst = Math.max(env.cpuCores / Math.max(rc.cpuPerUnit, 1e-9), env.ramBytes / Math.max(unitRam, 1));
    return {
      key: p.key,
      gameSlug: p.gameSlug,
      editionSlug: p.editionSlug || null,
      recipeSlug: p.recipeSlug,
      verification: p.verification,
      capEnforced: slotCapEnforced(p.recipeSlug || p.gameSlug),
      samples: p.sampleCount || 0,
      cpuCores: env.cpuCores,
      ramBytes: env.ramBytes,
      // Measured envelopes are padded peaks across all observed player counts.
      fit: !p.sampleCount ? "unknown" : worst <= 0.8 ? "safe" : worst <= 1 ? "warning" : "exceeds",
    };
  });
  return NextResponse.json({ tier, profiles: profileInfo });
}

export async function PUT(req: Request, ctx: Ctx) {
  const { error } = await requireAdminSession();
  if (error) return error;
  const { key } = await ctx.params;
  const parsed = tierSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: `${issue?.path.join(".") || "tier"}: ${issue?.message || "invalid"}` }, { status: 400 });
  }
  for (const g of parsed.data.games) {
    if (g.minSlots > g.maxSlots) return NextResponse.json({ error: `${g.profileKey}: minimum slots exceed maximum` }, { status: 400 });
  }
  if (new Set(parsed.data.packages.map((p) => p.slots)).size !== parsed.data.packages.length) {
    return NextResponse.json({ error: "Each slot package must have a unique slot count" }, { status: 400 });
  }
  // Keep sales fail-closed until the remaining billing flows, persistent-data
  // backups, game readiness tests and launch acceptance checks are complete.
  if (parsed.data.salesEnabled) {
    return NextResponse.json({ error: "Sales remain closed until the Dedicated Basic launch checks are complete" }, { status: 409 });
  }
  const previous = await getTier(key);
  const packages = preservedPackagePrices(previous, parsed.data.packages);
  const tier = await saveTier(key, { ...parsed.data, packages });
  revalidateTag(HOSTING_TIER_TAG, { expire: 0 });
  return NextResponse.json({ ok: true, tier });
}
