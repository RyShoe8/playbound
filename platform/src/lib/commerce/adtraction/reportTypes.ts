export type AffiliateSales = { approved: number; pending: number; rejected: number };
export type AdtractionReport = {
  configured: boolean;
  channelCount: number;
  lastSyncedAt: string | null;
  reportFrom: string | null;
  historyComplete: boolean;
  error: string | null;
  totals: AffiliateSales;
  unattributed: number;
  commission: Array<{ currency: string; approved: number; pending: number }>;
  byGame: Record<string, AffiliateSales> | null;
};
export const emptySales = (): AffiliateSales => ({ approved: 0, pending: 0, rejected: 0 });
