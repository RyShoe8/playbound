import dbConnect from "@/lib/db";
import TelemetryEvent from "@/lib/models/TelemetryEvent";
import { GAME_HEALTH_AREAS, type GameHealthArea, type GameHealthStatus } from "@/lib/admin/gameHealth";

/**
 * Per-game Install and Join lights, derived from telemetry.
 *
 * These used to be a stored flag: `markGameHealthYellow` set yellow on a
 * failure and nothing ever set it back, so a game that broke once in March
 * still showed yellow in August until somebody clicked it. Deriving the colour
 * from a rolling window means it clears itself when the failures stop.
 *
 * Install reuses the definition the Ops failure-rate card settled on —
 * `install_failed` against `edition_installed`, and deliberately not
 * `game_installed`/`mod_installed`, which come from library sync rather than
 * an install completing.
 *
 * Join is the party path: a room that could not be provisioned, or a launch
 * that failed while joining one. `launch_attempted` carries `phase: "join"`
 * for exactly those launches, which is what makes a denominator possible —
 * successes are attempts minus failures, since nothing emits "joined ok".
 */

/**
 * One day, not seven.
 *
 * A light is a "is this broken right now" signal. Averaged over a week, a game
 * fixed on Tuesday still shows amber on Friday, and one bad day is diluted to
 * invisibility by six good ones.
 */
export const HEALTH_WINDOW_DAYS = 1;

/** At least this many attempts before a colour means anything. */
const MIN_ATTEMPTS = 3;

/**
 * The bands.
 *
 * Under 2.5% is green, 2.5%–10% amber, above 10% red. Applied identically to
 * install, join and party so one glance across the row means the same thing in
 * every column — three columns with three different definitions of "amber" is
 * a table that has to be re-learned per column.
 */
const YELLOW_AT = 0.025;
const RED_AT = 0.1;

export type AreaHealth = {
  status: GameHealthStatus;
  failed: number;
  attempts: number;
};

export type GameHealth = Record<GameHealthArea, AreaHealth>;

const HEALTHY: AreaHealth = { status: "green", failed: 0, attempts: 0 };

export function emptyGameHealth(): GameHealth {
  return { install: HEALTHY, party: HEALTHY, partyOps: HEALTHY };
}

/**
 * Colour for one area.
 *
 * No failures is green whatever the volume. Below the minimum attempts a
 * failure is yellow rather than red — one bad install on a game nobody has
 * tried yet is not evidence the game is broken, and a table full of red is a
 * table nobody reads.
 */
export function statusFor(failed: number, attempts: number): GameHealthStatus {
  if (failed <= 0) return "green";
  if (attempts < MIN_ATTEMPTS) return "yellow";
  const rate = failed / attempts;
  if (rate > RED_AT) return "red";
  return rate >= YELLOW_AT ? "yellow" : "green";
}

/**
 * How a row counts.
 *
 *   attempt       a finished attempt that did not fail
 *   failed        a failure that is its own attempt — `install_failed` and
 *                 `party_hosted_failed` are mutually exclusive with their
 *                 success events, so each is one attempt
 *   failure_only  a failure already counted as an attempt by another event —
 *                 a failed join emits `launch_attempted` *and* `launch_failed`,
 *                 so counting both would make one join look like two
 */
type Outcome = "attempt" | "failed" | "failure_only";

type Row = {
  _id: { slug: string; area: GameHealthArea; outcome: Outcome };
  count: number;
};

export function buildGameHealth(rows: Row[]): Map<string, GameHealth> {
  const out = new Map<string, GameHealth>();
  const bump = (slug: string) => {
    const existing = out.get(slug);
    if (existing) return existing;
    const fresh: GameHealth = {
      install: { status: "green", failed: 0, attempts: 0 },
      party: { status: "green", failed: 0, attempts: 0 },
      partyOps: { status: "green", failed: 0, attempts: 0 },
    };
    out.set(slug, fresh);
    return fresh;
  };

  for (const row of rows) {
    const { slug, area, outcome } = row._id || ({} as Row["_id"]);
    if (!slug || !GAME_HEALTH_AREAS.includes(area)) continue;
    const health = bump(slug);
    if (outcome === "failed" || outcome === "failure_only") health[area].failed += row.count;
    if (outcome === "failed" || outcome === "attempt") health[area].attempts += row.count;
  }

  for (const health of out.values()) {
    for (const area of GAME_HEALTH_AREAS) {
      health[area].status = statusFor(health[area].failed, health[area].attempts);
    }
  }
  return out;
}

/**
 * One aggregation for the whole table. Classifying inside the pipeline keeps
 * this to a single pass over the window instead of four queries per game.
 */
export async function getGameHealth(
  days = HEALTH_WINDOW_DAYS
): Promise<Map<string, GameHealth>> {
  try {
    await dbConnect();
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await TelemetryEvent.aggregate<Row>([
      {
        $match: {
          event: {
            $in: [
              "install_failed",
              "edition_installed",
              "party_hosted_failed",
              "party_hosted_ready",
              "launch_attempted",
              "launch_failed",
              "party_failed",
              "party_ok",
            ],
          },
          createdAt: { $gte: since },
          "properties.gameSlug": { $type: "string", $ne: "" },
        },
      },
      {
        $project: {
          slug: "$properties.gameSlug",
          event: 1,
          // Only join-phase launches belong to the Join light; a plain Play
          // that failed is an install/launch problem, not a party one.
          isJoinPhase: { $eq: ["$properties.phase", "join"] },
        },
      },
      {
        $project: {
          slug: 1,
          area: {
            // Party-system events first: they are their own light, and must
            // not be mistaken for the Join path below.
            $cond: [
              { $in: ["$event", ["party_failed", "party_ok"]] },
              "partyOps",
              { $cond: [
              {
                $or: [
                  { $in: ["$event", ["party_hosted_failed", "party_hosted_ready"]] },
                  {
                    $and: [
                      { $in: ["$event", ["launch_attempted", "launch_failed"]] },
                      "$isJoinPhase",
                    ],
                  },
                ],
              },
              "party",
              "install",
            ] },
            ],
          },
          outcome: {
            $switch: {
              branches: [
                // Already counted as an attempt by its own launch_attempted.
                { case: { $eq: ["$event", "launch_failed"] }, then: "failure_only" },
                {
                  case: {
                    $in: ["$event", ["install_failed", "party_hosted_failed", "party_failed"]],
                  },
                  then: "failed",
                },
              ],
              default: "attempt",
            },
          },
          keep: {
            // Non-join launches are not part of either denominator here:
            // Install counts completed installs, and a plain Play failure is
            // already visible on the Ops card rather than this light.
            $cond: [
              {
                $and: [
                  { $in: ["$event", ["launch_attempted", "launch_failed"]] },
                  { $not: "$isJoinPhase" },
                ],
              },
              false,
              true,
            ],
          },
        },
      },
      { $match: { keep: true } },
      {
        $group: {
          _id: { slug: "$slug", area: "$area", outcome: "$outcome" },
          count: { $sum: 1 },
        },
      },
    ]);

    return buildGameHealth(rows);
  } catch (err) {
    // The table must still render if telemetry is unavailable.
    console.error("getGameHealth failed:", err);
    return new Map();
  }
}
