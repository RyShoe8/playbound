import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cronAuth";
import { reconcileCommunityHosting } from "@/lib/communityHosting/reconcile";
import { reconcileDedicatedServers } from "@/lib/dedicatedHosting/reconcile";

import { ensureHostingDatabaseReady, isDatabaseAvailabilityError } from "@/lib/db";

/** Paid recovery goes first; serial passes avoid competing for the same pool. */
async function runReconcile() {
  await ensureHostingDatabaseReady();
  let dedicated;
  try {
    dedicated = await reconcileDedicatedServers();
  } catch (error) {
    console.error("[dedicated-hosting] reconcile failed", error);
    // A database outage is shared by both passes. Do not start more work or
    // replay the already-attempted pass, which may have dispatched operations.
    if (isDatabaseAvailabilityError(error)) throw error;
    dedicated = { action: "failed" };
  }
  const community = await reconcileCommunityHosting();
  return { ...community, dedicated };
}

import { saveEvent } from "@/lib/telemetry/server/saveEvent";

export const maxDuration = 60;

function authorized(req: Request): boolean {
  if (cronAuthorized(req)) return true;
  const secret = process.env.GAME_HOST_SECRET;
  if (!secret) return false;
  const actual = Buffer.from(req.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await runReconcile()) });
  } catch (error) {
    console.error("[community-hosting] reconcile failed", error);
    if (isDatabaseAvailabilityError(error)) {
      // Telemetry uses the same database; another write would prolong the outage.
      // The VPS scheduler logs this response and retries on its next tick.
      return NextResponse.json({ ok: false, error: "Database temporarily unavailable", code: "DATABASE_UNAVAILABLE" }, { status: 503 });
    }
    try {
      await saveEvent({
        event: "community_server_reconcile_failed",
        properties: {
          source: "website",
          area: "hosting",
          code: "RECONCILE_THREW_EXCEPTION",
          message: error instanceof Error ? error.message : String(error),
          phase: "reconcile_cron",
        },
      });
    } catch (saveErr) {
      console.warn("[community-hosting] telemetry save failed on reconcile error:", saveErr);
    }
    return NextResponse.json({ error: "Reconciliation failed" }, { status: 500 });
  }
}

/** Both authenticated entry points share failure handling. */
export const GET = POST;
