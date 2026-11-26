"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import type { AdtractionReport } from "@/lib/commerce/adtraction/reportTypes";

const count = (value: number) => value.toLocaleString("en-US");
function date(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}

export function AdtractionReporting({ report }: { report: AdtractionReport }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function sync() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/ecommerce/adtraction/sync", { method: "POST" });
      const body = await response.json();
      if (!response.ok || body.error) setMessage(body.error || "Could not sync reports. Try again shortly.");
      else if (body.status === "busy") setMessage("A sync is running or recently completed. Automatic syncs continue hourly.");
      else if (body.status === "disabled") setMessage("Add ADTRACTION_API_TOKEN to the server environment, then redeploy.");
      else setMessage(`Synced ${count(Number(body.transactions) || 0)} transaction records.${body.status === "partial" ? " History will continue importing automatically." : " Reports are up to date."}`);
      router.refresh();
    } catch { setMessage("Could not sync reports. Try again shortly."); }
    finally { setBusy(false); }
  }
  const status = !report.configured ? "Awaiting API token" : !report.channelCount ? "Store setup needed" : report.error ? "Sync needs attention" : !report.lastSyncedAt ? "Ready for first sync" : !report.historyComplete ? "Importing history" : "Connected";
  return (
    <section aria-labelledby="adtraction-report-title" className="min-w-0 space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="adtraction-report-title" className="text-lg font-bold">Adtraction sales</h2>
          <p className="text-sm text-muted-foreground">{status} · Automatic hourly sync</p>
        </div>
        <button type="button" onClick={() => void sync()} disabled={busy || !report.configured || !report.channelCount}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-secondary px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50">
          <RefreshCw aria-hidden="true" className={`size-4 ${busy ? "animate-spin" : ""}`} />
          {busy ? "Syncing…" : "Sync now"}
        </button>
      </div>
      {!report.configured && <p className="text-sm text-muted-foreground">Add <code>ADTRACTION_API_TOKEN</code> to the production server environment and redeploy. The next scheduled sync will connect automatically. The token is never sent to your browser.</p>}
      {report.configured && !report.channelCount && <p className="text-sm">Configure an Adtraction tracking URL under eCommerce → Stores. Its channel ID is detected automatically.</p>}
      {report.error && <p role="alert" className="text-sm text-destructive">{report.error} Saved figures remain visible.</p>}
      {message && <p role="status" className="text-sm">{message}</p>}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["Approved sales", report.totals.approved], ["Pending sales", report.totals.pending], ["Rejected sales", report.totals.rejected], ["Without a game-card match", report.unattributed]].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-secondary/50 p-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-xl font-bold tabular-nums">{report.byGame === null ? "—" : count(Number(value))}</dd>
          </div>
        ))}
      </dl>
      {report.commission.length > 0 && <div className="space-y-1 text-sm">
        <p className="font-semibold">Commission</p>
        {report.commission.map((row) => {
          const format = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: row.currency }).format(value);
          return <p key={row.currency} className="text-muted-foreground">{row.currency}: {format(row.approved)} approved · {format(row.pending)} pending</p>;
        })}
        <p className="text-xs text-muted-foreground">Commission is not a payout balance. Adjustments, fees and payments are not included.</p>
      </div>}
      <div className="space-y-1 text-xs leading-relaxed text-muted-foreground">
        <p>Game-card totals count sale transactions referred by that game’s links, not verified copies of that game purchased. A shopper may buy something else. Historical sales without our game reference stay unmatched; leads and clicks are excluded.</p>
        {report.reportFrom && <p>Reporting from {date(report.reportFrom)}.{!report.historyComplete ? " History is still importing; figures are partial." : ""}</p>}
        {report.lastSyncedAt && <p>Last refreshed {new Date(report.lastSyncedAt).toISOString().replace("T", " ").slice(0, 16)} UTC. Older transaction statuses are refreshed daily.</p>}
      </div>
    </section>
  );
}
