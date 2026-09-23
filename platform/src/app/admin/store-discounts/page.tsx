import type { Metadata } from "next";
import { connection } from "next/server";
import { ExternalLink } from "lucide-react";
import dbConnect from "@/lib/db";
import StoreDiscount from "@/lib/models/StoreDiscount";
import IngestionLog from "@/lib/models/IngestionLog";
import { StoreDiscountsIngestButton } from "@/components/admin/StoreDiscountsIngestButton";
import { LocalTime } from "@/components/LocalTime";
import { storeSlugToRetailer } from "@/lib/commerce/stores";
import { DISCOUNT_STORE_SLUGS, type DiscountStoreSlug } from "@/lib/storeDiscounts/types";

export const metadata: Metadata = { title: "Store Discounts | Admin" };

export default async function AdminStoreDiscountsPage() {
  // Never prerendered — see the layout. Each segment prerenders
  // independently, so the layout's opt-out does not cover this page.
  await connection();
  await dbConnect();

  const [discounts, logs] = await Promise.all([
    StoreDiscount.find().sort({ isActive: -1, percentOff: -1, createdAt: -1 }).limit(100).lean(),
    IngestionLog.find({ jobKind: "store_discounts" }).sort({ startedAt: -1 }).limit(20).lean(),
  ]);

  const activeCount = discounts.filter((d) => (d as { isActive?: boolean }).isActive).length;

  return (
    <div className="space-y-8 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Store Discounts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Deep discounts (≥75% off) found directly on GOG, Steam, Epic and GamersGate —
            independent of PlayBound&apos;s own catalog. ({activeCount} active)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <StoreDiscountsIngestButton />
          {DISCOUNT_STORE_SLUGS.map((store) => (
            <StoreDiscountsIngestButton key={store} store={store} />
          ))}
        </div>
      </div>

      {/* ── Ingestion Run History ───────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold tracking-tight">Recent Scan Jobs</h2>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No scans run yet.</p>
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
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {logs.map((l) => {
                  const log = l as {
                    _id: unknown;
                    provider: DiscountStoreSlug;
                    startedAt: Date;
                    status: string;
                    offersFound: number;
                    offersCreated: number;
                    offersUpdated: number;
                    offersExpired: number;
                    errorMessage?: string;
                  };
                  return (
                    <tr key={String(log._id)} className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-semibold">
                        {storeSlugToRetailer(log.provider) ?? log.provider}
                      </td>
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
                          <span
                            className="block text-[10px] text-destructive truncate max-w-xs mt-0.5"
                            title={log.errorMessage}
                          >
                            {log.errorMessage}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">{log.offersFound}</td>
                      <td className="px-4 py-3 text-play font-medium">{log.offersCreated}</td>
                      <td className="px-4 py-3">{log.offersUpdated}</td>
                      <td className="px-4 py-3 text-muted-foreground">{log.offersExpired}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Discounts Table ─────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold tracking-tight">Tracked Discounts ({discounts.length})</h2>
        {discounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No discounts scanned yet. Click &quot;Scan All Stores&quot; to run one.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-muted/40 font-medium text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Store</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">Off</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Last Verified</th>
                  <th className="px-4 py-3">Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {discounts.map((d) => {
                  const row = d as {
                    _id: unknown;
                    title: string;
                    store: DiscountStoreSlug;
                    currentPriceCents: number;
                    regularPriceCents: number;
                    percentOff: number;
                    isActive: boolean;
                    lastVerified?: Date;
                    storeUrl: string;
                    matchedGameSlug?: string | null;
                  };
                  return (
                    <tr key={String(row._id)} className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-semibold text-foreground">
                        {row.title}
                        {row.matchedGameSlug && (
                          <span className="ml-1.5 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            matches {row.matchedGameSlug}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">{storeSlugToRetailer(row.store) ?? row.store}</td>
                      <td className="px-4 py-3">
                        ${(row.currentPriceCents / 100).toFixed(2)}
                        <span className="ml-1 text-muted-foreground line-through">
                          ${(row.regularPriceCents / 100).toFixed(2)}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-play">-{row.percentOff}%</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            row.isActive ? "bg-play/15 text-play" : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {row.isActive ? "Active" : "Expired"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.lastVerified ? <LocalTime value={row.lastVerified} /> : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <a
                          href={row.storeUrl}
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
