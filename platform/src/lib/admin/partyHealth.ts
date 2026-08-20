import dbConnect from "@/lib/db";
import TelemetryEvent from "@/lib/models/TelemetryEvent";
import type { FailureWindow, Tally } from "@/lib/admin/failureRates";

/**
 * Party failure rate for the Ops console.
 *
 * The party system had almost no failure telemetry: two events out of every
 * way it can break. Discord channels that never got provisioned, overlays that
 * never came up, config-syncs that threw — all `console.warn` and a `false`
 * return, invisible to anyone not tailing server logs. Players saw the symptom
 * ("you don't have the game") with nothing on record explaining it.
 *
 * `party_failed` is now emitted for all of them with an `area`, so this is one
 * query rather than a list of event names to remember. The area breakdown is
 * what makes it actionable — "12 failures" is noise, "12 failures, all Discord"
 * points at the bot.
 */

export const PARTY_HEALTH_EVENTS = {
  failed: "party_failed",
  /* Successful party operations worth measuring against. Deliberately not every
   * party event: joins and readies succeed constantly and would bury the rate. */
  ok: "party_ok",
  hostedReady: "party_hosted_ready",
  lanReady: "party_lan_ready",
  joinGame: "party_join_game",
} as const;

export type PartyArea = "discord" | "sync" | "host" | "lan" | "chat" | "launch" | "membership";

export type PartyHealth = Record<
  FailureWindow,
  {
    overall: Tally;
    /** Failures per area in this window, largest first. Empty when clean. */
    byArea: Array<{ area: string; failed: number }>;
  }
>;

function tally(failed: number, completed: number): Tally {
  const total = failed + completed;
  return { failed, completed, rate: total > 0 ? (failed / total) * 100 : null };
}

const EMPTY = { failed: 0, completed: 0, rate: null } as Tally;

export function emptyPartyHealth(): PartyHealth {
  return {
    d1: { overall: EMPTY, byArea: [] },
    d7: { overall: EMPTY, byArea: [] },
    d30: { overall: EMPTY, byArea: [] },
  };
}

export type PartyEventRow = {
  _id: { event: string; area?: string | null };
  d1: number;
  d7: number;
  d30: number;
};

export function buildPartyHealth(rows: PartyEventRow[]): PartyHealth {
  const windows: FailureWindow[] = ["d1", "d7", "d30"];
  const out = emptyPartyHealth();

  for (const w of windows) {
    let failed = 0;
    let completed = 0;
    const areas = new Map<string, number>();

    for (const row of rows) {
      const n = row[w] ?? 0;
      if (n === 0) continue;
      if (row._id.event === PARTY_HEALTH_EVENTS.failed) {
        failed += n;
        const area = row._id.area || "unknown";
        areas.set(area, (areas.get(area) ?? 0) + n);
      } else {
        completed += n;
      }
    }

    out[w] = {
      overall: tally(failed, completed),
      byArea: [...areas.entries()]
        .map(([area, n]) => ({ area, failed: n }))
        .sort((a, b) => b.failed - a.failed),
    };
  }

  return out;
}

/** One pass over 30 days, bucketed — same shape as getFailureRates. */
export async function getPartyHealth(
  opts: { gameSlug?: string | null; now?: Date } = {}
): Promise<PartyHealth> {
  try {
    await dbConnect();
    const now = opts.now ?? new Date();
    const day = 24 * 60 * 60 * 1000;
    const since30 = new Date(now.getTime() - 30 * day);
    const since7 = new Date(now.getTime() - 7 * day);
    const since1 = new Date(now.getTime() - day);
    const gameSlug = String(opts.gameSlug || "").trim();

    const rows = await TelemetryEvent.aggregate<PartyEventRow>([
      {
        $match: {
          event: { $in: Object.values(PARTY_HEALTH_EVENTS) },
          createdAt: { $gte: since30 },
          ...(gameSlug ? { "properties.gameSlug": gameSlug } : {}),
        },
      },
      {
        $group: {
          _id: { event: "$event", area: "$properties.area" },
          d1: { $sum: { $cond: [{ $gte: ["$createdAt", since1] }, 1, 0] } },
          d7: { $sum: { $cond: [{ $gte: ["$createdAt", since7] }, 1, 0] } },
          d30: { $sum: 1 },
        },
      },
    ]);

    return buildPartyHealth(rows);
  } catch (err) {
    // Ops stays up when a telemetry read does not — same contract as the
    // install/launch card beside it.
    console.error("getPartyHealth failed:", err);
    return emptyPartyHealth();
  }
}
