"use client";

import { useState } from "react";

type Package = { slots: number; priceCents: number };

export function BasicSlotPicker({ packages, available, region, regionKey }: { packages: Package[]; available: boolean; region: string; regionKey: string }) {
  const [selected, setSelected] = useState(packages[0]?.slots ?? 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = packages.find((item) => item.slots === selected) ?? packages[0];
  async function checkout() {
    if (!chosen || !available || !regionKey || busy) return;
    setBusy(true);
    setError(null);
    try {
      const storageKey = `playbound-basic-checkout:${regionKey}:${chosen.slots}`;
      let checkoutKey = window.sessionStorage.getItem(storageKey);
      if (!checkoutKey) {
        checkoutKey = crypto.randomUUID().replaceAll("-", "");
        window.sessionStorage.setItem(storageKey, checkoutKey);
      }
      const res = await fetch("/api/hosting/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regionKey, slots: chosen.slots, checkoutKey }),
      });
      if (res.status === 401) {
        window.location.assign(`/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const message = typeof data?.error === "string" ? data.error : "Could not start checkout";
        if (/hold has expired|session is no longer open|key already belongs/i.test(message)) {
          window.sessionStorage.removeItem(storageKey);
        }
        throw new Error(message);
      }
      if (typeof data?.url !== "string" || new URL(data.url).hostname !== "checkout.stripe.com") {
        throw new Error("Checkout returned an invalid destination");
      }
      window.location.assign(data.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start checkout");
      setBusy(false);
    }
  }
  return <div className="rounded-xl border border-border bg-background/60 p-4">
    <label htmlFor="basic-slots" className="text-sm font-semibold">Slots and monthly price</label>
    <p className="mt-1 text-xs text-muted-foreground">One pool for every game you host. {region} · no setup fee.</p>
    {packages.length ? <select id="basic-slots" value={selected} onChange={(event) => { setSelected(Number(event.target.value)); setError(null); }} className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-3 text-sm font-semibold text-foreground">
      {packages.map((item) => <option key={item.slots} value={item.slots}>{item.slots} slots — ${(item.priceCents / 100).toFixed(2)}/month</option>)}
    </select> : <p className="mt-4 text-sm text-muted-foreground">Packages will be announced soon.</p>}
    {chosen ? <p className="mt-3 text-sm text-muted-foreground">{chosen.slots} slots can run one server or be divided among several games. Stopped servers free their slots.</p> : null}
    {available && chosen ? <button type="button" disabled={busy} onClick={() => void checkout()} className="mt-4 w-full rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Opening checkout…" : `Choose ${chosen.slots} slots`}</button>
      : <p className="mt-4 rounded-lg bg-secondary px-3 py-2 text-center text-sm font-medium text-muted-foreground">Early access — coming soon</p>}
    {error ? <p role="alert" className="mt-2 text-sm text-red-500">{error}</p> : null}
  </div>;
}
