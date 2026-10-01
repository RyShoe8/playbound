import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import dbConnect from "@/lib/db";
import { requireAdminSession, requireAdminViewSession } from "@/lib/requireAdmin";
import CommunityServerProfile from "@/lib/models/CommunityServerProfile";
import { getTier, preservedPackagePrices, saveTier, slotCapEnforced, HOSTING_TIER_KEYS, includeHigherTierGamesInLowerTiers, retainHigherTierSelections, type HostingTierKey } from "@/lib/dedicatedHosting/tier";
import { HOSTING_TIER_TAG } from "@/lib/dedicatedHosting/publicTier";
import { HOSTING_INVENTORY_TAG } from "@/lib/dedicatedHosting/inventory";
import { getEffectiveEnvelope } from "@/lib/communityHosting/reconcile";
import { hostableProfileStubs, loadHostableEditionRefs, loadHostableCatalogRefs, readyPublishedHostableCatalog } from "@/lib/dedicatedHosting/hostableProfiles";
import { fetchGameHostHealth } from "@/lib/gameHost/client";

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
  regions: z.array(z.object({
    key: z.string().regex(/^[a-z0-9-]{2,40}$/),
    label: z.string().min(1).max(60),
    salesEnabled: z.boolean(),
    latitude: z.number().min(24).max(50).nullable().optional(),
    longitude: z.number().min(-125).max(-66).nullable().optional(),
  })).max(20),
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
  const { error } = await requireAdminViewSession();
  if (error) return error;
  const { key } = await ctx.params;
  if (!HOSTING_TIER_KEYS.includes(key as HostingTierKey)) return NextResponse.json({ error: "Unknown hosting tier" }, { status: 404 });
  const tier = await getTier(key);
  await dbConnect();
  const profiles = await CommunityServerProfile.find({}).select({ key: 1, gameSlug: 1, editionSlug: 1, recipeSlug: 1, envelope: 1, sampleCount: 1, verification: 1, queryVerified: 1, joinVerified: 1, lastVerifiedAt: 1 }).lean();
  const rc = tier.resourceClass;
  const unitRam = rc.memoryMbPerUnit * 1024 * 1024;
  // Hostable games with no stored row yet are listed too, so admin can pick them.
  const [editionRefs, catalogRefs, health] = await Promise.all([loadHostableEditionRefs(), loadHostableCatalogRefs(), fetchGameHostHealth()]);
  const readySlugs = new Set(health.configured ? Object.entries(health.health.gameStatus || {})
    .filter(([, status]) => status.ready).map(([slug]) => slug) : []);
  const eligible = readyPublishedHostableCatalog(catalogRefs, editionRefs, profiles, readySlugs);
  const eligibleKeys = new Set([
    ...eligible.games.map((game) => `${game.slug}:base`),
    ...eligible.editions.map((edition) => `${edition.gameSlug}:${edition.slug}`),
  ]);
  const stubs = hostableProfileStubs(profiles, eligible.editions, eligible.games.map((game) => game.slug));
  const allProfiles = [
    ...profiles.filter((p) => eligibleKeys.has(p.key)).map((p) => ({ ...p, stored: true })),
    ...stubs.map((s) => ({ ...s, stored: false, envelope: undefined, sampleCount: 0, verification: "testing", queryVerified: false, joinVerified: false, lastVerifiedAt: null })),
  ];
  const titleBySlug = new Map(eligible.games.map((game) => [game.slug, game.title]));
  const editionNameByKey = new Map(eligible.editions.map((edition) => [`${edition.gameSlug}:${edition.slug}`, edition.name || edition.slug]));
  const profileInfo = allProfiles.map((p) => {
    const env = getEffectiveEnvelope(p.envelope, p.gameSlug, p.sampleCount);
    const worst = Math.max(env.cpuCores / Math.max(rc.cpuPerUnit, 1e-9), env.ramBytes / Math.max(unitRam, 1));
    return {
      key: p.key,
      stored: p.stored,
      gameSlug: p.gameSlug,
      title: titleBySlug.get(p.gameSlug) || p.gameSlug,
      editionName: p.editionSlug ? editionNameByKey.get(`${p.gameSlug}:${p.editionSlug}`) || p.editionSlug : null,
      editionSlug: p.editionSlug || null,
      recipeSlug: p.recipeSlug,
      verification: p.verification,
      queryVerified: Boolean(p.queryVerified),
      joinVerified: Boolean(p.joinVerified),
      measuredThroughPlayers: p.envelope?.measuredThroughPlayers || 0,
      lastVerifiedAt: p.lastVerifiedAt || null,
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
  if (!HOSTING_TIER_KEYS.includes(key as HostingTierKey)) return NextResponse.json({ error: "Unknown hosting tier" }, { status: 404 });
  const parsed = tierSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: `${issue?.path.join(".") || "tier"}: ${issue?.message || "invalid"}` }, { status: 400 });
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
  const previouslySelected = new Set(previous.games.filter((game) => game.enabled).map((game) => game.profileKey));
  const newSelections = parsed.data.games.filter((game) => game.enabled && !previouslySelected.has(game.profileKey));
  if (newSelections.length) {
    const [catalogRefs, editionRefs, stored, health] = await Promise.all([
      loadHostableCatalogRefs(), loadHostableEditionRefs(),
      CommunityServerProfile.find({}).select("key gameSlug editionSlug").lean(),
      fetchGameHostHealth(),
    ]);
    const ready = new Set(health.configured ? Object.entries(health.health.gameStatus || {})
      .filter(([, status]) => status.ready).map(([slug]) => slug) : []);
    const eligible = readyPublishedHostableCatalog(catalogRefs, editionRefs, stored, ready);
    const keys = new Set([...eligible.games.map((game) => `${game.slug}:base`),
      ...eligible.editions.map((edition) => `${edition.gameSlug}:${edition.slug}`)]);
    const ineligible = newSelections.find((game) => !keys.has(game.profileKey));
    if (ineligible) return NextResponse.json({ error: `${ineligible.profileKey} must be published and VPS-ready before subscription enrollment` }, { status: 409 });
  }
  const packages = preservedPackagePrices(previous, parsed.data.packages);
  const inheritedGames = await retainHigherTierSelections(key as HostingTierKey, { ...previous, ...parsed.data, packages });
  const tier = await saveTier(key, { ...parsed.data, packages, games: inheritedGames });
  await includeHigherTierGamesInLowerTiers(key as HostingTierKey, tier.games);
  revalidateTag(HOSTING_TIER_TAG, { expire: 0 });
  revalidateTag(HOSTING_INVENTORY_TAG, { expire: 0 });
  return NextResponse.json({ ok: true, tier });
}
