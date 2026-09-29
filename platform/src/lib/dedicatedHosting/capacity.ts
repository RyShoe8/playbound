/** Regional inventory for Dedicated Basic. No payment path may bypass this
 * serialized check; free hosting sees active holds as reserved capacity too.
 */
import { randomUUID } from "node:crypto";
import { Types } from "mongoose";
import dbConnect from "@/lib/db";
import CommunityHostingConfig from "@/lib/models/CommunityHostingConfig";
import CommunityServer from "@/lib/models/CommunityServer";
import CommunityServerProfile from "@/lib/models/CommunityServerProfile";
import CapacityReservation from "@/lib/models/CapacityReservation";
import DedicatedCapacityHold from "@/lib/models/DedicatedCapacityHold";
import DedicatedCapacityLease from "@/lib/models/DedicatedCapacityLease";
import DedicatedSubscription from "@/lib/models/DedicatedSubscription";
import { fetchGameHostMetrics, type GameHostMetrics } from "@/lib/gameHost/client";
import { getTier, type HostingTier } from "./tier";

export const HOLD_MINUTES = 15;
// Stripe Checkout Sessions have a 30-minute minimum expiry. The pre-checkout
// hold is 15 minutes; once a Session exists, keep inventory for its full life
// plus webhook-delivery headroom. This cannot safely remain a 15-minute hold.
export const CHECKOUT_WEBHOOK_GRACE_MINUTES = 5;
const LEASE_MS = 120_000;
const GIB = 1024 ** 3;

type Envelope = { cpuCores: number; ramBytes: number; storageBytes: number };
type Inventory = { availableUnits: number; availableSlots: number; reason: string | null };

export function unitEnvelope(tier: HostingTier, slots: number): Envelope {
  const units = Math.ceil(slots / tier.resourceClass.slotsPerUnit);
  return {
    cpuCores: units * tier.resourceClass.cpuPerUnit,
    ramBytes: units * tier.resourceClass.memoryMbPerUnit * 1024 ** 2,
    storageBytes: units * tier.resourceClass.storageGbPerUnit * GIB,
  };
}

/** All figures are owed/reserved envelopes, not current utilization. */
export function decideInventory(input: {
  tier: HostingTier;
  budget: Envelope;
  metrics: GameHostMetrics;
  maxMetricsAgeSeconds: number;
  maxCpuPercent: number;
  maxRamPercent: number;
  minFreeRamBytes: number;
  occupied: Envelope[];
  now: Date;
}): Inventory {
  const { tier, budget, metrics, now } = input;
  const age = now.getTime() - Date.parse(metrics.collectedAt || "");
  const cpu = metrics.cpu;
  const mem = metrics.memory;
  const disk = metrics.storage?.at(-1); // Game-host's games directory, not an unrelated mount.
  if (!Number.isFinite(age) || age < -60_000 || age > input.maxMetricsAgeSeconds * 1000 ||
      !cpu?.cores || !Number.isFinite(cpu.usagePercent) || !mem?.totalBytes || !Number.isFinite(mem.freeBytes) ||
      !disk || disk.error || !Number.isFinite(disk.freeBytes) || disk.freeBytes <= 0) {
    return { availableUnits: 0, availableSlots: 0, reason: "STALE_OR_MISSING_METRICS" };
  }
  if (cpu.usagePercent! >= input.maxCpuPercent ||
      (1 - mem.freeBytes! / mem.totalBytes) * 100 >= input.maxRamPercent ||
      mem.freeBytes! <= input.minFreeRamBytes) {
    return { availableUnits: 0, availableSlots: 0, reason: "NODE_AT_SAFETY_LIMIT" };
  }
  const factor = 1 - tier.safetyReservePercent / 100;
  const total = {
    cpuCores: Math.min(budget.cpuCores, cpu.cores) * factor,
    ramBytes: Math.min(budget.ramBytes, mem.totalBytes - input.minFreeRamBytes) * factor,
    storageBytes: Math.min(budget.storageBytes, disk.freeBytes) * factor,
  };
  const used = input.occupied.reduce((sum, e) => ({
    cpuCores: sum.cpuCores + e.cpuCores,
    ramBytes: sum.ramBytes + e.ramBytes,
    storageBytes: sum.storageBytes + e.storageBytes,
  }), { cpuCores: 0, ramBytes: 0, storageBytes: 0 });
  const unit = unitEnvelope(tier, tier.resourceClass.slotsPerUnit);
  const availableUnits = Math.max(0, Math.floor(Math.min(
    (total.cpuCores - used.cpuCores) / unit.cpuCores,
    (total.ramBytes - used.ramBytes) / unit.ramBytes,
    (total.storageBytes - used.storageBytes) / unit.storageBytes,
  )));
  return { availableUnits, availableSlots: availableUnits * tier.resourceClass.slotsPerUnit, reason: availableUnits ? null : "SOLD_OUT" };
}

async function acquireRegionLease(regionKey: string): Promise<string> {
  const owner = randomUUID();
  for (let attempt = 0; attempt < 8; attempt++) {
    const now = new Date();
    try {
      const doc = await DedicatedCapacityLease.findOneAndUpdate(
        { regionKey, $or: [{ leaseUntil: { $lte: now } }, { leaseUntil: null }] },
        { $set: { owner, leaseUntil: new Date(now.getTime() + LEASE_MS) }, $setOnInsert: { regionKey } },
        { upsert: true, returnDocument: "after" }
      );
      if (doc?.owner === owner) return owner;
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === 11000)) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 75 * (attempt + 1)));
  }
  throw new Error("Region capacity is being updated; retry shortly");
}

export async function withRegionCapacityLease<T>(regionKey: string, work: () => Promise<T>): Promise<T> {
  const owner = await acquireRegionLease(regionKey);
  try { return await work(); }
  finally { await DedicatedCapacityLease.updateOne({ regionKey, owner }, { $set: { leaseUntil: new Date(0) } }); }
}

/** Fail closed on missing node/config data; count subscriptions even if a future
 * reservation backfill has not run, so existing manual grants cannot vanish.
 */
export async function regionalInventory(regionKey: string, now = new Date()): Promise<Inventory> {
  await dbConnect();
  const tier = await getTier();
  const config = await CommunityHostingConfig.findOne({ key: "global" }).lean();
  if (!config?.node.enabled || config.node.draining || config.node.regionKey !== regionKey ||
      !tier.regions.some((r) => r.key === regionKey && r.salesEnabled)) {
    return { availableUnits: 0, availableSlots: 0, reason: "REGION_UNAVAILABLE" };
  }
  const result = await fetchGameHostMetrics();
  if (!result.ok) return { availableUnits: 0, availableSlots: 0, reason: "NODE_UNREACHABLE" };

  const [subs, holds, freeServers, userServers, events] = await Promise.all([
    DedicatedSubscription.find({ regionKey, status: { $in: ["active", "past_due", "suspended"] } }).select({ _id: 1, slotCapacity: 1 }).lean(),
    DedicatedCapacityHold.find({ regionKey, state: "held", expiresAt: { $gt: now } }).select({ slots: 1 }).lean(),
    CommunityServer.find({ regionKey, ownerType: { $ne: "user" }, desiredState: "running", runtimeState: { $in: ["pending", "running"] } })
      .select({ _id: 1, profileKey: 1 }).lean(),
    // A canceled subscription can still have a room until reconcile confirms
    // it stopped. Do not sell those resources a second time in that gap.
    CommunityServer.find({ regionKey, ownerType: "user", allocatedSlots: { $gt: 0 }, $or: [{ slotsHeld: true }, { runtimeState: { $in: ["pending", "running"] } }] })
      .select({ dedicatedSubscriptionId: 1, allocatedSlots: 1 }).lean(),
    CapacityReservation.find({ regionKey, state: { $in: ["planned", "active"] }, warmupAt: { $lte: new Date(now.getTime() + HOLD_MINUTES * 60_000) }, protectedUntil: { $gt: now } })
      .select({ communityServerId: 1, cpuCores: 1, ramBytes: 1 }).lean(),
  ]);
  const profiles = await CommunityServerProfile.find({ key: { $in: freeServers.map((s) => s.profileKey) } }).select({ key: 1, envelope: 1 }).lean();
  const byProfile = new Map(profiles.map((p) => [p.key, p.envelope]));
  const runningFreeIds = new Set(freeServers.map((s) => String(s._id)));
  const countedSubIds = new Set(subs.map((s) => String(s._id)));
  const occupied: Envelope[] = [
    ...subs.map((s) => unitEnvelope(tier, s.slotCapacity)),
    ...holds.map((h) => unitEnvelope(tier, h.slots)),
    ...userServers.filter((s) => !countedSubIds.has(String(s.dedicatedSubscriptionId))).map((s) => unitEnvelope(tier, s.allocatedSlots)),
    ...freeServers.map((s) => ({
      cpuCores: Math.max(1, Number(byProfile.get(s.profileKey)?.cpuCores) || 0),
      ramBytes: Math.max(1536 * 1024 ** 2, Number(byProfile.get(s.profileKey)?.ramBytes) || 0),
      storageBytes: 0,
    })),
    ...events.filter((e) => !e.communityServerId || !runningFreeIds.has(String(e.communityServerId)))
      .map((e) => ({ cpuCores: e.cpuCores, ramBytes: e.ramBytes, storageBytes: 0 })),
  ];
  return decideInventory({
    tier,
    budget: { cpuCores: config.budget.cpuCores, ramBytes: config.budget.ramBytes, storageBytes: Number.MAX_SAFE_INTEGER },
    metrics: result.metrics,
    maxMetricsAgeSeconds: config.safety.maxMetricsAgeSeconds,
    maxCpuPercent: config.safety.maxCpuPercent,
    maxRamPercent: config.safety.maxRamPercent,
    minFreeRamBytes: config.safety.minFreeRamBytes,
    occupied,
    now,
  });
}

export async function createCapacityHold(input: { userId: string; regionKey: string; slots: number; checkoutKey: string }, now = new Date()) {
  if (!Types.ObjectId.isValid(input.userId) || !/^[a-z0-9-]{2,40}$/.test(input.regionKey) ||
      !/^[a-zA-Z0-9_-]{8,100}$/.test(input.checkoutKey)) throw new Error("Invalid capacity request");
  await dbConnect();
  return withRegionCapacityLease(input.regionKey, async () => {
    const tier = await getTier();
    if (!tier.packages.some((p) => p.enabled && p.slots === input.slots)) throw new Error("Unavailable slot package");
    const existing = await DedicatedCapacityHold.findOne({ checkoutKey: input.checkoutKey });
    if (existing) {
      if (String(existing.userId) !== input.userId || existing.regionKey !== input.regionKey || existing.slots !== input.slots) throw new Error("Checkout key already belongs to another request");
      if (existing.state !== "held" || existing.expiresAt <= now) throw new Error("Capacity hold has expired");
      return existing;
    }
    const anotherHold = await DedicatedCapacityHold.exists({ userId: input.userId, regionKey: input.regionKey, state: "held", expiresAt: { $gt: now } });
    if (anotherHold) throw new Error("An active checkout already holds capacity for this account");
    const inventory = await regionalInventory(input.regionKey, now);
    if (inventory.availableSlots < input.slots) throw new Error(inventory.reason || "SOLD_OUT");
    return DedicatedCapacityHold.create({ ...input, tier: tier.key, state: "held", expiresAt: new Date(now.getTime() + HOLD_MINUTES * 60_000) });
  });
}

export async function attachCheckoutSessionToHold(holdId: string, sessionId: string, sessionExpiresAt: Date, now = new Date()) {
  if (!Types.ObjectId.isValid(holdId) || !/^cs_[a-zA-Z0-9_]+$/.test(sessionId) ||
      !Number.isFinite(sessionExpiresAt.getTime()) || sessionExpiresAt.getTime() < now.getTime() + 29 * 60_000 ||
      sessionExpiresAt.getTime() > now.getTime() + 24 * 60 * 60_000) throw new Error("Invalid checkout session");
  await dbConnect();
  const initial = await DedicatedCapacityHold.findById(holdId).select({ regionKey: 1 }).lean();
  if (!initial) throw new Error("Capacity hold not found");
  return withRegionCapacityLease(initial.regionKey, async () => {
    const hold = await DedicatedCapacityHold.findById(holdId);
    if (!hold || hold.state !== "held" || hold.expiresAt <= now) throw new Error("Capacity hold has expired");
    if (hold.checkoutSessionId && hold.checkoutSessionId !== sessionId) throw new Error("Capacity hold already has a checkout session");
    hold.checkoutSessionId = sessionId;
    hold.expiresAt = new Date(sessionExpiresAt.getTime() + CHECKOUT_WEBHOOK_GRACE_MINUTES * 60_000);
    await hold.save();
    return hold;
  });
}

export async function releaseCapacityHold(holdId: string, now = new Date()) {
  if (!Types.ObjectId.isValid(holdId)) return false;
  await dbConnect();
  const initial = await DedicatedCapacityHold.findById(holdId).select({ regionKey: 1 }).lean();
  if (!initial) return false;
  return withRegionCapacityLease(initial.regionKey, async () => {
    const result = await DedicatedCapacityHold.updateOne({ _id: holdId, state: "held" }, { $set: { state: "released", releasedAt: now } });
    return result.modifiedCount === 1;
  });
}
