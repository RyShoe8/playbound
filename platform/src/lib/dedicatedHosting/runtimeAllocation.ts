import DedicatedSubscription from "@/lib/models/DedicatedSubscription";
import { getTier } from "./tier";
import { unitEnvelope } from "./resourceEnvelope";
import type { CustomerResourceLimits } from "@/lib/gameHost/client";

const SCOPED_RECIPES = new Set(["teeworlds", "bzflag", "hedgewars", "openttd", "luanti", "re-volt-rvgl"]);

/** Use the same plan envelope inventory reserves, never customer-editable settings. */
export async function customerRuntimeAllocation(server: { dedicatedSubscriptionId?: unknown; allocatedSlots: number }, recipe: string): Promise<CustomerResourceLimits | undefined> {
  if (!SCOPED_RECIPES.has(recipe)) return undefined;
  const sub = await DedicatedSubscription.findById(server.dedicatedSubscriptionId).select("tier").lean();
  if (!sub) throw new Error("Subscription not found for resource allocation");
  const tier = await getTier(sub.tier);
  if (!Number.isInteger(server.allocatedSlots) || server.allocatedSlots <= 0 || !Number.isFinite(tier.resourceClass.slotsPerUnit) || tier.resourceClass.slotsPerUnit <= 0) throw new Error("Invalid server resource allocation");
  const envelope = unitEnvelope(tier, server.allocatedSlots);
  const cpuMillis = Math.ceil(envelope.cpuCores * 1000);
  const memoryMiB = Math.ceil(envelope.ramBytes / 1024 ** 2);
  if (!Number.isInteger(cpuMillis) || cpuMillis < 250 || cpuMillis > 6000 || !Number.isInteger(memoryMiB) || memoryMiB < 256 || memoryMiB > 8192) throw new Error("Server allocation exceeds supported limits: 0.25–6 CPU cores and 256–8192 MiB RAM");
  return { cpuMillis, memoryMiB };
}
