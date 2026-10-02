"use client";

import { useState } from "react";

type Package = { slots: number; priceCents: number };

export function BasicSlotPicker({ packages, available, region }: { packages: Package[]; available: boolean; region: string }) {
  const [selected, setSelected] = useState(packages[0]?.slots ?? 0);
  const chosen = packages.find((item) => item.slots === selected) ?? packages[0];
  return <div className="rounded-xl border border-border bg-background/60 p-4">
    <label htmlFor="basic-slots" className="text-sm font-semibold">Slots and monthly price</label>
    <p className="mt-1 text-xs text-muted-foreground">One pool for every game you host. {region} · no setup fee.</p>
    {packages.length ? <select id="basic-slots" value={selected} onChange={(event) => setSelected(Number(event.target.value))} className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-3 text-sm font-semibold text-foreground">
      {packages.map((item) => <option key={item.slots} value={item.slots}>{item.slots} slots — ${(item.priceCents / 100).toFixed(2)}/month</option>)}
    </select> : <p className="mt-4 text-sm text-muted-foreground">Packages will be announced soon.</p>}
    {chosen ? <p className="mt-3 text-sm text-muted-foreground">{chosen.slots} slots can run one server or be divided among several games. Stopped servers free their slots.</p> : null}
    <p className="mt-4 rounded-lg bg-secondary px-3 py-2 text-center text-sm font-medium text-muted-foreground">{available ? "Checkout opening soon" : "Early access — coming soon"}</p>
  </div>;
}
