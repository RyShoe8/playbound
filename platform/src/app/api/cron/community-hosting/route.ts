import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cronAuth";
import { reconcileCommunityHosting } from "@/lib/communityHosting/reconcile";

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
    return NextResponse.json({ ok: true, ...(await reconcileCommunityHosting()) });
  } catch (error) {
    console.error("[community-hosting] reconcile failed", error);
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

/** Vercel crons fire GET; the VPS systemd timer fires POST. */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await reconcileCommunityHosting()) });
  } catch (error) {
    console.error("[community-hosting] reconcile failed", error);
    return NextResponse.json({ error: "Reconciliation failed" }, { status: 500 });
  }
}

