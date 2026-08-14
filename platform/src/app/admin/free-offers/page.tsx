import type { Metadata } from "next";
import Link from "next/link";
import { Gift, CheckCircle, Clock, AlertTriangle, ExternalLink } from "lucide-react";
import dbConnect from "@/lib/db";
import FreeOffer from "@/lib/models/FreeOffer";
import IngestionLog from "@/lib/models/IngestionLog";
import { FreeOffersIngestButton } from "@/components/admin/FreeOffersIngestButton";
import { LocalTime } from "@/components/LocalTime";
import { storeDisplayName, offerTypeLabel } from "@/lib/freeOffers/labels";
import type { StoreSlug } from "@/lib/freeOffers/types";

export const metadata: Metadata = { title: "Free Offers | Admin" };

export default async function AdminFreeOffersPage() {
  await dbConnect();

  const [offers, logs] = await Promise.all([
    FreeOffer.find().sort({ isActive: -1, endDate: -1, createdAt: -1 }).limit(100).lean(),
    IngestionLog.find().sort({ startedAt: -1 }).limit(20).lean(),
  ]);

  const activeCount = offers.filter((o) => (o as { isActive?: boolean }).isActive).length;
  const unmatchedCount = offers.filter(
    (o) =>
      (o as { matchConfidence?: string }).matchConfidence === "unmatched" ||
      !(o as { gameId?: unknown }).gameId
  ).length;

  return (
    <div className="space-y-8 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Free Game Offers</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Automated discovery from Epic, Steam, GOG, and Prime Gaming. ({activeCount} active, {unmatchedCount} unmatched)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FreeOffersIngestButton />
          <FreeOffersIngestButton store="epic" />
          <FreeOffersIngestButton store="steam" />
          <FreeOffersIngestButton store="gog" />
        </div>
      </div>

      {/* ── Ingestion Run History ───────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold tracking-tight">Recent Ingestion Jobs</h2>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No ingestion jobs run yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-muted/40 font-medium text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-3">Store</th>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Found</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Updated</th>
                  <th className="px-4 py-3">Expired</th>
                  <th className="px-4 py-3">Matched</th>
                  <th className="px-4 py-3">Unmatched</th>
                  <th className="px-4 py-3">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {logs.map((l) => {
                  const log = l as {
                    _id: unknown;
                    provider: StoreSlug;
                    startedAt: Date;
                    status: string;
                    offersFound: number;
                    offersCreated: number;
                    offersUpdated: number;
                    offersExpired: number;
                    gamesMatched: number;
                    gamesUnmatched: number;
                    errorMessage?: string;
                  };
                  return (
                    <tr key={String(log._id)} className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-semibold">{storeDisplayName(log.provider)}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <LocalTime value={log.startedAt} />
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            log.status === "success"
                              ? "bg-play/15 text-play"
                              : "bg-destructive/15 text-destructive"
                          }`}
                        >
                          {log.status}
                        </span>
                        {log.errorMessage && (
                          <span className="block text-[10px] text-destructive truncate max-w-xs mt-0.5" title={log.errorMessage}>
                            {log.errorMessage}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">{log.offersFound}</td>
                      <td className="px-4 py-3 text-play font-medium">{log.offersCreated}</td>
                      <td className="px-4 py-3">{log.offersUpdated}</td>
                      <td className="px-4 py-3 text-muted-foreground">{log.offersExpired}</td>
                      <td className="px-4 py-3">{log.gamesMatched}</td>
                      <td className="px-4 py-3">{log.gamesUnmatched}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {log.startedAt ? "Done" : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Offers Table ────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold tracking-tight">Tracked Offers ({offers.length})</h2>
        {offers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No offers discovered yet. Click &quot;Sync All Stores&quot; to ingest.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-muted/40 font-medium text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-3">Game / Offer</th>
                  <th className="px-4 py-3">Store</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Catalog Match</th>
                  <th className="px-4 py-3">End Date</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {offers.map((o) => {
                  const offer = o as {
                    _id: unknown;
                    gameSlug?: string | null;
                    unmatchedTitle?: string | null;
                    store: StoreSlug;
                    offerType: string;
                    isActive: boolean;
                    matchConfidence: string;
                    endDate?: Date | null;
                    claimUrl: string;
                    retailPrice?: string | null;
                  };
                  const displayTitle = offer.gameSlug || offer.unmatchedTitle || "Unknown title";
                  return (
                    <tr key={String(offer._id)} className="hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-foreground">{displayTitle}</div>
                        {offer.retailPrice && (
                          <span className="text-[11px] text-muted-foreground">{offer.retailPrice}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">{storeDisplayName(offer.store)}</td>
                      <td className="px-4 py-3">
                        <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium">
                          {offer.offerType}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            offer.isActive
                              ? "bg-play/15 text-play"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {offer.isActive ? "Active" : "Expired"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {offer.gameSlug ? (
                          <Link
                            href={`/games/${offer.gameSlug}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {offer.gameSlug}
                          </Link>
                        ) : (
                          <span className="text-amber-400 font-medium">Unmatched</span>
                        )}
                        <span className="ml-1.5 text-[10px] text-muted-foreground">
                          ({offer.matchConfidence})
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {offer.endDate ? (
                          <LocalTime value={offer.endDate} mode="date" />
                        ) : (
                          "Ongoing / Unknown"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <a
                          href={offer.claimUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                        >
                          Store <ExternalLink className="size-3" />
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
