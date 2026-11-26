import { randomUUID } from "node:crypto";
import dbConnect from "@/lib/db";
import StoreProvider from "@/lib/models/StoreProvider";
import AffiliateTransaction from "@/lib/models/AffiliateTransaction";
import AffiliateSyncState from "@/lib/models/AffiliateSyncState";
import { adtractionChannelId } from "./attribution";
import { AdtractionError, fetchTransactions, safeAdtractionError } from "./client";

const DAY = 86_400_000;
const LOCK = "adtraction:sync";
const channelKey = (id: string) => `adtraction:channel:${id}`;
export const adtractionConfigured = () => Boolean(process.env.ADTRACTION_API_TOKEN?.trim());

export async function adtractionChannels(): Promise<string[]> {
  const stores = await StoreProvider.find({ affiliateDefault: { $ne: false }, affiliateUrlTemplate: { $type: "string" } })
    .select("affiliateUrlTemplate").lean();
  return [...new Set(stores.flatMap((store) => {
    const id = adtractionChannelId(String(store.affiliateUrlTemplate || ""));
    return id ? [id] : [];
  }))].sort();
}

function configuredStart(now: Date, existing?: Date | null): Date {
  const raw = process.env.ADTRACTION_REPORT_FROM;
  if (!raw) return existing ?? new Date(new Date(now.getTime() - 365 * DAY).toISOString().slice(0, 10));
  const date = new Date(raw);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== raw || date > now) {
    throw new AdtractionError("CONFIG", "ADTRACTION_REPORT_FROM must be a valid past date in YYYY-MM-DD format.");
  }
  // Extending history never discards the history already imported.
  return existing && existing < date ? existing : date;
}

export type AdtractionSyncResult = {
  status: "disabled" | "not_configured" | "busy" | "success" | "partial" | "failed";
  requests: number;
  transactions: number;
  error?: string;
};

/** Bounded, resumable imports. All upstream operations are read-only. */
export async function syncAdtraction(options: { now?: Date; fetcher?: typeof fetch; maxRequests?: number } = {}): Promise<AdtractionSyncResult> {
  const token = process.env.ADTRACTION_API_TOKEN?.trim();
  const result: AdtractionSyncResult = { status: "disabled", requests: 0, transactions: 0 };
  if (!token) return result; // No network or database work before configuration.
  await dbConnect();
  const channels = await adtractionChannels();
  if (!channels.length) return { ...result, status: "not_configured", error: "Add an Adtraction tracking URL to a store in eCommerce → Stores." };
  const now = options.now ?? new Date();
  const owner = randomUUID();
  try {
    await AffiliateSyncState.findOneAndUpdate(
      { _id: LOCK, leaseUntil: { $lte: now }, nextAttemptAt: { $lte: now } },
      { $set: { owner, leaseUntil: new Date(now.getTime() + 90_000), lastAttemptAt: now } },
      { upsert: true, returnDocument: "after" },
    );
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return { ...result, status: "busy" };
    throw error;
  }
  const deadline = Date.now() + 42_000;
  const signal = AbortSignal.timeout(42_000);
  const maxRequests = Math.min(6, Math.max(1, options.maxRequests ?? 6));
  let currentKey: string | null = null;
  let nextAttemptAt = new Date(now.getTime() + 5 * 60_000);
  try {
    const existing = await AffiliateSyncState.find({ _id: { $in: channels.map(channelKey) } }).lean();
    const states = new Map(existing.map((state) => [state._id, state]));
    channels.sort((a, b) => (states.get(channelKey(a))?.lastAttemptAt?.getTime() ?? 0) - (states.get(channelKey(b))?.lastAttemptAt?.getTime() ?? 0));
    let unfinished = false;
    for (const channelId of channels) {
      if (result.requests >= maxRequests || Date.now() >= deadline) { unfinished = true; break; }
      currentKey = channelKey(channelId);
      let state = states.get(currentKey);
      const reportFrom = configuredStart(now, state?.reportFrom);
      const extended = Boolean(state?.reportFrom && reportFrom < state.reportFrom);
      const scanDue = !state?.lastFullSyncAt || now.getTime() - state.lastFullSyncAt.getTime() >= DAY;
      const cursor = extended ? reportFrom : state?.cursor ?? reportFrom;
      const scanTo = extended ? now : state?.scanTo ?? (scanDue ? now : null);
      state = (await AffiliateSyncState.findOneAndUpdate({ _id: currentKey }, {
        $set: { reportFrom, cursor, scanTo, lastAttemptAt: now, ...(extended ? { lastFullSyncAt: null, coveredThrough: null } : {}) },
      }, { upsert: true, returnDocument: "after" }).lean())!;

      const importWindow = async (from: Date, to: Date) => {
        result.requests += 1;
        const rows = await fetchTransactions({ token, channelId, from, to, signal, fetcher: options.fetcher });
        const fetchedAt = new Date();
        if (rows.some((row) => row.transactionDate < from || row.transactionDate > to)) {
          throw new AdtractionError("DATE_MISMATCH", "Adtraction returned transactions outside the requested dates. Import stopped.");
        }
        // Fence writes if the worker lost its lease while waiting for the API.
        if (!await AffiliateSyncState.exists({ _id: LOCK, owner, leaseUntil: { $gt: new Date() } })) {
          throw new AdtractionError("LEASE_EXPIRED", "The reporting sync lease expired. The next sync will resume.");
        }
        if (rows.length) {
          await AffiliateTransaction.bulkWrite(rows.map(({ _id, ...row }) => ({
            updateOne: { filter: { _id }, update: { $set: { ...row, fetchedAt, activeInReport: true } }, upsert: true },
          })), { ordered: true });
        }
        // Only a complete, validated response may retire missing records from this window.
        await AffiliateTransaction.updateMany({ channelId, transactionDate: { $gte: from, $lte: to }, fetchedAt: { $lt: fetchedAt } }, { $set: { activeInReport: false } });
        result.transactions += rows.length;
        await AffiliateSyncState.updateOne({ _id: currentKey }, { $set: { lastSyncedAt: now, lastError: null } });
      };

      // New sales and recent approvals appear hourly, even while history is still importing.
      await importWindow(new Date(Math.max(reportFrom.getTime(), now.getTime() - 7 * DAY)), now);
      let from = state.cursor!;
      while (state.scanTo && from <= state.scanTo && result.requests < maxRequests && Date.now() < deadline) {
        const to = new Date(Math.min(from.getTime() + 31 * DAY, state.scanTo.getTime()));
        await importWindow(from, to);
        const complete = to.getTime() === state.scanTo.getTime();
        await AffiliateSyncState.updateOne({ _id: currentKey }, { $set: {
          cursor: complete ? reportFrom : to,
          scanTo: complete ? null : state.scanTo,
          ...(complete ? { lastFullSyncAt: now, coveredThrough: state.scanTo } : {}),
        } });
        if (complete) { state.scanTo = null; break; }
        from = to; // Inclusive overlap; stable transaction IDs make replay harmless.
      }
      if (state.scanTo) unfinished = true;
    }
    result.status = unfinished ? "partial" : "success";
    await AffiliateSyncState.updateOne({ _id: LOCK, owner }, { $set: { lastSyncedAt: now, lastError: null } });
  } catch (error) {
    result.status = "failed";
    result.error = safeAdtractionError(error);
    nextAttemptAt = new Date(now.getTime() + Math.max(300_000, error instanceof AdtractionError ? error.retryAfterMs : 300_000));
    // Persist only controlled messages; never save raw responses, headers, URLs or tokens.
    await AffiliateSyncState.updateOne({ _id: LOCK, owner }, { $set: { lastError: result.error } });
    if (currentKey) await AffiliateSyncState.updateOne({ _id: currentKey }, { $set: { lastError: result.error } });
  } finally {
    await AffiliateSyncState.updateOne({ _id: LOCK, owner }, { $set: { owner: null, leaseUntil: new Date(0), nextAttemptAt } });
  }
  return result;
}
