"use client";

import { useState } from "react";

type Package = { slots: number; priceCents: number };

export function BasicSlotPicker({ packages, available, region }: { packages: Package[]; available: boolean; region: string }) {
  const [selected, setSelected] = useState(packages[0]?.slots ?? 0);
  const chosen = packages.find((item) => item.slots === selected) ?? packages[0];
  return <div className="rounded-xl border border-border bg-background/60 p-4 sm:p-5">
    <h4 className="text-lg font-semibold">Choose your slots</h4>
    <p className="mt-1 text-sm text-muted-foreground">One pool for every game you host. {region} · monthly, no setup fee.</p>
    {packages.length ? <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {packages.map((item) => <button key={item.slots} type="button" onClick={() => setSelected(item.slots)} aria-pressed={selected === item.slots}
        className={`rounded-lg border px-3 py-3 text-left transition-colors ${selected === item.slots ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}>
        <span className="block font-semibold">{item.slots} slots</span>
        <span className="text-sm text-muted-foreground">${(item.priceCents / 100).toFixed(2)}/mo</span>
      </button>)}
    </div> : <p className="mt-4 text-sm text-muted-foreground">Packages will be announced soon.</p>}
    {chosen ? <p className="mt-3 text-sm text-muted-foreground">{chosen.slots} slots can run one server or be divided among several games. Stopped servers free their slots.</p> : null}
    <p className="mt-4 rounded-lg bg-secondary px-3 py-2 text-center text-sm font-medium text-muted-foreground">{available ? "Checkout opening soon" : "Early access — coming soon"}</p>
  </div>;
}
