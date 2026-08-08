import { NextResponse } from "next/server";
import { sweepStalePresence } from "@/lib/presence/server";
import { cronAuthorized } from "@/lib/cronAuth";

export const maxDuration = 60;

/**
 * GET|POST /api/cron/presence-sweep
 *
 * Marks users offline and closes platform sessions whose heartbeat has aged
 * out. Necessary because most departures produce no `end` call: a closed
 * laptop, a lost connection or a killed tab all just stop beating.
 *
 * Scheduled every minute in vercel.json. The work is two indexed updateMany
 * calls, so running often is cheap and keeps "online" honest — a slower
 * schedule would leave people showing as online long after they left.
 */
async function run(req: Request) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await sweepStalePresence();
    if (result.presenceMarkedOffline > 0 || result.sessionsEnded > 0) {
      console.log(
        `[presence-sweep] offline=${result.presenceMarkedOffline} sessionsEnded=${result.sessionsEnded}`
      );
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[presence-sweep] failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}
