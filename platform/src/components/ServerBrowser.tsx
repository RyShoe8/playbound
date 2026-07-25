"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, Copy, Lock, RefreshCw, Server, Users } from "lucide-react";
import { launcherJoinUrl, launcherInstallUrl, isOneClickSlug } from "@/lib/launcher";
import type { GameServer } from "@/lib/servers/types";
import { estimateLatencyMs } from "@/lib/servers/latencyEstimate";
import { EmptyHint } from "@/components/ui/bits";

type Props = {
  slug: string;
  title: string;
  supportsServers: boolean;
};

type ApiResponse = {
  supported: boolean;
  multiplayer?: boolean;
  servers: GameServer[];
  updatedAt: string;
  error?: string;
};

type ViewerGeo = {
  countryCode: string | null;
  lat: number | null;
  lon: number | null;
};

type SortKey = "name" | "players" | "map" | "location" | "est";
type SortDir = "asc" | "desc";

const UNKNOWN_COUNTRY = "__unknown__";

function formatLocation(server: GameServer): string {
  const loc = server.location;
  if (!loc) return "—";
  if (loc.region && loc.region.length > 2) return loc.region;
  return loc.countryCode || "—";
}

/** Filter key: US East/Central/West when classified, else country code. */
function countryKey(server: GameServer): string {
  const loc = server.location;
  if (!loc) return UNKNOWN_COUNTRY;
  if (/^US (East|Central|West)$/i.test(loc.region ?? "")) {
    return loc.region!;
  }
  return loc.countryCode?.toUpperCase() || UNKNOWN_COUNTRY;
}

function formatEstMs(ms: number | null): string {
  if (ms == null) return "—";
  return `~${ms} ms`;
}

function compareNullableNumber(a: number | null, b: number | null, dir: SortDir): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return dir === "asc" ? a - b : b - a;
}

function compareString(a: string, b: string, dir: SortDir): number {
  const cmp = a.localeCompare(b, undefined, { sensitivity: "base" });
  return dir === "asc" ? cmp : -cmp;
}

function SortableTh({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
  title,
}: {
  label: string;
  column: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  title?: string;
}) {
  const active = sortKey === column;
  const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className="px-3 py-2.5 font-semibold">
      <button
        type="button"
        title={title}
        onClick={() => onSort(column)}
        className="inline-flex items-center gap-1 uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
      >
        {label}
        <Icon className={`size-3.5 ${active ? "text-foreground" : "opacity-50"}`} aria-hidden />
        <span className="sr-only">
          {active ? `sorted ${sortDir === "asc" ? "ascending" : "descending"}` : "sortable"}
        </span>
      </button>
    </th>
  );
}

export function ServerBrowser({ slug, title, supportsServers }: Props) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [viewer, setViewer] = useState<ViewerGeo | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("players");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const load = useCallback(async () => {
    if (!supportsServers) return;
    setLoading(true);
    try {
      const [serversRes, geoRes] = await Promise.all([
        fetch(`/api/games/${slug}/servers`, { cache: "no-store" }),
        fetch("/api/geo/me", { cache: "no-store" }),
      ]);
      const json = (await serversRes.json()) as ApiResponse;
      setData(json);
      if (geoRes.ok) {
        setViewer((await geoRes.json()) as ViewerGeo);
      } else {
        setViewer(null);
      }
    } catch {
      setData({
        supported: false,
        servers: [],
        updatedAt: new Date().toISOString(),
        error: "Couldn't reach PlayBound servers API.",
      });
    } finally {
      setLoading(false);
    }
  }, [slug, supportsServers]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setCountryFilter("all");
    setSortKey("players");
    setSortDir("desc");
  }, [slug]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "players" || key === "est" ? "desc" : "asc");
    }
  }

  async function copyAddress(host: string, port: number) {
    const text = `${host}:${port}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* ignore */
    }
  }

  const servers = data?.servers ?? [];

  const canEstimate = viewer != null && viewer.lat != null && viewer.lon != null;

  function estFor(server: GameServer): number | null {
    if (!canEstimate || viewer?.lat == null || viewer.lon == null) return null;
    const lat = server.location?.lat;
    const lon = server.location?.lon;
    if (lat == null || lon == null) return null;
    return estimateLatencyMs(viewer.lat, viewer.lon, lat, lon);
  }

  const countryOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of servers) {
      const key = countryKey(s);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort(([a], [b]) => {
      if (a === UNKNOWN_COUNTRY) return 1;
      if (b === UNKNOWN_COUNTRY) return -1;
      return a.localeCompare(b);
    });
  }, [servers]);

  const displayedServers = useMemo(() => {
    const filtered =
      countryFilter === "all" ? servers : servers.filter((s) => countryKey(s) === countryFilter);

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sortKey) {
        case "name":
          return compareString(a.name, b.name, sortDir);
        case "players":
          return compareNullableNumber(a.players, b.players, sortDir);
        case "map": {
          const aMap = `${a.map ?? ""}\0${a.gameType ?? ""}`;
          const bMap = `${b.map ?? ""}\0${b.gameType ?? ""}`;
          return compareString(aMap || "—", bMap || "—", sortDir);
        }
        case "location":
          return compareString(formatLocation(a), formatLocation(b), sortDir);
        case "est":
          return compareNullableNumber(estFor(a), estFor(b), sortDir);
        default:
          return 0;
      }
    });
    return sorted;
    // estFor depends on viewer; include viewer in deps
  }, [servers, countryFilter, sortKey, sortDir, viewer]);

  if (!supportsServers) {
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyHint icon={Server}>{title} doesn&apos;t use dedicated servers.</EmptyHint>
      </div>
    );
  }

  if (data && !data.supported) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <EmptyHint icon={Server}>
          Live server listings for {title} aren&apos;t wired yet — use the in-game multiplayer browser after
          installing.
        </EmptyHint>
        <div className="flex flex-wrap justify-center gap-2">
          <Link
            href={`/games/${slug}/play`}
            className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
          >
            Get {title}
          </Link>
          {isOneClickSlug(slug) && (
            <a
              href={launcherInstallUrl(slug)}
              className="rounded-full border border-border bg-secondary px-4 py-2 text-sm font-bold"
            >
              One-click install
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold">Live servers</h3>
          <p className="text-sm text-muted-foreground">
            Est. is from your location vs server GeoIP — not a real ping. Join opens the PlayBound
            Launcher when installed.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {servers.length > 0 && (
            <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <span className="sr-only">Filter by country</span>
              <select
                value={countryFilter}
                onChange={(e) => setCountryFilter(e.target.value)}
                className="h-8 rounded-full border border-border bg-secondary px-3 text-xs font-bold text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
              >
                <option value="all">All countries</option>
                {countryOptions.map(([code, count]) => (
                  <option key={code} value={code}>
                    {code === UNKNOWN_COUNTRY ? "Unknown" : code} — {count}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            disabled={loading}
            onClick={() => void load()}
            className="flex items-center gap-1.5 rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold disabled:opacity-60"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {data?.error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {data.error}
        </p>
      )}

      {loading && !data ? (
        <p className="text-sm text-muted-foreground">Loading servers…</p>
      ) : servers.length === 0 ? (
        <EmptyHint icon={Server}>No public servers reported right now. Try refresh in a minute.</EmptyHint>
      ) : displayedServers.length === 0 ? (
        <div className="space-y-3">
          <EmptyHint icon={Server}>No servers in that country.</EmptyHint>
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setCountryFilter("all")}
              className="rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold"
            >
              Show all countries
            </button>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[780px] text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/40 text-left text-xs">
                <SortableTh label="Server" column="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh
                  label="Players"
                  column="players"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="Map / Mode"
                  column="map"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="Location"
                  column="location"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="Est."
                  column="est"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                  title="Estimated from GeoIP distance"
                />
                <th className="px-3 py-2.5 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {displayedServers.map((s) => (
                <tr key={s.id} className="border-b border-border bg-card last:border-0">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5 font-semibold">
                      {s.protected && <Lock className="size-3.5 text-muted-foreground" aria-label="Password" />}
                      <span className="line-clamp-1">{s.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {s.host}:{s.port}
                    </p>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Users className="size-3.5" />
                      {s.players}
                      {s.maxPlayers != null ? ` / ${s.maxPlayers}` : ""}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    <span className="line-clamp-1">{s.map || "—"}</span>
                    {s.gameType && <p className="text-xs">{s.gameType}</p>}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{formatLocation(s)}</td>
                  <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{formatEstMs(estFor(s))}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <a
                        href={launcherJoinUrl(slug, s.host, s.port, s.name)}
                        className="rounded-full bg-play px-3 py-1 text-xs font-bold text-play-foreground"
                      >
                        Join
                      </a>
                      <button
                        type="button"
                        onClick={() => void copyAddress(s.host, s.port)}
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-bold"
                      >
                        <Copy className="size-3" />
                        {copied === `${s.host}:${s.port}` ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data?.updatedAt && (
        <p className="text-[11px] text-muted-foreground">
          Updated {new Date(data.updatedAt).toLocaleTimeString()} · {displayedServers.length} shown
          {countryFilter !== "all" ? ` of ${servers.length}` : ""}
        </p>
      )}
    </div>
  );
}
