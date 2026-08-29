import dbConnect from "@/lib/db";
import TelemetryEvent from "@/lib/models/TelemetryEvent";
import {
  FAILURE_RATE_EVENTS,
  buildFailureRates,
  emptyFailureRates,
  type EventCounts,
  type FailureRates,
} from "./failureRateShared";

/*
 * The database half. Everything pure — shapes, window labels and the
 * aggregation — lives in failureRateShared.ts so a client component can import
 * it without dragging mongoose into the browser bundle, and is re-exported
 * here so server callers and tests keep importing from one place.
 */
export * from "./failureRateShared";

/**
 * A field that is present but says nothing. `parseUserAgent` returns the
 * *string* `"unknown"` when there is no User-Agent to read, so `os` is almost
 * never null — which made the previous `$ifNull: ["$os", …]` chain dead code
 * in exactly the case it existed for. An event carrying a perfectly good
 * `properties.platform` still bucketed as Unknown because `os` held "unknown".
 */
const absent = (field: string) => ({
  $in: [{ $toLower: { $toString: { $ifNull: [field, ""] } } }, ["", "unknown", "null", "undefined"]],
});

const usable = (field: string) => ({ $cond: [absent(field), null, field] });

/**
 * Which platform a row is attributed to.
 *
 * Ordered by how much the source actually knows: `os` is derived from the
 * User-Agent or the launcher's own report, `properties.platform` is what a
 * server-side caller passed explicitly, and the last step is a label rather
 * than a guess.
 *
 * "Server" and "Unknown" are deliberately different answers. Party operations
 * run on the server on a party's behalf and have no client OS to record, so
 * calling them Unknown reads as failed detection and invites the conclusion
 * that macOS and Linux are being mislabelled. They are not — the launcher
 * reports `macos`/`linux` and both map correctly. Unknown now means only what
 * it says: a client event whose platform we could not determine.
 */
export const PLATFORM_EXPR = {
  $let: {
    vars: { os: usable("$os"), prop: usable("$properties.platform") },
    in: {
      $ifNull: [
        "$$os",
        {
          $ifNull: [
            "$$prop",
            { $cond: [{ $eq: ["$properties.origin", "server"] }, "Server", "Unknown"] },
          ],
        },
      ],
    },
  },
} as const;

export async function getFailureRates(
  opts: { gameSlug?: string | null; now?: Date } = {}
): Promise<FailureRates> {
  try {
    await dbConnect();
    const now = opts.now ?? new Date();
    const day = 24 * 60 * 60 * 1000;
    const since30 = new Date(now.getTime() - 30 * day);
    const since7 = new Date(now.getTime() - 7 * day);
    const since1 = new Date(now.getTime() - day);

    // Scoped to one game when the console is filtered to one, so drilling in
    // from a health light does not show the whole catalog's numbers.
    const gameSlug = String(opts.gameSlug || "").trim();

    const rows = await TelemetryEvent.aggregate<EventCounts>([
      {
        $match: {
          event: { $in: Object.values(FAILURE_RATE_EVENTS) },
          createdAt: { $gte: since30 },
          ...(gameSlug ? { "properties.gameSlug": gameSlug } : {}),
        },
      },
      {
        $group: {
          _id: {
            event: "$event",
            platform: PLATFORM_EXPR,
          },
          d1: { $sum: { $cond: [{ $gte: ["$createdAt", since1] }, 1, 0] } },
          d7: { $sum: { $cond: [{ $gte: ["$createdAt", since7] }, 1, 0] } },
          d30: { $sum: 1 },
        },
      },
    ]);

    return buildFailureRates(rows);
  } catch (err) {
    // Ops is a diagnostic page; a telemetry read failing should not take it
    // down when the live event feed below still works.
    console.error("getFailureRates failed:", err);
    return emptyFailureRates();
  }
}
