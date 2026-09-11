import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cronAuth";
import {
  requestDiscordProvisionAll,
  requestDiscordReconcile,
} from "@/lib/discordProvision";

export const maxDuration = 300;

/**
 * GET|POST /api/cron/discord-channels — daily, 03:20 UTC.
 *
 * Two passes against the Discord bot, in order:
 *
 *   1. provision-all — creates channels for published games that have none.
 *   2. reconcile     — renames/re-parents published channels, deletes channels
 *                      for games that are not published, and removes orphan
 *                      text channels under GAME CHANNELS letter buckets.
 *
 * Provisioning runs first so a game that was published today gets its channel
 * before the reconcile pass looks for drift, which keeps it out of the
 * "unprovisioned" report for a day.
 *
 * Failures are reported rather than thrown: a Discord outage should leave a
 * log line, not a retrying cron.
 *
 * Pass ?dryRun=1 to get the reconcile report with nothing applied.
 */
async function run(req: Request) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";

  const out: Record<string, unknown> = { ok: true, dryRun };

  if (!dryRun) {
    try {
      out.provision = await requestDiscordProvisionAll();
    } catch (err) {
      out.provisionError = err instanceof Error ? err.message : String(err);
      console.error("[discord-channels] provision-all failed:", err);
    }
  }

  try {
    out.reconcile = await requestDiscordReconcile({ dryRun });
  } catch (err) {
    out.reconcileError = err instanceof Error ? err.message : String(err);
    console.error("[discord-channels] reconcile failed:", err);
  }

  return NextResponse.json(out);
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}
