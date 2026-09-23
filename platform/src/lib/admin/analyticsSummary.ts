import { unstable_cache } from "next/cache";
import dbConnect from "@/lib/db";
import TelemetryEvent from "@/lib/models/TelemetryEvent";
import { daysAgo, periodDocumentCounts } from "@/lib/admin/analyticsPeriods";
import { PINNED_ANALYTICS_EVENTS } from "@/lib/admin/opsEvents";

/** No viewer data is cached. Bot inclusion is part of the cache key. */
export async function computeAnalyticsSummary(includeBots: boolean) {
  await dbConnect();
  const d7 = daysAgo(7);
  const d14 = daysAgo(14);
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
  /*
   * Counts for the pinned operational events, in the same 7-day window as
   * topEvents plus an all-time total.
   *
   * The all-time figure is what makes a zero readable. "0 this week" on its own
   * cannot distinguish a quiet week from an event that has never once arrived,
   * and for launcher_install — which fires at most once per installation — that
   * is the entire question being asked.
   *
   * Two indexed counts per event against {event, createdAt}, over a list kept
   * deliberately short.
   */
  const pinnedCounts = async (event: string) => {
    const [week, total] = await Promise.all([
      TelemetryEvent.countDocuments({ ...botCondition, event, createdAt: { $gte: d7 } }),
      TelemetryEvent.countDocuments({ ...botCondition, event }),
    ]);
    return { event, count: week, allTime: total };
  };

  const [counts, uniqueSessions7d, identifiedUsers7d, uniqueSessions7dPrev,
    identifiedUsers7dPrev, topEvents, dailyVolume, pinnedEvents] = await Promise.all([
    periodDocumentCounts(TelemetryEvent, botCondition),
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
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Promise.all(PINNED_ANALYTICS_EVENTS.map(pinnedCounts)),
  ]);
  return {
    eventsToday: counts.day, events7d: counts.week, events30d: counts.month,
    eventsTodayPrev: counts.dayPrev, events7dPrev: counts.weekPrev,
    events30dPrev: counts.monthPrev, uniqueSessions7d, identifiedUsers7d,
    uniqueSessions7dPrev, identifiedUsers7dPrev, topEvents, dailyVolume, pinnedEvents,
  };
}

export const loadAnalyticsSummary = unstable_cache(
  computeAnalyticsSummary, ["admin-analytics-summary-v2"], { revalidate: 60 }
);

