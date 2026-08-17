"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Review = { edition: string; found: boolean; currentInstallMethod: string | null; changes: string[] };

/** Review-first control for the exact-three-record endpoint. */
export function SwgOneClickInstallButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<Review[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  async function request(confirm: boolean) {
    setBusy(true); setMessage(null);
    try {
      const res = await fetch("/api/admin/editions/wire-swg-one-click", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm }) });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setMessage(data?.error || "Could not verify the three SWG editions."); if (data?.review) setReview(data.review); return; }
      if (!confirm) { setReview(data.review || []); return; }
      setReview(null); setMessage(`Updated only the install recipes for: ${(data.updated || []).join(", ")}.`); router.refresh();
    } catch { setMessage("Request failed."); }
    finally { setBusy(false); }
  }
  return <div className="flex flex-col items-end gap-1">
    {review ? <div className="max-w-xl rounded-xl border border-sky-500/25 bg-sky-500/5 p-3 text-right">
      <p className="text-sm font-semibold">Ready to wire three official installers</p>
      <p className="mt-1 text-xs text-muted-foreground">This changes only each edition&apos;s install method and installer recipe. No game record or other edition field is written.</p>
      <ul className="mt-2 space-y-1 text-xs text-muted-foreground">{review.map((item) => <li key={item.edition}>• {item.edition}: {item.changes.join(", ")}</li>)}</ul>
      <div className="mt-3 flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => void request(true)} className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60">{busy ? "Writing…" : "Confirm three recipes"}</button><button type="button" disabled={busy} onClick={() => setReview(null)} className="rounded-full border border-border bg-secondary px-4 py-2 text-sm font-bold disabled:opacity-60">Cancel</button></div>
    </div> : <button type="button" disabled={busy} onClick={() => void request(false)} className="rounded-full border border-border bg-secondary px-4 py-2 text-sm font-bold hover:bg-secondary/70 disabled:opacity-60">{busy ? "Checking…" : "Wire 3 official one-click installers"}</button>}
    {message && <p className="max-w-md text-right text-xs text-muted-foreground">{message}</p>}
  </div>;
}
