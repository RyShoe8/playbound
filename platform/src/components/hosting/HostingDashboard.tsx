"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { HostingSupport } from "@/components/hosting/HostingSupport";

type Server = {
  id: string;
  slug: string;
  name: string;
  description: string;
  visibility: "public" | "unlisted" | "private";
  gameSlug: string;
  gameTitle: string;
  editionSlug: string | null;
  slots: number;
  online: boolean;
  runtimeState: string;
  health: string;
  players: number | null;
  host: string | null;
  port: number | null;
  statusReason: string | null;
};

type Game = { profileKey: string; gameSlug: string; gameTitle: string; editionSlug: string | null; sizes: number[] };

type Me = {
  subscription: null | {
    id: string;
    tierName: string;
    regionLabel: string;
    slotCapacity: number;
    allocatedSlots: number;
    status: string;
    source: "manual" | "stripe";
    cancelAtPeriodEnd?: boolean;
    currentPeriodEnd?: string | null;
    scheduledChange?: { targetSlots: number; effectiveAt: string; state: "preparing" | "scheduled" } | null;
  };
  limits?: { maxSavedServers: number; startsDisabled: boolean };
  packages?: Array<{ slots: number; priceCents: number; currency: string }>;
  pendingUpgradeSlots?: number | null;
  games?: Game[];
  servers: Server[];
  shared?: Array<Server & { role: string }>;
};

const VISIBILITY_LABEL = { public: "Public", unlisted: "Unlisted", private: "Private" } as const;

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function statusOf(s: Server) {
  if (!s.online) return { label: "Offline", tone: "text-muted-foreground" };
  if (s.runtimeState === "running") return { label: "Online", tone: "text-emerald-500" };
  if (s.runtimeState === "failed") return { label: "Restarting", tone: "text-amber-500" };
  return { label: "Starting", tone: "text-amber-500" };
}

export function HostingDashboard() {
  const [me, setMe] = useState<Me | null>(null);
  const [authError, setAuthError] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/hosting/me", { cache: "no-store" });
      if (res.status === 401) {
        setAuthError(true);
        return;
      }
      setMe(await res.json());
    } catch {
      /* keep the last good view */
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const t = setInterval(() => void load(), 10_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);

  async function run(key: string, work: () => Promise<unknown>, done?: string) {
    setBusy(key);
    setMessage(null);
    try {
      await work();
      if (done) setMessage(done);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  if (authError) {
    return (
      <div className="space-y-3 text-center">
        <h1 className="text-2xl font-bold">My Servers</h1>
        <p className="text-muted-foreground">Sign in to manage your PlayBound Dedicated servers.</p>
        <Link href="/login?callbackUrl=/hosting/servers" className="inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
          Sign in
        </Link>
      </div>
    );
  }
  if (!me) return <p className="text-muted-foreground">Loading…</p>;
  const sharedSection = me.shared?.length ? (
    <section className="space-y-3" aria-label="Shared with you">
      <h2 className="text-lg font-semibold">Shared with you</h2>
      {me.shared.map((s) => (
        <ServerRow key={s.id} server={s} free={0} busy={busy} run={run} role={s.role === "administrator" ? "Administrator" : "Moderator"} />
      ))}
    </section>
  ) : null;
  if (!me.subscription) {
    return (
      <div className="space-y-3 text-center">
        <h1 className="text-2xl font-bold">My Servers</h1>
        <p className="text-muted-foreground">You don&apos;t have a PlayBound Dedicated plan yet.</p>
        <Link href="/hosting" className="inline-block rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-secondary">
          See hosting plans
        </Link>
        {sharedSection ? <div className="pt-6 text-left">{sharedSection}</div> : null}
        <div className="pt-6 text-left"><HostingSupport /></div>
      </div>
    );
  }

  const sub = me.subscription;
  const free = Math.min(sub.slotCapacity, sub.scheduledChange?.targetSlots || sub.slotCapacity) - sub.allocatedSlots;
  const atLimit = me.limits ? me.servers.length >= me.limits.maxSavedServers : false;

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <p className="text-sm font-semibold tracking-wide text-primary uppercase">{sub.tierName}</p>
        <h1 className="text-2xl font-bold">My Servers</h1>
        <p className="text-sm text-muted-foreground">
          {sub.regionLabel} · {sub.slotCapacity} slots · <strong>{sub.allocatedSlots} / {sub.slotCapacity}</strong> in use
          {sub.status !== "active" ? ` · ${sub.status.replace("_", " ")}` : ""}
        </p>
        <div className="h-2 w-full max-w-md overflow-hidden rounded bg-secondary" aria-hidden>
          <div className="h-full bg-primary" style={{ width: `${Math.min(100, (sub.allocatedSlots / sub.slotCapacity) * 100)}%` }} />
        </div>
        {sub.cancelAtPeriodEnd ? <p className="text-sm text-amber-500">Your plan is set to end {sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString() : "after the paid period"}. Your servers stay available until then.</p> : null}
        {sub.scheduledChange ? <p className="text-sm text-amber-500">{sub.scheduledChange.targetSlots} slots from {new Date(sub.scheduledChange.effectiveAt).toLocaleDateString()} · {sub.scheduledChange.state === "preparing" ? "billing schedule pending" : "scheduled"}. New server starts are limited to {sub.scheduledChange.targetSlots} slots now.</p> : null}
        {me.pendingUpgradeSlots ? <p className="text-sm text-amber-500">Upgrade to {me.pendingUpgradeSlots} slots is being reconciled. Extra capacity is reserved; contact hosting support if this stays pending.</p> : null}
        {sub.source === "stripe" && (sub.status === "active" || sub.status === "past_due") ? <button type="button" disabled={busy !== null} className="text-sm text-primary underline disabled:opacity-50" onClick={() => {
          if (!sub.cancelAtPeriodEnd && !window.confirm("End your Dedicated Basic plan after the current paid period? Your servers will stay available until then.")) return;
          void run("billing", () => api("/api/hosting/subscription", { method: "PATCH", body: JSON.stringify({ cancelAtPeriodEnd: !sub.cancelAtPeriodEnd }) }), sub.cancelAtPeriodEnd ? "Cancellation removed." : "Cancellation scheduled for the end of your paid period.");
        }}>{sub.cancelAtPeriodEnd ? "Keep my plan" : "Cancel at period end"}</button> : null}
        {sub.source === "stripe" && sub.status === "active" && !sub.cancelAtPeriodEnd && !sub.scheduledChange && !me.pendingUpgradeSlots ? <div className="flex flex-wrap items-center gap-2 pt-2 text-sm">
          <span className="text-muted-foreground">Need more slots?</span>
          {(me.packages || []).filter((p) => p.slots > sub.slotCapacity).map((p) => <button key={p.slots} type="button" disabled={busy !== null} className="rounded border border-border px-2 py-1 hover:bg-secondary disabled:opacity-50" onClick={() => {
            if (!window.confirm(`Upgrade to ${p.slots} slots for $${(p.priceCents / 100).toFixed(2)}/${p.currency.toUpperCase()} per month? Stripe may charge a prorated amount now.`)) return;
            void run("billing", () => api("/api/hosting/subscription", { method: "POST", body: JSON.stringify({ slots: p.slots }) }), "Plan upgraded.");
          }}>{p.slots} slots · ${(p.priceCents / 100).toFixed(2)}/mo</button>)}
          {(me.packages || []).filter((p) => p.slots < sub.slotCapacity).map((p) => <button key={p.slots} type="button" disabled={busy !== null || sub.allocatedSlots > p.slots} className="rounded border border-border px-2 py-1 hover:bg-secondary disabled:opacity-50" title={sub.allocatedSlots > p.slots ? "Stop enough servers first" : undefined} onClick={() => {
            if (!window.confirm(`Schedule ${p.slots} slots for $${(p.priceCents / 100).toFixed(2)}/${p.currency.toUpperCase()} per month, starting next billing period? New server starts will be limited to ${p.slots} slots now.`)) return;
            void run("billing", () => api("/api/hosting/subscription", { method: "PUT", body: JSON.stringify({ slots: p.slots }) }), "Downgrade scheduled for the next billing period.");
          }}>{p.slots} slots next period · ${(p.priceCents / 100).toFixed(2)}/mo</button>)}
        </div> : null}
      </header>

      {me.limits?.startsDisabled ? (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">Server starts are temporarily paused.</p>
      ) : null}
      {message ? <p className="rounded-lg border border-border bg-secondary/50 p-3 text-sm" role="status">{message}</p> : null}

      <section className="space-y-3" aria-label="Saved servers">
        {me.servers.length === 0 ? <p className="text-sm text-muted-foreground">No servers yet. Create one below.</p> : null}
        {me.servers.map((s) => (
          <ServerRow key={s.id} server={s} free={free} busy={busy} run={run} />
        ))}
      </section>

      {sharedSection}

      <section className="rounded-xl border border-border bg-card p-5">
        {creating ? (
          <CreateServer
            games={me.games || []}
            free={free}
            capacity={sub.slotCapacity}
            onCancel={() => setCreating(false)}
            onCreate={(body, start) =>
              run("create", async () => {
                const { server } = await api("/api/hosting/servers", { method: "POST", body: JSON.stringify(body) });
                if (start) await api(`/api/hosting/servers/${server.id}/action`, { method: "POST", body: JSON.stringify({ action: "start" }) });
                setCreating(false);
              }, start ? "Server created and starting." : "Server saved.")
            }
          />
        ) : (
          <button
            type="button"
            disabled={atLimit}
            onClick={() => setCreating(true)}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            + Create Server
          </button>
        )}
        {atLimit ? (
          <p className="mt-2 text-xs text-muted-foreground">
            You&apos;ve saved {me.limits?.maxSavedServers} servers, the most a plan can keep. Delete one to create another.
          </p>
        ) : null}
      </section>
      <HostingSupport servers={me.servers.map((server) => ({ id: server.id, name: server.name }))} />
    </div>
  );
}

function ServerRow({
  server: s,
  free,
  busy,
  run,
  role,
}: {
  server: Server;
  free: number;
  busy: string | null;
  run: (key: string, work: () => Promise<unknown>, done?: string) => Promise<void>;
  role?: string;
}) {
  const status = statusOf(s);
  const action = (a: "start" | "stop") =>
    run(`${s.id}:${a}`, () => api(`/api/hosting/servers/${s.id}/action`, { method: "POST", body: JSON.stringify({ action: a }) }));
  const canStart = !s.online && s.slots <= free;
  const owner = !role;

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-card p-4">
      <div>
        <h2 className="font-semibold">
          <Link href={`/hosting/servers/${s.id}`} className="hover:text-primary">{s.name}</Link>
        </h2>
        <p className="text-sm text-muted-foreground">
          {s.gameTitle}
          {s.editionSlug ? ` • ${s.editionSlug}` : ""} · {s.slots} slots · {VISIBILITY_LABEL[s.visibility]}
          {role ? ` · ${role}` : ""}
        </p>
        <p className={`text-sm font-medium ${status.tone}`}>
          {status.label}
          {s.online && s.players !== null ? ` · ${s.players} / ${s.slots} players` : ""}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {owner ? (
          s.online ? (
            <button type="button" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50" disabled={busy !== null} onClick={() => void action("stop")}>
              Stop
            </button>
          ) : (
            <button
              type="button"
              className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              disabled={busy !== null || !canStart}
              title={canStart ? undefined : `Needs ${s.slots} free slots; ${free} free`}
              onClick={() => void action("start")}
            >
              Start
            </button>
          )
        ) : null}
        <Link href={`/hosting/servers/${s.id}`} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-secondary">
          Manage
        </Link>
      </div>
    </div>
  );
}

function CreateServer({
  games,
  free,
  capacity,
  onCancel,
  onCreate,
}: {
  games: Game[];
  free: number;
  capacity: number;
  onCancel: () => void;
  onCreate: (body: Record<string, unknown>, start: boolean) => void;
}) {
  const [profileKey, setProfileKey] = useState(games[0]?.profileKey || "");
  const game = games.find((g) => g.profileKey === profileKey);
  const sizes = (game?.sizes || []).filter((n) => n <= capacity);
  const [slots, setSlots] = useState<number>(sizes[0] || 4);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState("public");
  const size = sizes.includes(slots) ? slots : sizes[0];
  const body = { profileKey, slots: size, name, description, visibility };

  if (!games.length) return <p className="text-sm text-muted-foreground">No games are available for new servers right now.</p>;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Create a server</h2>
      <label className="block text-sm">
        Game
        <select className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5" value={profileKey} onChange={(e) => setProfileKey(e.target.value)}>
          {games.map((g) => (
            <option key={g.profileKey} value={g.profileKey}>
              {g.gameTitle}
              {g.editionSlug ? ` — ${g.editionSlug}` : ""}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="text-sm">
        <legend>Server size ({free} slots free now)</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {sizes.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={size === n}
              onClick={() => setSlots(n)}
              className={`rounded-lg border px-3 py-1.5 ${size === n ? "border-primary bg-primary/10 font-semibold" : "border-border"}`}
            >
              {n} players
            </button>
          ))}
        </div>
      </fieldset>
      <label className="block text-sm">
        Server name
        <input className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Friday Night Red Alert" />
      </label>
      <label className="block text-sm">
        Description
        <input className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5" maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Casual games. Everyone welcome." />
      </label>
      <label className="block text-sm">
        Visibility
        <select className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5" value={visibility} onChange={(e) => setVisibility(e.target.value)}>
          <option value="public">Public — listed in Multiplayer</option>
          <option value="unlisted">Unlisted — join by link or invite</option>
          <option value="private">Private</option>
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-secondary" onClick={() => onCreate(body, false)}>
          Save Setup
        </button>
        <button
          type="button"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          disabled={!size || size > free}
          title={size && size > free ? `Needs ${size} free slots` : undefined}
          onClick={() => onCreate(body, true)}
        >
          Create &amp; Start
        </button>
        <button type="button" className="px-3 py-2 text-sm text-muted-foreground" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
