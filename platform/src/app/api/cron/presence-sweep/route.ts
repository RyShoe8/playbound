import { NextResponse } from "next/server";
import { sweepStalePresence } from "@/lib/presence/server";
import { expireStalePlayInvites } from "@/lib/playTogether/invites";
import { dropOfflinePartyMembers, sweepStaleParties } from "@/lib/playTogether/party";
import { cronAuthorized } from "@/lib/cronAuth";

export const maxDuration = 60;

/**
 * GET|POST /api/cron/presence-sweep
 *
 * Marks users offline and closes platform sessions whose heartbeat has aged
 * out. Also expires stale play invites and LFG flags, and drops offline
 * members from live parties.
 */
async function run(req: Request) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await sweepStalePresence();
    const [invites, parties, dropped] = await Promise.all([
      expireStalePlayInvites(),
      sweepStaleParties(),
      dropOfflinePartyMembers(),
    ]);
    if (
      result.presenceMarkedOffline > 0 ||
      result.sessionsEnded > 0 ||
      (result as { lfgCleared?: number }).lfgCleared ||
      invites.expired ||
      parties.ended ||
      dropped.dropped
    ) {
      console.log(
        `[presence-sweep] offline=${result.presenceMarkedOffline} sessionsEnded=${result.sessionsEnded} lfgCleared=${(result as { lfgCleared?: number }).lfgCleared || 0} invitesExpired=${invites.expired} partiesEnded=${parties.ended} partyMembersDropped=${dropped.dropped}`
      );
    }
    return NextResponse.json({
      ok: true,
      ...result,
      invitesExpired: invites.expired,
      partiesEnded: parties.ended,
      partyMembersDropped: dropped.dropped,
    });
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
