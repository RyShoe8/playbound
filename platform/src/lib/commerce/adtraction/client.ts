import { z } from "zod";
import { gameFromAdtractionClick } from "./attribution";

const identifier = z.union([z.string().regex(/^\d{1,15}$/), z.number().int().positive().safe()]).transform(String);
const date = z.string().refine((v) => Number.isFinite(Date.parse(v)), "Invalid date").transform((v) => new Date(v));
const transactionSchema = z.object({
  uniqueId: z.string().min(1).max(200),
  transactionDate: date,
  lastUpdated: date.optional(),
  transactionType: z.number().int(),
  transactionStatus: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(5)]),
  commission: z.number().finite(),
  orderValue: z.number().finite().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  paymentStatus: z.number().int().min(1).max(4).optional(),
  click: z.object({
    channelId: identifier,
    programId: identifier.optional(),
    programName: z.string().max(300).optional(),
    epi: z.string().optional().nullable(), epi2: z.string().optional().nullable(),
    epi3: z.string().optional().nullable(), epi4: z.string().optional().nullable(), epi5: z.string().optional().nullable(),
  }),
});

export class AdtractionError extends Error {
  constructor(public code: string, message: string, public retryAfterMs = 60_000) { super(message); }
}

export function safeAdtractionError(error: unknown): string {
  return error instanceof AdtractionError ? error.message : "The reporting sync failed. Existing reports were preserved; retry the sync.";
}

export function normalizeTransaction(raw: unknown, channelId: string) {
  const parsed = transactionSchema.safeParse(raw);
  if (!parsed.success) throw new AdtractionError("INVALID_RESPONSE", "Adtraction returned an unrecognized transaction. The report was not marked complete.");
  const row = parsed.data;
  if (row.click.channelId !== channelId) throw new AdtractionError("CHANNEL_MISMATCH", "Adtraction returned a transaction for a different channel. Import stopped.");
  return {
    _id: `adtraction:${row.uniqueId}`,
    channelId,
    programId: row.click.programId ?? null,
    programName: row.click.programName ?? null,
    gameSlug: gameFromAdtractionClick(row.click),
    transactionDate: row.transactionDate,
    sourceUpdatedAt: row.lastUpdated ?? null,
    transactionType: row.transactionType,
    status: row.transactionStatus,
    paymentStatus: row.paymentStatus ?? null,
    commission: row.commission,
    orderValue: row.orderValue ?? null,
    currency: row.currency,
  };
}
export type AdtractionTransaction = ReturnType<typeof normalizeTransaction>;

/** The documented transactions endpoint returns an array, not a paginated object. */
export async function fetchTransactions(input: {
  token: string; channelId: string; from: Date; to: Date;
  signal?: AbortSignal; fetcher?: typeof fetch;
}): Promise<AdtractionTransaction[]> {
  const signal = input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000);
  let response: Response;
  try {
    response = await (input.fetcher ?? fetch)("https://api.adtraction.net/v2/partner/transactions/", {
      method: "POST", redirect: "error", cache: "no-store", signal,
      headers: { "X-Token": input.token, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ fromDate: input.from.toISOString(), toDate: input.to.toISOString(), channelId: Number(input.channelId), transactionStatus: 0 }),
    });
  } catch {
    throw new AdtractionError("UNREACHABLE", "Adtraction could not be reached or timed out. The next sync will retry.");
  }
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status === 401 || response.status === 403) throw new AdtractionError("AUTH", "Adtraction rejected API access. Check the partner API token and account permissions.", 3_600_000);
    if (response.status === 429) {
      const retry = response.headers.get("retry-after");
      const delay = retry && /^\d+$/.test(retry) ? Number(retry) * 1000 : retry ? Date.parse(retry) - Date.now() : 60_000;
      throw new AdtractionError("RATE_LIMIT", "Adtraction's request limit was reached. The next sync will retry.", Math.min(3_600_000, Math.max(60_000, delay || 60_000)));
    }
    throw new AdtractionError("HTTP_ERROR", `Adtraction reporting returned HTTP ${response.status}. The next sync will retry.`);
  }
  // Bound unpaginated responses; never save a partial response as a full report.
  const reader = response.body?.getReader();
  if (!reader) throw new AdtractionError("INVALID_RESPONSE", "Adtraction returned an empty response body.");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 8 * 1024 * 1024) {
        await reader.cancel();
        throw new AdtractionError("REPORT_TOO_LARGE", "The Adtraction report is too large. A smaller date window is required.");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof AdtractionError) throw error;
    throw new AdtractionError("UNREACHABLE", "The Adtraction response was interrupted. The next sync will retry.");
  } finally { reader.releaseLock(); }
  let data: unknown;
  try { data = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new AdtractionError("INVALID_RESPONSE", "Adtraction returned invalid JSON. The report was not marked complete."); }
  // Documented no-results response differs from the empty array used by other endpoints.
  if (data === "No transactions found." || (data && typeof data === "object" && !Array.isArray(data) && "message" in data && data.message === "No transactions found.")) {
    const count = response.headers.get("count");
    if (count !== null && count !== "0") throw new AdtractionError("INCOMPLETE_RESPONSE", "Adtraction returned inconsistent result counts. No reporting checkpoint was advanced.");
    return [];
  }
  if (!Array.isArray(data)) throw new AdtractionError("INVALID_RESPONSE", "Adtraction returned an unrecognized report. The report was not marked complete.");
  const count = response.headers.get("count");
  if (count !== null && (!/^\d+$/.test(count) || Number(count) !== data.length)) {
    throw new AdtractionError("INCOMPLETE_RESPONSE", "Adtraction returned an incomplete report. No reporting checkpoint was advanced.");
  }
  return data.map((row) => normalizeTransaction(row, input.channelId));
}
