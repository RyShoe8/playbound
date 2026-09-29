import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cronAuth";
import { reconcileDedicatedBilling } from "@/lib/dedicatedHosting/billingReconcile";

export const maxDuration = 60;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await reconcileDedicatedBilling();
    return NextResponse.json({ ok: result.failed === 0, ...result }, { status: result.failed ? 503 : 200 });
  } catch (error) {
    console.error("[dedicated-billing] reconcile unavailable:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Billing reconciliation unavailable" }, { status: 503 });
  }
}
