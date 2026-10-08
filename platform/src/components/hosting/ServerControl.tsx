"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, RotateCw, TriangleAlert } from "lucide-react";
import { SettingControl } from "@/components/friends/PartyServerSettings";
import type { ServerSettingDefinition, ServerSettingValue, ServerSettingValues } from "@/lib/serverControl/settings";
import type { ServerControlCapabilities, ServerRuntimeState } from "@/lib/serverControl/adapter";

type Server = {
  id: string;
  name: string;
  description: string;
  visibility: "public" | "unlisted" | "private";
  gameTitle: string;
  editionSlug: string | null;
  slots: number;
  online: boolean;
  runtimeState: string;
  players: number | null;
  host: string | null;
  port: number | null;
  onlineSince: string | null;
  statusReason: string | null;
};
type Control = {
  role: "owner" | "administrator" | "moderator";
  permissions: string[];
  capabilities: ServerControlCapabilities;
  maps: boolean;
  status: ServerRuntimeState;
  definitions: ServerSettingDefinition[];
  values: ServerSettingValues;
};
type Player = { name: string; id?: string | null; pingMs?: number | null; score?: number | null };
type Person = { userId: string; username: string | null; role: string };
type Activity = { id: string; at: string; actor: string; actorKind: string; action: string; detail: string | null };

const ACTION_LABELS: Record<string, string> = {
  server_started: "started the server",
  server_stopped: "stopped the server",
  server_restarted: "restarted the server",
  server_recovered: "recovered the server",
  server_updated: "changed the server",
  settings_changed: "changed settings",
  map_changed: "changed the map",
  next_map_set: "set the next map",
  rotation_set: "set the map rotation",
  player_banned: "banned a player",
  player_unbanned: "lifted a ban",
  backup_created: "created a restore point",
  backup_restored: "restored a backup",
  backup_deleted: "deleted a restore point",
  world_backup_created: "backed up the world data",
  world_backup_restored: "restored the world data",
  player_kicked: "kicked a player",
  console_command: "ran a console command",
  access_granted: "gave someone a role",
  access_revoked: "removed someone's role",
  access_left: "left the server",
  admin_stopped: "stopped the server",
  admin_delisted: "delisted the server",
};
const ROLE_LABELS: Record<string, string> = { owner: "Owner", administrator: "Administrator", moderator: "Moderator" };
const MODE_LABEL = { live: "Applies immediately", "next-round": "Next round", restart: "Restart required" } as const;

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, { cache: "no-store", ...init, headers: { "content-type": "application/json", ...(init?.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function uptime(since: string | null) {
  if (!since) return null;
  const mins = Math.max(0, Math.round((Date.now() - new Date(since).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  return h < 48 ? `${h}h ${mins % 60}m` : `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function ServerControl({ serverId }: { serverId: string }) {
  const [server, setServer] = useState<Server | null>(null);
  const [control, setControl] = useState<Control | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("Overview");
  const base = `/api/hosting/servers/${encodeURIComponent(serverId)}`;

  const load = useCallback(async () => {
    try {
      const data = await api(base);
      setServer(data.server);
      setControl(data.control);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load this server");
    }
  }, [base]);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const t = setInterval(() => void load(), 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);

  async function run(work: () => Promise<unknown>, done?: string) {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      await work();
      if (done) setNotice(done);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (!server || !control) {
    return error ? (
      error === "Unauthorized" ? (
        <div className="space-y-3 text-center">
          <p className="text-muted-foreground">Sign in to manage this server.</p>
          <Link href={`/login?callbackUrl=/hosting/servers/${encodeURIComponent(serverId)}`} className="inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
            Sign in
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-destructive">{error}</p>
          <Link href="/hosting/servers" className="text-sm text-primary">← My Servers</Link>
        </div>
      )
    ) : (
      <p className="text-muted-foreground">Loading…</p>
    );
  }

  const may = (p: string) => control.permissions.includes(p);
  const running = control.status.status === "running";
  const tabs = [
    "Overview",
    control.capabilities.settings && control.definitions.some((d) => !control.maps || d.feature !== "map") &&
      (may("server:configure") || may("server:change_map")) ? "Settings" : null,
    control.maps ? "Maps" : null,
    control.capabilities.players ? "Players" : null,
    control.capabilities.console && may("server:console") ? "Console" : null,
    may("server:create_backup") || may("server:restore_backup") ? "Backups" : null,
    "Access",
    "Activity",
  ].filter(Boolean) as string[];
  const lifecycle = (action: "start" | "stop" | "restart", done: string) =>
    run(() => api(`${base}/action`, { method: "POST", body: JSON.stringify({ action }) }), done);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/hosting/servers" className="text-sm text-muted-foreground hover:text-foreground">← My Servers</Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{server.name}</h1>
            <p className="text-sm text-muted-foreground">
              {server.gameTitle}
              {server.editionSlug ? ` • ${server.editionSlug}` : ""} · {server.slots} slots · {ROLE_LABELS[control.role]}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {server.online ? (
              <>
                {may("server:restart") ? (
                  <button type="button" disabled={busy} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50" onClick={() => void lifecycle("restart", "Restarting…")}>
                    Restart
                  </button>
                ) : null}
                {may("server:stop") ? (
                  <button type="button" disabled={busy} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50" onClick={() => void lifecycle("stop", "Server stopped. Its slots are free again.")}>
                    Stop
                  </button>
                ) : null}
              </>
            ) : may("server:start") ? (
              <button type="button" disabled={busy} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50" onClick={() => void lifecycle("start", "Starting…")}>
                Start
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border" role="tablist">
        {tabs.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === t ? "border-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {error ? <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm" role="alert">{error}</p> : null}
      {notice ? <p className="rounded-lg border border-border bg-secondary/50 p-3 text-sm" role="status">{notice}</p> : null}

      {tab === "Overview" ? <Overview server={server} control={control} /> : null}
      {tab === "Settings" ? (
        <SettingsTab
          key={`${server.name}|${server.visibility}|${JSON.stringify(control.values)}`}
          base={base}
          server={server}
          control={control}
          busy={busy}
          run={run}
          may={may}
        />
      ) : null}
      {tab === "Maps" ? <MapsTab base={base} canChange={may("server:change_map")} run={run} /> : null}
      {tab === "Players" ? <PlayersTab base={base} running={running} canKick={may("server:kick_players")} canBan={may("server:ban_players")} run={run} /> : null}
      {tab === "Console" ? <ConsoleTab base={base} running={running} /> : null}
      {tab === "Backups" ? (
        <BackupsTab base={base} status={control.status.status} canCreate={may("server:create_backup")} canRestore={may("server:restore_backup")} canExport={may("server:configure")} run={run} />
      ) : null}
      {tab === "Access" ? <AccessTab base={base} canManage={may("server:manage_access")} run={run} /> : null}
      {tab === "Activity" ? <ActivityTab base={base} /> : null}
    </div>
  );
}

function Overview({ server, control }: { server: Server; control: Control }) {
  const [copied, setCopied] = useState(false);
  const st = control.status;
  const address = st.status === "running" && st.host && st.port ? `${st.host}:${st.port}` : null;
  const label =
    st.status === "running" ? "Online" : st.status === "pending" ? "Starting" : st.status === "failed" ? "Problem" : st.status === "unknown" ? "Status unavailable" : server.online ? "Recovering" : "Offline";
  const tone = st.status === "running" ? "text-emerald-500" : st.status === "stopped" && !server.online ? "text-muted-foreground" : "text-amber-500";
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <section className="space-y-2 rounded-xl border border-border bg-card p-4">
        <p className={`text-lg font-semibold ${tone}`}>{label}</p>
        {st.status === "running" ? (
          <p className="text-sm">
            {server.players !== null ? `${server.players} / ${server.slots} players` : `${server.slots} player slots`}
            {uptime(server.onlineSince) ? ` · up ${uptime(server.onlineSince)}` : ""}
          </p>
        ) : null}
        {st.error ? <p className="text-sm text-destructive">{st.error}</p> : null}
        {address ? (
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded border border-border px-2 py-1 font-mono text-sm hover:bg-secondary"
            onClick={() => {
              void navigator.clipboard?.writeText(address);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {address} <Copy className="size-3.5" aria-hidden /> {copied ? <span className="font-sans text-xs">Copied</span> : null}
          </button>
        ) : null}
      </section>
      <section className="space-y-1 rounded-xl border border-border bg-card p-4 text-sm">
        <p><span className="text-muted-foreground">Visibility:</span> {server.visibility === "public" ? "Public — listed in Multiplayer" : server.visibility === "unlisted" ? "Unlisted — join by link or invite" : "Hidden — not password protected"}</p>
        <p><span className="text-muted-foreground">Size:</span> {server.slots} slots</p>
        {server.description ? <p><span className="text-muted-foreground">Description:</span> {server.description}</p> : null}
        {control.capabilities.liveApply ? (
          <p className="text-xs text-muted-foreground">This game takes most changes live, without disconnecting anyone.</p>
        ) : (
          <p className="text-xs text-muted-foreground">Changes to this game apply when the server restarts.</p>
        )}
      </section>
    </div>
  );
}

function SettingsTab({
  base,
  server,
  control,
  busy,
  run,
  may,
}: {
  base: string;
  server: Server;
  control: Control;
  busy: boolean;
  run: (w: () => Promise<unknown>, done?: string) => Promise<void>;
  may: (p: string) => boolean;
}) {
  const [draft, setDraft] = useState<ServerSettingValues>(control.values);
  const [name, setName] = useState(server.name);
  const [description, setDescription] = useState(server.description);
  const [visibility, setVisibility] = useState(server.visibility);
  const running = control.status.status === "running";
  const configure = may("server:configure");
  const editableDefs = control.definitions.filter((d) => !control.maps || d.feature !== "map").filter((d) => configure || (d.feature === "map" && may("server:change_map")));
  const changed = editableDefs.map((d) => d.key).filter((k) => draft[k] !== undefined && draft[k] !== control.values[k]);
  const modeOf = (d: ServerSettingDefinition) => (!running ? null : control.capabilities.liveApply ? d.apply : "restart");
  const restartNeeded = running && changed.some((k) => modeOf(control.definitions.find((d) => d.key === k)!) === "restart");

  return (
    <div className="space-y-6">
      {configure ? (
        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h2 className="font-semibold">Server</h2>
          <label className="block text-sm">
            Server name
            <input className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block text-sm">
            Description
            <input className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5" maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label className="block text-sm">
            Visibility
            <select className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5" value={visibility} onChange={(e) => setVisibility(e.target.value as Server["visibility"])}>
              <option value="public">Public — listed in Multiplayer</option>
              <option value="unlisted">Unlisted — join by link or invite</option>
              <option value="private">Hidden — no public page (not password protected)</option>
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || (name === server.name && description === server.description && visibility === server.visibility)}
              className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              onClick={() =>
                void run(async () => {
                  const r = await api(base, { method: "PATCH", body: JSON.stringify({ name, description, visibility }) });
                  if (r.restartNeeded) throw new Error("Saved. Restart the server to show the new name in-game.");
                }, "Saved.")
              }
            >
              Save
            </button>
            {may("server:delete") && !server.online ? (
              <button
                type="button"
                disabled={busy}
                className="rounded-lg border border-destructive/50 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10"
                onClick={() => {
                  if (!window.confirm(`Delete ${server.name}? Its settings and saved world are removed.`)) return;
                  void run(async () => {
                    await api(base, { method: "DELETE" });
                    window.location.href = "/hosting/servers";
                  });
                }}
              >
                Delete server
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {editableDefs.length ? (
        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h2 className="font-semibold">Game settings</h2>
          {editableDefs.map((d) => {
            const mode = modeOf(d);
            return (
              <div key={d.key} className="space-y-1">
                <SettingControl
                  def={d}
                  value={(draft[d.key] ?? d.default) as ServerSettingValue}
                  disabled={busy}
                  onChange={(v) => setDraft((x) => ({ ...x, [d.key]: v }))}
                />
                {mode ? <p className="text-[11px] tracking-wide text-muted-foreground uppercase">{MODE_LABEL[mode]}</p> : null}
              </div>
            );
          })}
          {restartNeeded ? (
            <p className="flex items-start gap-2 rounded-md bg-secondary/60 p-3 text-xs">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              Applying this restarts the server and disconnects everyone on it.
            </p>
          ) : null}
          {!running ? <p className="text-xs text-muted-foreground">The server is offline; changes apply when it next starts.</p> : null}
          <button
            type="button"
            disabled={busy || !changed.length}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            onClick={() =>
              void run(async () => {
                const settings: ServerSettingValues = {};
                for (const k of changed) settings[k] = draft[k];
                const r = await api(`${base}/settings`, { method: "PATCH", body: JSON.stringify({ settings }) });
                if (r.rejected?.length) throw new Error(r.rejected.map((x: { key: string; reason: string }) => `${x.key}: ${x.reason}`).join(", "));
              }, running ? (restartNeeded ? "Server restarted with the new settings." : "Applied. Nobody was disconnected.") : "Saved for the next start.")
            }
          >
            {busy ? <RotateCw className="size-3.5 animate-spin" /> : null}
            {restartNeeded ? "Apply & Restart" : "Apply changes"}
          </button>
        </section>
      ) : null}
    </div>
  );
}

function PlayersTab({ base, running, canKick, canBan, run }: { base: string; running: boolean; canKick: boolean; canBan: boolean; run: (w: () => Promise<unknown>, done?: string) => Promise<void> }) {
  return (
    <div className="space-y-6">
      <PlayerList base={base} running={running} canKick={canKick} canBan={canBan} run={run} />
      <BanList base={base} canBan={canBan} run={run} />
    </div>
  );
}

function BanList({ base, canBan, run }: { base: string; canBan: boolean; run: (w: () => Promise<unknown>, done?: string) => Promise<void> }) {
  const [bans, setBans] = useState<{ id: string; name: string; at: string }[] | null>(null);
  const load = useCallback(async () => {
    const d = await api(`${base}/bans`).catch(() => null);
    if (d) setBans(d.bans);
  }, [base]);
  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const t = setInterval(() => void load(), 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);
  if (!bans?.length) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">Banned</h2>
      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {bans.map((b) => (
          <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
            <span>
              {b.name} <span className="text-xs text-muted-foreground">{new Date(b.at).toLocaleDateString()}</span>
            </span>
            {canBan ? (
              <button
                type="button"
                className="text-xs text-primary"
                onClick={() =>
                  void run(async () => {
                    const r = await api(`${base}/bans`, { method: "DELETE", body: JSON.stringify({ banId: b.id }) });
                    await load();
                    if (!r.liftedNow) throw new Error(`${b.name}'s ban lifts at the next restart (this game can't unban while running).`);
                  }, `${b.name} is no longer banned.`)
                }
              >
                Unban
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function PlayerList({ base, running, canKick, canBan, run }: { base: string; running: boolean; canKick: boolean; canBan: boolean; run: (w: () => Promise<unknown>, done?: string) => Promise<void> }) {
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const data = await api(`${base}/players`);
      setPlayers(data.players);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't read players");
    }
  }, [base]);
  useEffect(() => {
    if (!running) return;
    const first = setTimeout(() => void load(), 0);
    const t = setInterval(() => void load(), 10_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load, running]);
  if (!running) return <p className="text-sm text-muted-foreground">The server is offline.</p>;
  if (err) return <p className="text-sm text-destructive">{err}</p>;
  if (!players) return <p className="text-sm text-muted-foreground">Loading players…</p>;
  if (!players.length) return <p className="text-sm text-muted-foreground">Nobody is connected.</p>;
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-card">
      {players.map((p) => (
        <li key={`${p.id}-${p.name}`} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
          <span>
            {p.name}
            <span className="ml-2 text-xs text-muted-foreground">
              {p.score != null ? `${p.score} pts` : ""}
              {p.pingMs ? ` · ${p.pingMs} ms` : ""}
            </span>
          </span>
          <span className="flex gap-3">
          {canBan && p.id != null && !p.name.endsWith("(bot)") ? (
            <button
              type="button"
              className="text-xs text-destructive"
              onClick={() => {
                if (!window.confirm(`Ban ${p.name}? They're kicked now and can't rejoin this server.`)) return;
                void run(async () => {
                  await api(`${base}/bans`, { method: "POST", body: JSON.stringify({ playerId: p.id }) });
                  await load();
                }, `${p.name} was banned.`);
              }}
            >
              Ban
            </button>
          ) : null}
          {canKick && p.id != null ? (
            <button
              type="button"
              className="text-xs text-destructive"
              onClick={() => {
                if (!window.confirm(`Kick ${p.name}?`)) return;
                void run(async () => {
                  await api(`${base}/players`, { method: "POST", body: JSON.stringify({ action: "kick", playerId: p.id, playerName: p.name }) });
                  await load();
                }, `${p.name} was kicked.`);
              }}
            >
              Kick
            </button>
          ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

type MapsData = { options: { value: string; label: string }[]; freeText: boolean; current: string | null; running: boolean; mode: "live" | "restart"; canNext: boolean; canRotate: boolean; rotation: string[] };

function MapsTab({ base, canChange, run }: { base: string; canChange: boolean; run: (w: () => Promise<unknown>, done?: string) => Promise<void> }) {
  const [data, setData] = useState<MapsData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pick, setPick] = useState("");
  const [rotation, setRotationDraft] = useState<string[] | null>(null);
  const load = useCallback(async () => {
    try {
      setData((await api(`${base}/maps`)) as MapsData);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't read maps");
    }
  }, [base]);
  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    return () => clearTimeout(first);
  }, [load]);
  if (err) return <p className="text-sm text-destructive">{err}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Loading maps…</p>;
  const label = (v: string) => data.options.find((o) => o.value === v)?.label || v;
  const selected = pick || data.current || data.options[0]?.value || "";
  const rot = rotation ?? data.rotation;
  const move = (i: number, j: number) => {
    const next = [...rot];
    [next[i], next[j]] = [next[j], next[i]];
    setRotationDraft(next);
  };
  const post = (body: Record<string, unknown>, done: string) =>
    run(async () => {
      await api(`${base}/maps`, { method: "POST", body: JSON.stringify(body) });
      await load();
    }, done);

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <p className="text-sm">
          <span className="text-muted-foreground">{data.mode === "restart" || !data.running ? "Starting map:" : "Current map:"}</span>{" "}
          <strong>{data.current ? label(data.current) : data.running ? "unknown" : "server offline"}</strong>
        </p>
        {canChange ? (
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm">
              Map
              {data.freeText ? <input className="mt-1 block rounded border border-border bg-background px-2 py-1.5" value={selected} onChange={(e) => setPick(e.target.value)} maxLength={64} pattern="[A-Za-z0-9_./-]+" /> : <select className="mt-1 block rounded border border-border bg-background px-2 py-1.5" value={selected} onChange={(e) => setPick(e.target.value)}>
                {data.options.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>}
            </label>
            <button type="button" disabled={!selected || (data.mode === "live" && !data.running)} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50" onClick={() => void post({ action: "change", map: selected }, data.mode === "restart" ? data.running ? `Restarting with ${label(selected)}.` : `${label(selected)} saved for the next start.` : `Changing to ${label(selected)}.`)}>
              {data.mode === "restart" ? data.running ? "Change & restart" : "Save starting map" : "Change now"}
            </button>
            {data.canNext ? (
              <button type="button" disabled={!data.running} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50" onClick={() => void post({ action: "next", map: selected }, `${label(selected)} is next.`)}>
                Play next
              </button>
            ) : null}
          </div>
        ) : null}
        {data.mode === "restart" && data.running ? <p className="text-xs text-amber-500">Changing maps restarts the server and disconnects everyone.</p> : null}
        {data.freeText ? <p className="text-xs text-muted-foreground">Enter a map name installed on this server. An unknown map may prevent it from starting.</p> : null}
        {data.mode === "live" && !data.running ? <p className="text-xs text-muted-foreground">Start the server to change maps.</p> : null}
      </section>

      {data.canRotate ? (
        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h2 className="font-semibold">Rotation</h2>
          <p className="text-xs text-muted-foreground">Played in this order after the current map, then repeats. Kept across restarts.</p>
          {rot.length ? (
            <ol className="space-y-1 text-sm">
              {rot.map((m, i) => (
                <li key={`${m}-${i}`} className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1">
                  <span>{i + 1}. {label(m)}</span>
                  {canChange ? (
                    <span className="flex gap-2 text-xs">
                      <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, i - 1)}>↑</button>
                      <button type="button" aria-label="Move down" disabled={i === rot.length - 1} onClick={() => move(i, i + 1)}>↓</button>
                      <button type="button" className="text-destructive" onClick={() => setRotationDraft(rot.filter((_, j) => j !== i))}>Remove</button>
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">No rotation — the game uses its own.</p>
          )}
          {canChange ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-secondary" onClick={() => setRotationDraft([...rot, selected])}>
                + Add {label(selected)}
              </button>
              <button
                type="button"
                disabled={rotation === null}
                className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                onClick={() =>
                  void post({ action: "rotation", maps: rot }, data.running ? "Rotation saved. It starts after the current map." : "Rotation saved for the next start.").then(() => setRotationDraft(null))
                }
              >
                Save rotation
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

type BackupRow = { id: string; kind: "manual" | "automatic" | "before-restore"; label: string | null; at: string; summary: string };
const BACKUP_KIND: Record<BackupRow["kind"], string> = { manual: "Restore point", automatic: "Daily backup", "before-restore": "Before a restore" };

function BackupsTab({
  base,
  status,
  canCreate,
  canRestore,
  canExport,
  run,
}: {
  base: string;
  status: string;
  canCreate: boolean;
  canRestore: boolean;
  canExport: boolean;
  run: (w: () => Promise<unknown>, done?: string) => Promise<void>;
}) {
  const [data, setData] = useState<{ backups: BackupRow[]; retention: number } | null>(null);
  const [label, setLabel] = useState("");
  const load = useCallback(async () => {
    const d = await api(`${base}/backups`).catch(() => null);
    if (d) setData(d);
  }, [base]);
  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    return () => clearTimeout(first);
  }, [load]);
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        A restore point saves how this server is set up: name, visibility, size, game settings, map rotation, bans and roles.
        PlayBound also takes one every day the setup changes. Up to {data.retention} are kept; the oldest goes first.
      </p>
      {canCreate ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api(`${base}/backups`, { method: "POST", body: JSON.stringify({ action: "create", label }) });
              setLabel("");
              await load();
            }, "Restore point created.");
          }}
        >
          <label className="text-sm">
            Label (optional)
            <input className="mt-1 block rounded border border-border bg-background px-2 py-1.5" maxLength={80} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Before the tournament" />
          </label>
          <button type="submit" className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">Create restore point</button>
          {canExport ? (
            <a href={`${base}/export`} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-secondary">Export setup</a>
          ) : null}
        </form>
      ) : null}
      {data.backups.length ? (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {data.backups.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 text-sm">
              <span>
                <span className="font-medium">{b.label || BACKUP_KIND[b.kind]}</span>{" "}
                <span className="text-xs text-muted-foreground">{new Date(b.at).toLocaleString()}</span>
                <span className="block text-xs text-muted-foreground">{b.summary}</span>
              </span>
              {canRestore ? (
                <span className="flex gap-3">
                  <button
                    type="button"
                    className="text-xs text-primary"
                    onClick={() => {
                      if (!window.confirm("Restore this setup? The current one is saved first, so you can undo this.")) return;
                      void run(async () => {
                        const r = await api(`${base}/backups`, { method: "POST", body: JSON.stringify({ action: "restore", backupId: b.id }) });
                        await load();
                        if (r.notes?.length) throw new Error(`Restored. ${r.notes.join(" ")}`);
                      }, "Restored.");
                    }}
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    className="text-xs text-destructive"
                    onClick={() => {
                      if (!window.confirm("Delete this restore point?")) return;
                      void run(async () => {
                        await api(`${base}/backups`, { method: "DELETE", body: JSON.stringify({ backupId: b.id }) });
                        await load();
                      }, "Deleted.");
                    }}
                  >
                    Delete
                  </button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No restore points yet.</p>
      )}
      <WorldDataSection base={base} status={status} canCreate={canCreate} canRestore={canRestore} run={run} />
    </div>
  );
}

type WorldBackupRow = { id: string; createdAt: string; bytes: number; files: number; kind: "manual" | "before-restore" };

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/** Saved worlds and player data for games that keep them on the host. Renders nothing for other games. */
function WorldDataSection({
  base,
  status,
  canCreate,
  canRestore,
  run,
}: {
  base: string;
  status: string;
  canCreate: boolean;
  canRestore: boolean;
  run: (w: () => Promise<unknown>, done?: string) => Promise<void>;
}) {
  const [data, setData] = useState<{ supported: boolean; backups: WorldBackupRow[]; retention: number } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setData(await api(`${base}/world-backups`));
      setProblem(null);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Could not load world backups");
    }
  }, [base]);
  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    return () => clearTimeout(first);
  }, [load]);
  if (problem) return <p className="text-xs text-destructive">World data: {problem}</p>;
  if (!data?.supported) return null;
  const stopped = status !== "running" && status !== "pending";
  return (
    <section className="space-y-3 border-t border-border pt-4">
      <h3 className="font-semibold">World data</h3>
      <p className="text-xs text-muted-foreground">
        A world backup saves this server&apos;s saved games and player data on the host. Up to {data.retention} are kept; the oldest goes first.
        Restoring replaces the current world, so the server must be stopped. The current world is backed up first.
      </p>
      {canCreate ? (
        <button
          type="button"
          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground"
          onClick={() => void run(async () => { await api(`${base}/world-backups`, { method: "POST", body: JSON.stringify({ action: "create" }) }); await load(); }, "World data backed up.")}
        >
          Back up world data
        </button>
      ) : null}
      {data.backups.length ? (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {data.backups.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 text-sm">
              <span>
                <span className="font-medium">{b.kind === "before-restore" ? "Before a restore" : "World backup"}</span>{" "}
                <span className="text-xs text-muted-foreground">{new Date(b.createdAt).toLocaleString()}</span>
                <span className="block text-xs text-muted-foreground">{formatBytes(b.bytes)} · {b.files.toLocaleString()} files</span>
              </span>
              {canRestore ? (
                <button
                  type="button"
                  className="text-xs text-primary disabled:opacity-50"
                  disabled={!stopped}
                  title={stopped ? undefined : "Stop the server first"}
                  onClick={() => {
                    if (!window.confirm("Restore this world? The current world is saved first, so you can undo this.")) return;
                    void run(async () => { await api(`${base}/world-backups`, { method: "POST", body: JSON.stringify({ action: "restore", backupId: b.id }) }); await load(); }, "World data restored.");
                  }}
                >
                  Restore
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No world backups yet.</p>
      )}
    </section>
  );
}

function ConsoleTab({ base, running }: { base: string; running: boolean }) {
  const [lines, setLines] = useState<{ kind: "in" | "out" | "err"; text: string }[]>([]);
  const [command, setCommand] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => endRef.current?.scrollIntoView({ block: "nearest" }), [lines]);
  if (!running) return <p className="text-sm text-muted-foreground">Start the server to use its console.</p>;
  async function send() {
    const c = command.trim();
    if (!c) return;
    setSending(true);
    setLines((l) => [...l, { kind: "in", text: `> ${c}` }]);
    setCommand("");
    try {
      const r = await api(`${base}/console`, { method: "POST", body: JSON.stringify({ command: c }) });
      setLines((l) => [...l, { kind: "out", text: r.output || "(no output)" }]);
    } catch (e) {
      setLines((l) => [...l, { kind: "err", text: e instanceof Error ? e.message : "Failed" }]);
    } finally {
      setSending(false);
    }
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Game console commands, sent to the server&apos;s own control channel. Everything you run is recorded in Activity.
      </p>
      <div className="h-80 overflow-y-auto rounded-xl border border-border bg-black/80 p-3 font-mono text-xs text-zinc-100">
        {lines.map((l, i) => (
          <pre key={i} className={`whitespace-pre-wrap ${l.kind === "in" ? "text-sky-300" : l.kind === "err" ? "text-red-400" : ""}`}>{l.text}</pre>
        ))}
        <div ref={endRef} />
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          className="flex-1 rounded border border-border bg-background px-2 py-1.5 font-mono text-sm"
          value={command}
          maxLength={200}
          placeholder="status"
          onChange={(e) => setCommand(e.target.value)}
          aria-label="Console command"
        />
        <button type="submit" disabled={sending || !command.trim()} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          Send
        </button>
      </form>
    </div>
  );
}

function AccessTab({ base, canManage, run }: { base: string; canManage: boolean; run: (w: () => Promise<unknown>, done?: string) => Promise<void> }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState("moderator");
  const load = useCallback(async () => {
    const data = await api(`${base}/access`).catch(() => null);
    if (data) setPeople(data.people);
  }, [base]);
  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    return () => clearTimeout(first);
  }, [load]);
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Administrators can start, stop, configure and use the console. Moderators can change maps and kick players.
        Only the owner can manage access, billing or delete the server.
      </p>
      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {(people || []).map((p) => (
          <li key={p.userId} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
            <span>
              {p.username || "Unknown user"} <span className="text-xs text-muted-foreground">{ROLE_LABELS[p.role] || p.role}</span>
            </span>
            {canManage && p.role !== "owner" ? (
              <button
                type="button"
                className="text-xs text-destructive"
                onClick={() => void run(async () => {
                  await api(`${base}/access`, { method: "DELETE", body: JSON.stringify({ userId: p.userId }) });
                  await load();
                }, "Removed.")}
              >
                Remove
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {canManage ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api(`${base}/access`, { method: "POST", body: JSON.stringify({ username, role }) });
              setUsername("");
              await load();
            }, "Access granted.");
          }}
        >
          <label className="text-sm">
            PlayBound username
            <input className="mt-1 block rounded border border-border bg-background px-2 py-1.5" value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
          <label className="text-sm">
            Role
            <select className="mt-1 block rounded border border-border bg-background px-2 py-1.5" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="moderator">Moderator</option>
              <option value="administrator">Administrator</option>
            </select>
          </label>
          <button type="submit" disabled={!username.trim()} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            Add
          </button>
        </form>
      ) : null}
    </div>
  );
}

function ActivityTab({ base }: { base: string }) {
  const [rows, setRows] = useState<Activity[] | null>(null);
  useEffect(() => {
    const first = setTimeout(() => {
      void api(`${base}/activity`).then((d) => setRows(d.activity)).catch(() => setRows([]));
    }, 0);
    return () => clearTimeout(first);
  }, [base]);
  if (!rows) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!rows.length) return <p className="text-sm text-muted-foreground">Nothing yet.</p>;
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-card text-sm">
      {rows.map((r) => (
        <li key={r.id} className="px-4 py-2">
          <span className="font-medium">{r.actor}</span> {ACTION_LABELS[r.action] || r.action.replace(/_/g, " ")}
          {r.detail ? <span className="text-muted-foreground"> — {r.detail}</span> : null}
          <span className="block text-xs text-muted-foreground">{new Date(r.at).toLocaleString()}</span>
        </li>
      ))}
    </ul>
  );
}
