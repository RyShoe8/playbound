import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cronAuth";
import { reconcileCommunityHosting } from "@/lib/communityHosting/reconcile";

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
    return NextResponse.json({ error: "Reconciliation failed" }, { status: 500 });
  }
}
