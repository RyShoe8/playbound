"use client";

import { useEffect, useMemo, useState } from "react";
import { Lock, RefreshCw, Users } from "lucide-react";
import type { GameServer } from "@/lib/servers/types";
import { usePartyStore } from "@/stores/partyStore";

type ServersResponse = {
  supported?: boolean;
  servers?: GameServer[];
  error?: string;
};

function sumPlayers(servers: GameServer[]): number {
  return servers.reduce((n, s) => n + (Number(s.players) || 0), 0);
}

function formatPlayers(n: number): string {
  return n.toLocaleString();
}

function formatLocation(server: GameServer): string {
  const loc = server.location;
  if (!loc) return "";
  if (loc.region && loc.region.length > 2) return loc.region;
  const code = loc.countryCode?.toUpperCase();
  if (code && code !== "ZZ" && code !== "XX") return code;
  return "";
}

function serverKey(server: GameServer): string {
  return server.id || `${server.host}:${server.port}`;
}

function useGameServers(gameSlug: string | null | undefined) {
  const [servers, setServers] = useState<GameServer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!gameSlug) {
      setServers(null);
      setError(null);
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/games/${encodeURIComponent(gameSlug!)}/servers`);
        if (cancelled) return;
        if (!res.ok) {
          setServers([]);
          setError("Couldn't load servers.");
          return;
        }
        const data = (await res.json()) as ServersResponse;
        setServers(Array.isArray(data.servers) ? data.servers : []);
        setError(data.error || null);
      } catch {
        if (!cancelled) {
          setServers([]);
          setError("Couldn't load servers.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [gameSlug]);

  return { servers, error, loading, setServers, setError, setLoading };
}

/** Live player count for the party's game, when a provider exists. */
export function PartyGameOnlineCount({ gameSlug }: { gameSlug: string }) {
  const { servers, loading } = useGameServers(gameSlug);
  if (!servers || servers.length === 0) {
    return loading ? (
      <p className="mt-1.5 text-xs text-muted-foreground">Checking who's online…</p>
    ) : null;
  }
  const players = sumPlayers(servers);
  if (players <= 0 && servers.every((s) => s.players == null)) return null;
  return (
    <p className="mt-1.5 text-xs text-muted-foreground flex items-center gap-1">
      <Users className="size-3" />
      {formatPlayers(players)} playing online
    </p>
  );
}

export function PartyPublicServerPicker({
  partyId,
  gameSlug,
  selectedId,
  selectedName,
  selectedHost,
  selectedPort,
  canPick,
}: {
  partyId: string;
  gameSlug: string;
  selectedId?: string | null;
  selectedName?: string | null;
  selectedHost?: string | null;
  selectedPort?: number | null;
  canPick: boolean;
}) {
  const setPublicServer = usePartyStore((s) => s.setPublicServer);
  const { servers, error, loading, setServers, setError, setLoading } = useGameServers(gameSlug);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const list = [...(servers || [])].sort((a, b) => (b.players || 0) - (a.players || 0));
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((s) => {
      const hay = [s.name, s.host, s.map, s.gameType, formatLocation(s)].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [servers, query]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/games/${encodeURIComponent(gameSlug)}/servers`);
      if (!res.ok) {
        setError("Couldn't load servers.");
        return;
      }
      const data = (await res.json()) as ServersResponse;
      setServers(Array.isArray(data.servers) ? data.servers : []);
      setError(data.error || null);
    } catch {
      setError("Couldn't load servers.");
    } finally {
      setLoading(false);
    }
  }

  async function pick(server: GameServer) {
    if (!canPick) return;
    const id = serverKey(server);
    setBusyId(id);
    try {
      await setPublicServer(partyId, {
        id,
        name: server.name,
        host: server.host,
        port: server.port,
        mod: server.mod || null,
        protected: server.protected,
      });
    } finally {
      setBusyId(null);
    }
  }

  const selectedKey =
    selectedId || (selectedHost && selectedPort ? `${selectedHost}:${selectedPort}` : null);
  const players = servers ? sumPlayers(servers) : 0;

  return (
    <div className="mt-3 w-full max-w-md rounded-lg border border-border bg-secondary/30 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Public server
          </p>
          {servers && servers.length > 0 ? (
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatPlayers(players)} playing across {servers.length} server
              {servers.length === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground"
          title="Refresh server list"
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {selectedName || selectedHost ? (
        <p className="text-sm font-semibold">
          {selectedName || `${selectedHost}:${selectedPort}`}
          {selectedHost && selectedPort ? (
            <span className="ml-1.5 font-mono text-xs font-normal text-muted-foreground">
              {selectedHost}:{selectedPort}
            </span>
          ) : null}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {canPick ? "Pick a server for the party to join." : "Waiting for the leader to pick a server."}
        </p>
      )}

      {servers && servers.length > 8 ? (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search servers…"
          className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
        />
      ) : null}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      {loading && !servers ? (
        <p className="text-xs text-muted-foreground">Loading servers…</p>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground">No public servers listed right now.</p>
      ) : (
        <ul className="max-h-52 overflow-y-auto divide-y divide-border rounded-md border border-border bg-background">
          {filtered.map((server) => {
            const id = serverKey(server);
            const selected = selectedKey === id || (selectedHost === server.host && selectedPort === server.port);
            const loc = formatLocation(server);
            return (
              <li key={id}>
                <button
                  type="button"
                  disabled={!canPick || busyId === id}
                  onClick={() => void pick(server)}
                  className={`w-full text-left px-2.5 py-2 text-xs transition-colors ${
                    selected ? "bg-primary/10" : canPick ? "hover:bg-secondary/80" : ""
                  } disabled:opacity-70`}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="font-semibold leading-snug min-w-0">
                      {server.protected ? <Lock className="inline size-3 mr-1 -mt-0.5" /> : null}
                      {server.name || `${server.host}:${server.port}`}
                    </span>
                    <span className="shrink-0 text-muted-foreground tabular-nums">
                      {server.players == null ? "—" : `${server.players}${server.maxPlayers ? `/${server.maxPlayers}` : ""}`}
                    </span>
                  </span>
                  <span className="mt-0.5 flex flex-wrap gap-x-2 text-muted-foreground">
                    {server.map ? <span>{server.map}</span> : null}
                    {loc ? <span>{loc}</span> : null}
                    {server.gameType ? <span>{server.gameType}</span> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
