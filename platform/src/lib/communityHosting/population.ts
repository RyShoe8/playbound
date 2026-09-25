import { getPeriodWindows, type PeriodCounts } from "@/lib/admin/analyticsPeriods";
import CommunityPopulationSample from "@/lib/models/CommunityPopulationSample";

export function populationReading(rows: Array<{ playerCount?: number | null; playerCountCheckedAt?: Date | null }>, now: Date): number | null {
  if (rows.some((row) => row.playerCount == null || !row.playerCountCheckedAt ||
    now.getTime() - new Date(row.playerCountCheckedAt).getTime() > 2 * 60_000)) return null;
  return rows.reduce((sum, row) => sum + (row.playerCount || 0), 0);
}

export async function recordPopulationReading(regionKey: string, rows: Array<{ playerCount?: number | null; playerCountCheckedAt?: Date | null }>, now: Date) {
  const bucketStart = new Date(Math.floor(now.getTime() / 900_000) * 900_000);
  await CommunityPopulationSample.updateOne({ regionKey, bucketStart }, {
    $set: { observedAt: now, serverCount: rows.length, players: populationReading(rows, now) },
  }, { upsert: true });
}

export async function populationPeriods(regionKey: string, now = new Date()): Promise<{ current: number | null; periods: PeriodCounts }> {
  const w = getPeriodWindows(now);
  const rows = await CommunityPopulationSample.find({ regionKey, observedAt: { $gte: w.d60 } })
    .select({ observedAt: 1, players: 1 }).sort({ observedAt: -1 }).lean() as Array<{ observedAt: Date; players: number | null }>;
  const complete = rows.filter((row) => typeof row.players === "number" && Number.isFinite(row.players));
  const peak = (from: Date, to: Date) => complete.reduce((max, row) =>
    row.observedAt >= from && row.observedAt < to ? Math.max(max, row.players!) : max, 0);
  return {
    current: rows[0] && now.getTime() - rows[0].observedAt.getTime() <= 30 * 60_000 ? rows[0].players : null,
    periods: {
      day: peak(w.today, now), dayPrev: peak(w.yesterday, w.today),
      week: peak(w.d7, now), weekPrev: peak(w.d14, w.d7),
      month: peak(w.d30, now), monthPrev: peak(w.d60, w.d30),
    },
  };
}
