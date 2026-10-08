import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdminSession } from "@/lib/requireAdmin";
import { syncTierStripePrices } from "@/lib/dedicatedHosting/stripePrices";
import { HOSTING_TIER_KEYS, type HostingTierKey } from "@/lib/dedicatedHosting/tier";
import { HOSTING_TIER_TAG } from "@/lib/dedicatedHosting/publicTier";

export async function POST(req: Request) {
  const { error } = await requireAdminSession();
  if (error) return error;
  const body = await req.json().catch(() => ({}));
  const tierKey = body?.tier ?? "basic";
  if (!HOSTING_TIER_KEYS.includes(tierKey)) return NextResponse.json({ error: "Unknown hosting tier" }, { status: 400 });
  try {
    const result = await syncTierStripePrices(tierKey as HostingTierKey);
    revalidateTag(HOSTING_TIER_TAG, { expire: 0 });
    return NextResponse.json({ ok: true, tier: tierKey, ...result });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Stripe price sync failed" }, { status: 409 });
  }
}
