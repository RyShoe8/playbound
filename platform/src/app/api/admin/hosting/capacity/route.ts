import { NextResponse } from "next/server";
import { requireAdminViewSession } from "@/lib/requireAdmin";
import { regionalInventory } from "@/lib/dedicatedHosting/capacity";
import { getTier } from "@/lib/dedicatedHosting/tier";

export async function GET(req: Request) {
  const { error } = await requireAdminViewSession();
  if (error) return error;
  const tier = await getTier();
  const regionKey = new URL(req.url).searchParams.get("region") || tier.regions[0]?.key;
  if (!regionKey || !tier.regions.some((r) => r.key === regionKey)) {
    return NextResponse.json({ error: "Unknown region" }, { status: 400 });
  }
  try {
    const inventory = await regionalInventory(regionKey);
    return NextResponse.json({ regionKey, ...inventory }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ regionKey, availableUnits: 0, availableSlots: 0, reason: "CAPACITY_UNAVAILABLE" }, { headers: { "cache-control": "no-store" } });
  }
}
