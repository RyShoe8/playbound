import AffiliateSyncState from "@/lib/models/AffiliateSyncState";
import AffiliateTransaction from "@/lib/models/AffiliateTransaction";
import { adtractionChannels, adtractionConfigured } from "./sync";
import { emptySales, type AdtractionReport } from "./reportTypes";

/** Cached transaction data only. Opening admin never calls Adtraction. Caller connects to Mongo. */
export async function adtractionReport(gameSlugs: string[]): Promise<AdtractionReport> {
  const report: AdtractionReport = {
    configured: adtractionConfigured(), channelCount: 0, lastSyncedAt: null, reportFrom: null,
    historyComplete: false, error: null, totals: emptySales(), unattributed: 0, commission: [], byGame: null,
  };
  try {
    const channels = await adtractionChannels();
    report.channelCount = channels.length;
    if (!channels.length) return report;
    const [states, lock, groups] = await Promise.all([
      AffiliateSyncState.find({ _id: { $in: channels.map((id) => `adtraction:channel:${id}`) } }).lean(),
      AffiliateSyncState.findById("adtraction:sync").select("lastError").lean(),
      AffiliateTransaction.aggregate<{ _id: { gameSlug: string | null; status: number; currency: string }; count: number; commission: number }>([
        { $match: { channelId: { $in: channels }, activeInReport: true, transactionType: 3 } },
        { $group: { _id: { gameSlug: "$gameSlug", status: "$status", currency: "$currency" }, count: { $sum: 1 }, commission: { $sum: "$commission" } } },
      ]).option({ maxTimeMS: 5_000 }),
    ]);
    report.error = lock?.lastError ?? states.find((state) => state.lastError)?.lastError ?? null;
    const synced = states.flatMap((state) => state.lastSyncedAt ? [state.lastSyncedAt.getTime()] : []);
    report.lastSyncedAt = synced.length ? new Date(Math.min(...synced)).toISOString() : null;
    const starts = states.flatMap((state) => state.reportFrom ? [state.reportFrom.getTime()] : []);
    report.reportFrom = starts.length ? new Date(Math.min(...starts)).toISOString() : null;
    report.historyComplete = states.length === channels.length && states.every((state) => state.lastFullSyncAt);
    report.byGame = report.lastSyncedAt ? Object.fromEntries(gameSlugs.map((slug) => [slug, emptySales()])) : null;
    const currencies = new Map<string, { currency: string; approved: number; pending: number }>();
    for (const row of groups) {
      const key = row._id.status === 1 ? "approved" : row._id.status === 2 ? "pending" : row._id.status === 5 ? "rejected" : null;
      if (!key) continue; // Open claims aren't approved or pending sales.
      report.totals[key] += row.count;
      const game = row._id.gameSlug && report.byGame && Object.hasOwn(report.byGame, row._id.gameSlug) ? report.byGame[row._id.gameSlug] : null;
      if (game) game[key] += row.count;
      else if (key !== "rejected") report.unattributed += row.count;
      if (key === "rejected") continue;
      const currency = currencies.get(row._id.currency) ?? { currency: row._id.currency, approved: 0, pending: 0 };
      currency[key] += row.commission;
      currencies.set(row._id.currency, currency);
    }
    report.commission = [...currencies.values()].sort((a, b) => a.currency.localeCompare(b.currency));
  } catch {
    report.error = "Saved Adtraction reports are temporarily unavailable. Try again shortly.";
    report.byGame = null;
  }
  return report;
}
