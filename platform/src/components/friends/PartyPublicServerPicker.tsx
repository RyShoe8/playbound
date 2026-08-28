"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Lock, RefreshCw, Users } from "lucide-react";
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

type ServerListEntry = { at: number; servers: GameServer[]; error: string | null };

/*
 * One server list per game, shared by every mount.
 *
 * The API route is CDN-cached for 30s, so refetching more often than that
 * cannot return anything new — and the party panel mounts this in two places
 * (the count and the picker) and remounts on party updates. The cache makes a
 * remount instant instead of another round trip, and `inFlight` keeps two
 * mounts in the same tick from both asking.
 */
const SERVER_LIST_TTL_MS = 30_000;
const serverListCache = new Map<string, ServerListEntry>();
const serverListInFlight = new Map<string, Promise<ServerListEntry>>();

async function loadServerList(slug: string, force = false): Promise<ServerListEntry> {
  const cached = serverListCache.get(slug);
  if (!force && cached && Date.now() - cached.at < SERVER_LIST_TTL_MS) return cached;
  const pending = serverListInFlight.get(slug);
  if (pending) return pending;

  const run = (async (): Promise<ServerListEntry> => {
    let entry: ServerListEntry;
    try {
      const res = await fetch(`/api/games/${encodeURIComponent(slug)}/servers`, {
        cache: force ? "no-store" : "default",
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as ServersResponse;
      entry = {
        at: Date.now(),
        servers: Array.isArray(data.servers) ? data.servers : [],
        error: data.error || null,
      };
    } catch {
      // Keep the last good list rather than blanking a picker mid-scroll.
      entry = {
        at: Date.now(),
        servers: cached?.servers ?? [],
        error: "Couldn't load servers.",
      };
    }
    serverListCache.set(slug, entry);
    return entry;
  })().finally(() => {
    serverListInFlight.delete(slug);
  });

  serverListInFlight.set(slug, run);
  return run;
}

/**
 * Server list for a game, read when it appears and when asked.
 *
 * No timer: the endpoint is a shared 30s cache, and a picker polling it in the
 * background would spend requests re-reading the same bytes. The refresh
 * button beside the list is how a stale count gets replaced.
 */
function useGameServers(gameSlug: string | null | undefined) {
  const [loaded, setLoaded] = useState<{ slug: string; entry: ServerListEntry } | null>(null);
  const [loading, setLoading] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /*
   * Derived during render rather than reset in an effect: switching games
   * falls back to whatever the cache already holds for the new one, which is
   * usually a complete list and always better than a flash of "loading".
   */
  const entry = gameSlug
    ? loaded?.slug === gameSlug
      ? loaded.entry
      : serverListCache.get(gameSlug) ?? null
    : null;

  const refresh = useCallback(
    async (force = false) => {
      if (!gameSlug) return;
      setLoading(true);
      const next = await loadServerList(gameSlug, force);
      if (!mounted.current) return;
      setLoaded({ slug: gameSlug, entry: next });
      setLoading(false);
    },
    [gameSlug]
  );

  useEffect(() => {
    if (!gameSlug) return;
    let cancelled = false;
    // Straight to the shared loader, so a cache hit lands without a spinner
    // and without a second render pass.
    void loadServerList(gameSlug).then((entry) => {
      if (!cancelled) setLoaded({ slug: gameSlug, entry });
    });
    return () => {
      cancelled = true;
    };
  }, [gameSlug]);

  return { servers: entry?.servers ?? null, error: entry?.error ?? null, loading, refresh };
}

/** Live player count for the party's game, when a provider exists. */
export function PartyGameOnlineCount({ gameSlug }: { gameSlug: string }) {
  const { servers, loading } = useGameServers(gameSlug);
  if (!servers || servers.length === 0) {
    return loading ? (
      <p className="mt-1.5 text-xs text-muted-foreground">{"Checking who's online…"}</p>
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

/**
 * Why the viewer cannot pick right now, or null when they can.
 *
 * `ready` is the ordering the panel teaches: the server is the last thing
 * settled before Join Game, so the list is inert — and says so — until the
 * leader has readied up.
 */
export type PartyPublicServerGate = "leader" | "ready" | "locked";

export function PartyPublicServerPicker({
  partyId,
  gameSlug,
  selectedId,
  selectedName,
  selectedHost,
  selectedPort,
  gate = null,
  onReadyUp,
}: {
  partyId: string;
  gameSlug: string;
  selectedId?: string | null;
  selectedName?: string | null;
  selectedHost?: string | null;
  selectedPort?: number | null;
  gate?: PartyPublicServerGate | null;
  /** Offered inline on the ready gate, so the next step is one click away. */
  onReadyUp?: () => void;
}) {
  const canPick = gate === null;
  /*
   * Members and in-game parties get the pick, not the catalogue: a list of
   * servers nobody at this screen can choose is noise, and skipping it skips
   * the fetch behind it too.
   */
  const showList = gate === null || gate === "ready";
  const setPublicServer = usePartyStore((s) => s.setPublicServer);
  const { servers, error, loading, refresh } = useGameServers(showList ? gameSlug : null);
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
  const hasSelection = Boolean(selectedName || selectedHost);

  const gateNote =
    gate === "leader"
      ? hasSelection
        ? null
        : "Your party leader picks the server — you'll join whatever they choose."
      : gate === "locked"
        ? "Locked while the party is in a game."
        : gate === "ready"
          ? "Ready up first. Choosing the server is the last step before Join Game."
          : null;

  return (
    <div className="w-full rounded-xl border border-border bg-secondary/30 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Public server
          </p>
          {hasSelection ? (
            <p className="mt-1 text-sm font-semibold">
              {selectedName || `${selectedHost}:${selectedPort}`}
              {selectedHost && selectedPort ? (
                <span className="ml-1.5 font-mono text-xs font-normal text-muted-foreground">
                  {selectedHost}:{selectedPort}
                </span>
              ) : null}
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              {canPick
                ? "Choose where the party plays, then hit Join Game."
                : "No server chosen yet."}
            </p>
          )}
        </div>
        {showList ? (
          <div className="flex items-center gap-2">
            {servers && servers.length > 0 ? (
              <span className="text-xs text-muted-foreground">
                {formatPlayers(players)} playing across {servers.length} server
                {servers.length === 1 ? "" : "s"}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => void refresh(true)}
              className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground"
              title="Refresh server list"
            >
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        ) : null}
      </div>

      {gateNote ? (
        <div
          className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 ${
            gate === "ready"
              ? "border border-primary/30 bg-primary/5"
              : "border border-border bg-background/60"
          }`}
        >
          <p className="text-xs font-semibold">{gateNote}</p>
        </div>
      ) : null}

      {!showList ? null : (
        <>
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
            <ul className="max-h-64 overflow-y-auto divide-y divide-border rounded-lg border border-border bg-background">
              {filtered.map((server) => {
                const id = serverKey(server);
                const selected =
                  selectedKey === id ||
                  (selectedHost === server.host && selectedPort === server.port);
                const loc = formatLocation(server);
                return (
                  <li key={id}>
                    <button
                      type="button"
                      disabled={!canPick || busyId === id}
                      onClick={() => void pick(server)}
                      className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                        selected ? "bg-primary/10" : canPick ? "hover:bg-secondary/80" : ""
                      } disabled:cursor-not-allowed disabled:opacity-70`}
                    >
                      <span className="flex items-start justify-between gap-3">
                        <span className="font-semibold leading-snug min-w-0">
                          {server.protected ? (
                            <Lock className="inline size-3 mr-1 -mt-0.5" />
                          ) : null}
                          {server.name || `${server.host}:${server.port}`}
                        </span>
                        <span className="shrink-0 text-muted-foreground tabular-nums">
                          {server.players == null
                            ? "—"
                            : `${server.players}${server.maxPlayers ? `/${server.maxPlayers}` : ""}`}
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
        </>
      )}
    </div>
  );
}
