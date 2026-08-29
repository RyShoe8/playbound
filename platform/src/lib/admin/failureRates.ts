import dbConnect from "@/lib/db";
import TelemetryEvent from "@/lib/models/TelemetryEvent";
import {
  FAILURE_RATE_EVENTS,
  buildFailureRates,
  emptyFailureRates,
  normalizeTelemetryPlatform,
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
            platform: { $ifNull: ["$os", { $ifNull: ["$properties.platform", "Unknown"] }] },
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
