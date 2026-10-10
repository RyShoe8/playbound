import { unstable_cache } from "next/cache";
import dbConnect from "@/lib/db";
import TelemetryEvent from "@/lib/models/TelemetryEvent";
import { getPeriodWindows, periodDocumentCounts } from "@/lib/admin/analyticsPeriods";
import { normalizeTimeZone } from "@/lib/admin/zonedTime";

/** No viewer data is cached. Bot inclusion is part of the cache key. */
export async function computeAnalyticsSummary(includeBots: boolean, timeZone = "UTC") {
  await dbConnect();
  // Day boundaries and the daily chart follow the viewer's calendar, not the server's.
  const tz = normalizeTimeZone(timeZone);
  const { d7, d14 } = getPeriodWindows(new Date(), tz);
  const botCondition = includeBots ? {} : { isBot: { $ne: true } };
  const distinctCount = async (field: string, createdAt: Record<string, Date>) => {
    // Count on Mongo instead of transferring potentially thousands of IDs.
    const rows = await TelemetryEvent.aggregate<{ count: number }>([
      { $match: { ...botCondition, createdAt, [field]: { $nin: [null, ""] } } },
      { $group: { _id: "$" + field } },
      { $count: "count" },
    ]);
    return rows[0]?.count ?? 0;
  };
  const [counts, uniqueSessions7d, identifiedUsers7d, uniqueSessions7dPrev,
    identifiedUsers7dPrev, topEvents, dailyVolume] = await Promise.all([
    periodDocumentCounts(TelemetryEvent, botCondition, tz),
    distinctCount("sessionId", { $gte: d7 }),
    distinctCount("userId", { $gte: d7 }),
    distinctCount("sessionId", { $gte: d14, $lt: d7 }),
    distinctCount("userId", { $gte: d14, $lt: d7 }),
    TelemetryEvent.aggregate<{ _id: string; count: number }>([
      { $match: { ...botCondition, createdAt: { $gte: d7 } } },
      { $group: { _id: "$event", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 15 },
    ]),
    TelemetryEvent.aggregate<{ _id: string; count: number }>([
      { $match: { ...botCondition, createdAt: { $gte: d14 } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: tz } },
        count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
  ]);
  return {
    eventsToday: counts.day, events7d: counts.week, events30d: counts.month,
    eventsTodayPrev: counts.dayPrev, events7dPrev: counts.weekPrev,
    events30dPrev: counts.monthPrev, uniqueSessions7d, identifiedUsers7d,
    uniqueSessions7dPrev, identifiedUsers7dPrev, topEvents, dailyVolume,
  };
}

export const loadAnalyticsSummary = unstable_cache(
  computeAnalyticsSummary, ["admin-analytics-summary-v2"], { revalidate: 60 }
);

