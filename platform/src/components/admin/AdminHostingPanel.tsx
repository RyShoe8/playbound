"use client";

import { useCallback, useEffect, useState } from "react";
import { HostingSupport } from "@/components/hosting/HostingSupport";

type TierGame = {
  profileKey: string;
  enabled: boolean;
  newServerCreationEnabled: boolean;
  existingServerStartEnabled: boolean;
  minSlots: number;
  maxSlots: number;
  slotIncrement: number;
  supportedRegions: string[];
  allowedMods: string[];
  readinessStatus: "draft" | "testing" | "verified";
  adminNote?: string | null;
};
type Pkg = { slots: number; priceCents: number; currency: string; enabled: boolean; order: number; stripePriceId: string | null };
type Tier = {
  name: string;
  description: string;
  salesEnabled: boolean;
  startsDisabled: boolean;
  resourceClass: { key: string; slotsPerUnit: number; memoryMbPerUnit: number; cpuPerUnit: number; storageGbPerUnit: number };
  minAllocation: number;
  allocationIncrement: number;
  maxSlotsSold: number;
  maxSavedServers: number;
  backupRetention: number;
  paymentGraceHours: number;
  cancellationRetentionDays: number;
  safetyReservePercent: number;
  regions: Array<{ key: string; label: string; salesEnabled: boolean }>;
  packages: Pkg[];
  games: TierGame[];
};
type ProfileInfo = {
  key: string;
  gameSlug: string;
  recipeSlug: string;
  verification: string;
  queryVerified: boolean;
  joinVerified: boolean;
  measuredThroughPlayers: number;
  lastVerifiedAt: string | null;
  capEnforced: boolean;
  samples: number;
  cpuCores: number;
  ramBytes: number;
  fit: "unknown" | "safe" | "warning" | "exceeds";
};
type Sub = {
  id: string;
  username: string | null;
  email: string | null;
  regionKey: string;
  slotCapacity: number;
  allocatedSlots: number;
  status: string;
  source: string;
  note: string | null;
  savedServers: number;
  onlineServers: number;
};
type CustomerServer = {
  id: string;
  name: string;
  gameTitle: string;
  owner: string | null;
  slots: number;
  online: boolean;
  runtimeState: string;
  players: number | null;
  visibility: string;
  statusReason: string | null;
};

const TABS = ["Plan", "Games", "Subscriptions", "Customer servers", "Billing", "Support"] as const;
type Tab = (typeof TABS)[number];

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json" } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const input = "rounded border border-border bg-background px-2 py-1 text-sm";

export function AdminHostingPanel() {
  const [tab, setTab] = useState<Tab>("Plan");
  const [tier, setTier] = useState<Tier | null>(null);
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [servers, setServers] = useState<CustomerServer[]>([]);
  const [openSupport, setOpenSupport] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [t, s, cs, support] = await Promise.all([
      api("/api/admin/hosting/tiers/basic"),
      api("/api/admin/hosting/subscriptions"),
      api("/api/admin/hosting/servers"),
      api("/api/admin/hosting/support?summary=1").catch(() => ({ open: 0 })),
    ]);
    setTier(t.tier);
    setProfiles(t.profiles);
    setSubs(s.subscriptions);
    setServers(cs.servers);
    setOpenSupport(support.open || 0);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load().catch((e) => setMessage(e.message)), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function saveTier(next: Tier) {
    setMessage(null);
    try {
      const r = await api("/api/admin/hosting/tiers/basic", { method: "PUT", body: JSON.stringify(next) });
      setTier(r.tier);
      setMessage("Saved.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function act(work: () => Promise<unknown>, done: string) {
    setMessage(null);
    try {
      await work();
      setMessage(done);
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    }
  }

  if (!tier) return <p className="text-sm text-muted-foreground">{message || "Loading…"}</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-sm ${tab === t ? "bg-primary text-primary-foreground" : "border border-border hover:bg-secondary"}`}
          >
            {t}{t === "Support" && openSupport > 0 ? ` (${openSupport})` : ""}
          </button>
        ))}
      </div>
      {message ? <p className="rounded-lg border border-border bg-secondary/50 p-2 text-sm" role="status">{message}</p> : null}
      {tab === "Plan" ? <PlanTab key={JSON.stringify(tier)} tier={tier} onSave={saveTier} onSync={() => act(() => api("/api/admin/hosting/stripe-prices", { method: "POST" }), "Stripe prices synchronized. Sales remain disabled.")} /> : null}
      {tab === "Games" ? <GamesTab tier={tier} profiles={profiles} onSave={saveTier} /> : null}
      {tab === "Subscriptions" ? <SubscriptionsTab tier={tier} subs={subs} act={act} /> : null}
      {tab === "Customer servers" ? <ServersTab servers={servers} act={act} /> : null}
      {tab === "Billing" ? <BillingTab /> : null}
      {tab === "Support" ? <HostingSupport admin /> : null}
    </div>
  );
}

type BillingStatus = {
  stripeKeyConfigured: boolean;
  webhookSecretConfigured: boolean;
  counts: { active: number; pastDue: number; suspended: number; canceled: number; canceling: number };
  monthlyRevenueCents: number;
  heldCount: number;
  scheduledDowngrades: number;
  pendingUpgrades: Array<{ subscriptionId: string; toSlots: number; at: string }>;
  lastWebhook: { type: string; at: string } | null;
  failures: Array<{ id: string; stripeSubscriptionId: string | null; message: string; checkedAt: string | null }>;
};

function BillingTab() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(() => void api("/api/admin/hosting/billing")
    .then((data) => { setStatus(data as BillingStatus); setError(null); })
    .catch((cause) => setError(cause instanceof Error ? cause.message : "Billing status unavailable")), []);
  useEffect(() => { const timer = setTimeout(refresh, 0); return () => clearTimeout(timer); }, [refresh]);
  if (error) return <p className="text-sm text-red-500">{error}</p>;
  if (!status) return <p className="text-sm text-muted-foreground">Loading billing status…</p>;
  return <div className="space-y-4">
    <div className="flex flex-wrap gap-3">
      {[
        ["Active", status.counts.active], ["Past due", status.counts.pastDue],
        ["Suspended", status.counts.suspended], ["Canceling", status.counts.canceling],
        ["Capacity holds", status.heldCount], ["Pending upgrades", status.pendingUpgrades.length],
        ["Scheduled downgrades", status.scheduledDowngrades],
        ["Active monthly list price", `$${(status.monthlyRevenueCents / 100).toFixed(2)}`],
      ].map(([label, value]) => <div key={label} className="min-w-32 rounded-xl border border-border bg-card p-3">
        <p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-semibold">{value}</p>
      </div>)}
    </div>
    <section className="rounded-xl border border-border bg-card p-4 text-sm">
      <h2 className="font-semibold">Stripe connection</h2>
      <p>Secret key: {status.stripeKeyConfigured ? "configured" : "missing"} · Webhook signing secret: {status.webhookSecretConfigured ? "configured" : "missing"}</p>
      <p>Last processed webhook: {status.lastWebhook ? `${status.lastWebhook.type} · ${new Date(status.lastWebhook.at).toLocaleString()}` : "none"}</p>
      <p className="mt-1 text-xs text-muted-foreground">Configuration and receipts are local signals; this panel does not claim a live Stripe health check.</p>
      <button type="button" className="mt-2 text-xs text-primary" onClick={refresh}>Refresh</button>
    </section>
    {status.pendingUpgrades.length ? <section className="rounded-xl border border-border bg-card p-4 text-sm">
      <h2 className="font-semibold">Upgrades awaiting Stripe reconciliation</h2>
      <ul className="mt-2 space-y-1">{status.pendingUpgrades.map((hold) => <li key={hold.subscriptionId}>{hold.subscriptionId} → {hold.toSlots} slots · {new Date(hold.at).toLocaleString()}</li>)}</ul>
    </section> : null}
    <section className="rounded-xl border border-border bg-card p-4 text-sm">
      <h2 className="font-semibold">Billing reconciliation failures</h2>
      {status.failures.length ? <ul className="mt-2 space-y-2">{status.failures.map((failure) => <li key={failure.id}>
        <span className="font-mono text-xs">{failure.stripeSubscriptionId || failure.id}</span> · {failure.message}
        {failure.checkedAt ? <span className="block text-xs text-muted-foreground">{new Date(failure.checkedAt).toLocaleString()}</span> : null}
      </li>)}</ul> : <p className="mt-1 text-muted-foreground">No recorded failures.</p>}
    </section>
  </div>;
}

function num(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function PlanTab({ tier, onSave, onSync }: { tier: Tier; onSave: (t: Tier) => void; onSync: () => void }) {
  const [t, setT] = useState<Tier>(tier);
  const set = <K extends keyof Tier>(k: K, v: Tier[K]) => setT((prev) => ({ ...prev, [k]: v }));
  const field = (label: string, k: keyof Tier, help?: string) => (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span>
        {label}
        {help ? <span className="block text-xs text-muted-foreground">{help}</span> : null}
      </span>
      <input className={`${input} w-24 text-right`} type="number" value={t[k] as number} onChange={(e) => set(k, num(e.target.value) as never)} />
    </label>
  );
  const pkgs = [...t.packages].sort((a, b) => a.order - b.order);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="font-semibold">Plan</h2>
        <label className="block text-sm">
          Name
          <input className={`${input} mt-1 w-full`} value={t.name} onChange={(e) => set("name", e.target.value)} />
        </label>
        <label className="block text-sm">
          Description
          <textarea className={`${input} mt-1 w-full`} rows={3} value={t.description} onChange={(e) => set("description", e.target.value)} />
        </label>
        <p className="text-xs text-muted-foreground">Sales remain closed until billing, backups, and launch-game checks are complete.</p>
        <label className="flex items-center gap-2 text-sm text-red-500">
          <input type="checkbox" checked={t.startsDisabled} onChange={(e) => set("startsDisabled", e.target.checked)} /> Emergency: disable all server starts
          (running servers stop on the next reconcile)
        </label>
        {field("Minimum server allocation", "minAllocation", "slots")}
        {field("Allocation increment", "allocationIncrement", "slots")}
        {field("Maximum slots sold", "maxSlotsSold")}
        {field("Maximum saved servers", "maxSavedServers")}
        {field("Backups kept per server", "backupRetention")}
        {field("Payment grace", "paymentGraceHours", "hours")}
        {field("Data retention after cancel", "cancellationRetentionDays", "days")}
        {field("Safety reserve", "safetyReservePercent", "% not for sale")}
      </section>
      <div className="space-y-6">
        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h2 className="font-semibold">Resource class (internal)</h2>
          <p className="text-xs text-muted-foreground">One unit per this many slots. Customers never see this; it sizes the capacity each subscription reserves.</p>
          {(["slotsPerUnit", "memoryMbPerUnit", "cpuPerUnit", "storageGbPerUnit"] as const).map((k) => (
            <label key={k} className="flex items-center justify-between gap-3 text-sm">
              {{ slotsPerUnit: "Slots per unit", memoryMbPerUnit: "RAM per unit (MB)", cpuPerUnit: "CPU per unit (cores)", storageGbPerUnit: "Storage per unit (GB)" }[k]}
              <input
                className={`${input} w-24 text-right`}
                type="number"
                step={k === "cpuPerUnit" ? 0.05 : 1}
                value={t.resourceClass[k]}
                onChange={(e) => set("resourceClass", { ...t.resourceClass, [k]: num(e.target.value) })}
              />
            </label>
          ))}
        </section>
        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h2 className="font-semibold">Slot packages</h2>
          <p className="text-xs text-muted-foreground">Save changed prices, then sync to Stripe. Existing subscriptions keep their original price. Sync does not open checkout.</p>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr><th>Slots</th><th>Price / month</th><th>On sale</th><th /></tr>
            </thead>
            <tbody>
              {pkgs.map((p, i) => (
                <tr key={i}>
                  <td><input className={`${input} w-16`} type="number" value={p.slots} onChange={(e) => set("packages", pkgs.map((x, j) => (j === i ? { ...x, slots: num(e.target.value) } : x)))} /></td>
                  <td>$<input className={`${input} w-20`} type="number" step="0.01" value={(p.priceCents / 100).toFixed(2)} onChange={(e) => set("packages", pkgs.map((x, j) => (j === i ? { ...x, priceCents: Math.round(num(e.target.value) * 100) } : x)))} /></td>
                  <td><input type="checkbox" checked={p.enabled} onChange={(e) => set("packages", pkgs.map((x, j) => (j === i ? { ...x, enabled: e.target.checked } : x)))} /></td>
                  <td><span className="text-xs text-muted-foreground">{p.stripePriceId ? "Synced" : "Needs sync"}</span> <button type="button" className="text-xs text-red-500" onClick={() => set("packages", pkgs.filter((_, j) => j !== i))}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="text-sm text-primary" onClick={() => set("packages", [...pkgs, { slots: 4, priceCents: 0, currency: "usd", enabled: false, order: pkgs.length, stripePriceId: null }])}>
            + Add package
          </button>
          <button type="button" className="ml-4 text-sm text-primary" onClick={onSync}>Sync saved prices to Stripe</button>
        </section>
        <section className="space-y-2 rounded-xl border border-border bg-card p-4">
          <h2 className="font-semibold">Regions</h2>
          {t.regions.map((r, i) => (
            <div key={r.key} className="flex items-center gap-2 text-sm">
              <input className={`${input} w-32`} value={r.label} onChange={(e) => set("regions", t.regions.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <code className="text-xs text-muted-foreground">{r.key}</code>
              <label className="flex items-center gap-1"><input type="checkbox" checked={r.salesEnabled} onChange={(e) => set("regions", t.regions.map((x, j) => (j === i ? { ...x, salesEnabled: e.target.checked } : x)))} /> sales</label>
            </div>
          ))}
          {t.regions.map((r) => <CapacityStatus key={r.key} regionKey={r.key} />)}
        </section>
        <button type="button" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" onClick={() => onSave({ ...t, packages: pkgs.map((p, i) => ({ ...p, order: i })) })}>
          Save plan
        </button>
      </div>
    </div>
  );
}

function CapacityStatus({ regionKey }: { regionKey: string }) {
  const [capacity, setCapacity] = useState<{ availableSlots: number; reason: string | null } | null>(null);
  const refresh = useCallback(() => {
    void api(`/api/admin/hosting/capacity?region=${encodeURIComponent(regionKey)}`)
      .then((data) => setCapacity(data))
      .catch(() => setCapacity({ availableSlots: 0, reason: "CAPACITY_UNAVAILABLE" }));
  }, [regionKey]);
  useEffect(() => { const timer = setTimeout(refresh, 0); return () => clearTimeout(timer); }, [refresh]);
  return <div className="flex items-center justify-between gap-2 rounded border border-border p-2 text-xs">
    <span>{regionKey}: {capacity ? capacity.reason ? `Unavailable (${capacity.reason.replaceAll("_", " ").toLowerCase()})` : `${capacity.availableSlots} Basic slots available` : "Checking capacity…"}</span>
    <button type="button" className="text-primary" onClick={refresh}>Refresh</button>
  </div>;
}

const FIT_TONE = { safe: "text-emerald-500", warning: "text-amber-500", exceeds: "text-red-500", unknown: "text-muted-foreground" } as const;

function GamesTab({ tier, profiles, onSave }: { tier: Tier; profiles: ProfileInfo[]; onSave: (t: Tier) => void }) {
  const [games, setGames] = useState<TierGame[]>(tier.games);
  const [adding, setAdding] = useState("");
  const byKey = new Map(profiles.map((p) => [p.key, p]));
  const update = (i: number, patch: Partial<TierGame>) => setGames((g) => g.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const available = profiles.filter((p) => !games.some((g) => g.profileKey === p.key));
  const rc = tier.resourceClass;
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <h2 className="font-semibold">Basic game catalog</h2>
      <p className="text-xs text-muted-foreground">
        Removing a game from new servers does not touch existing customer servers; &ldquo;Existing starts&rdquo; controls whether theirs can still start.
        Resource fit compares each profile&apos;s measured envelope with one unit ({rc.cpuPerUnit} CPU / {rc.memoryMbPerUnit} MB).
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-1">Profile</th><th>Basic</th><th>New servers</th><th>Existing starts</th><th>Slots (min–max, step)</th><th>Readiness</th><th>Slot cap</th><th>Resource fit</th><th />
            </tr>
          </thead>
          <tbody>
            {games.map((g, i) => {
              const p = byKey.get(g.profileKey);
              return (
                <tr key={g.profileKey} className="border-t border-border align-top">
                  <td className="py-2 font-mono text-xs">{g.profileKey}{!p ? <span className="block text-amber-500">no server profile yet</span> : null}</td>
                  <td><input type="checkbox" checked={g.enabled} onChange={(e) => update(i, { enabled: e.target.checked })} /></td>
                  <td><input type="checkbox" checked={g.newServerCreationEnabled} onChange={(e) => update(i, { newServerCreationEnabled: e.target.checked })} /></td>
                  <td><input type="checkbox" checked={g.existingServerStartEnabled} onChange={(e) => update(i, { existingServerStartEnabled: e.target.checked })} /></td>
                  <td className="whitespace-nowrap">
                    <input className={`${input} w-12`} type="number" value={g.minSlots} onChange={(e) => update(i, { minSlots: num(e.target.value) })} />–
                    <input className={`${input} w-12`} type="number" value={g.maxSlots} onChange={(e) => update(i, { maxSlots: num(e.target.value) })} />,
                    <input className={`${input} w-12`} type="number" value={g.slotIncrement} onChange={(e) => update(i, { slotIncrement: num(e.target.value) })} />
                  </td>
                  <td>
                    <select className={input} value={g.readinessStatus} onChange={(e) => update(i, { readinessStatus: e.target.value as TierGame["readinessStatus"] })}>
                      <option value="draft">Draft</option>
                      <option value="testing">Testing</option>
                      <option value="verified">Verified</option>
                    </select>
                  </td>
                  <td className="text-xs">
                    {p?.capEnforced ? (
                      <span className="text-emerald-500">Enforced</span>
                    ) : (
                      <span className="text-amber-500" title="The game host does not yet enforce a player cap for this recipe, so a server may accept more players than its slots.">
                        Not enforced — players beyond the slot count can join
                      </span>
                    )}
                  </td>
                  <td className={`text-xs ${FIT_TONE[p?.fit || "unknown"]}`}>
                    {p?.fit === "unknown" || !p ? "No samples yet" : `${p.fit.toUpperCase()} · ${p.cpuCores.toFixed(2)} CPU / ${Math.round(p.ramBytes / 1024 / 1024)} MB · ${p.samples} samples`}
                    {p ? <span className="block text-muted-foreground" title={p.lastVerifiedAt ? `Last verified ${new Date(p.lastVerifiedAt).toLocaleString()}` : "No profile verification date"}>
                      Community: {p.verification} · query {p.queryVerified ? "yes" : "no"} · join {p.joinVerified ? "yes" : "no"} · measured through {p.measuredThroughPlayers} players
                    </span> : null}
                    {p?.fit === "exceeds" ? <span className="block">Consider Pro</span> : null}
                  </td>
                  <td><button type="button" className="text-xs text-red-500" onClick={() => setGames((x) => x.filter((_, j) => j !== i))}>Remove</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select className={input} value={adding} onChange={(e) => setAdding(e.target.value)}>
          <option value="">Add a server profile…</option>
          {available.map((p) => (
            <option key={p.key} value={p.key}>{p.key}</option>
          ))}
        </select>
        <button
          type="button"
          className="text-sm text-primary disabled:opacity-50"
          disabled={!adding}
          onClick={() => {
            setGames((g) => [...g, { profileKey: adding, enabled: false, newServerCreationEnabled: true, existingServerStartEnabled: true, minSlots: 4, maxSlots: 16, slotIncrement: 4, supportedRegions: tier.regions.map((r) => r.key), allowedMods: [], readinessStatus: "draft" }]);
            setAdding("");
          }}
        >
          + Add
        </button>
      </div>
      <button type="button" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" onClick={() => onSave({ ...tier, games })}>
        Save games
      </button>
    </section>
  );
}

function SubscriptionsTab({ tier, subs, act }: { tier: Tier; subs: Sub[]; act: (w: () => Promise<unknown>, done: string) => void }) {
  const [user, setUser] = useState("");
  const [slots, setSlots] = useState(16);
  const [region, setRegion] = useState(tier.regions[0]?.key || "");
  const patch = (id: string, body: Record<string, unknown>, done: string) =>
    act(() => api(`/api/admin/hosting/subscriptions/${id}`, { method: "PATCH", body: JSON.stringify(body) }), done);
  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-4">
        <h2 className="w-full font-semibold">Grant a subscription</h2>
        <p className="w-full text-xs text-muted-foreground">For rollout testing. Manual grants are separate from Stripe billing.</p>
        <label className="text-sm">Username or email<input className={`${input} mt-1 block w-56`} value={user} onChange={(e) => setUser(e.target.value)} /></label>
        <label className="text-sm">Slots<input className={`${input} mt-1 block w-20`} type="number" value={slots} onChange={(e) => setSlots(num(e.target.value))} /></label>
        <label className="text-sm">Region
          <select className={`${input} mt-1 block`} value={region} onChange={(e) => setRegion(e.target.value)}>
            {tier.regions.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </label>
        <button
          type="button"
          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground"
          onClick={() => act(() => api("/api/admin/hosting/subscriptions", { method: "POST", body: JSON.stringify({ user, slotCapacity: slots, regionKey: region }) }), "Subscription granted.")}
        >
          Grant
        </button>
      </section>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[800px] text-sm">
          <thead className="bg-secondary/50 text-left text-xs text-muted-foreground">
            <tr><th className="p-2">Customer</th><th>Slots in use</th><th>Region</th><th>Servers</th><th>Status</th><th>Source</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {subs.map((s) => (
              <tr key={s.id} className="border-t border-border">
                <td className="p-2">{s.username || "?"}<span className="block text-xs text-muted-foreground">{s.email}</span></td>
                <td>{s.allocatedSlots} / {s.slotCapacity}</td>
                <td>{s.regionKey}</td>
                <td>{s.onlineServers} online · {s.savedServers} saved</td>
                <td>{s.status}</td>
                <td>{s.source}</td>
                <td className="space-x-2 whitespace-nowrap">
                  {s.source === "manual" ? <><button type="button" className="text-xs text-primary" onClick={() => {
                    const v = window.prompt("New slot capacity", String(s.slotCapacity));
                    if (v) patch(s.id, { slotCapacity: num(v) }, "Slots updated.");
                  }}>Resize</button>
                  {s.status === "active" ? (
                    <button type="button" className="text-xs text-amber-500" onClick={() => patch(s.id, { status: "suspended" }, "Suspended; servers stop on the next reconcile.")}>Suspend</button>
                  ) : (
                    <button type="button" className="text-xs text-emerald-500" onClick={() => patch(s.id, { status: "active" }, "Resumed.")}>Resume</button>
                  )}
                  <button type="button" className="text-xs text-red-500" onClick={() => {
                    if (window.confirm("Cancel this subscription? Servers stop; saved servers are kept.")) patch(s.id, { status: "canceled" }, "Canceled.");
                  }}>Cancel</button></> : <span className="text-xs text-muted-foreground">Managed by Stripe</span>}
                </td>
              </tr>
            ))}
            {subs.length === 0 ? <tr><td className="p-3 text-muted-foreground" colSpan={7}>No subscriptions yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ServersTab({ servers, act }: { servers: CustomerServer[]; act: (w: () => Promise<unknown>, done: string) => void }) {
  const run = (id: string, action: "stop" | "delist", done: string) =>
    act(() => api(`/api/admin/hosting/servers/${id}`, { method: "POST", body: JSON.stringify({ action }) }), done);
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[800px] text-sm">
        <thead className="bg-secondary/50 text-left text-xs text-muted-foreground">
          <tr><th className="p-2">Server</th><th>Owner</th><th>Game</th><th>Slots</th><th>State</th><th>Players</th><th>Visibility</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {servers.map((s) => (
            <tr key={s.id} className="border-t border-border">
              <td className="p-2">{s.name}</td>
              <td>{s.owner || "?"}</td>
              <td>{s.gameTitle}</td>
              <td>{s.slots}</td>
              <td>{s.online ? s.runtimeState : "stopped"}{s.statusReason ? <span className="block text-xs text-muted-foreground">{s.statusReason}</span> : null}</td>
              <td>{s.players ?? "—"}</td>
              <td>{s.visibility}</td>
              <td className="space-x-2 whitespace-nowrap">
                {s.online ? <button type="button" className="text-xs text-amber-500" onClick={() => run(s.id, "stop", "Stop requested.")}>Stop</button> : null}
                {s.visibility === "public" ? <button type="button" className="text-xs text-red-500" onClick={() => run(s.id, "delist", "Delisted from Multiplayer.")}>Delist</button> : null}
              </td>
            </tr>
          ))}
          {servers.length === 0 ? <tr><td className="p-3 text-muted-foreground" colSpan={8}>No customer servers yet.</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}
