import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdminSession } from "@/lib/requireAdmin";
import { syncBasicStripePrices } from "@/lib/dedicatedHosting/stripePrices";
import { HOSTING_TIER_TAG } from "@/lib/dedicatedHosting/publicTier";

export async function POST() {
  const { error } = await requireAdminSession();
  if (error) return error;
  try {
    const result = await syncBasicStripePrices();
    revalidateTag(HOSTING_TIER_TAG, { expire: 0 });
    return NextResponse.json({ ok: true, ...result });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Stripe price sync failed" }, { status: 409 });
  }
}
