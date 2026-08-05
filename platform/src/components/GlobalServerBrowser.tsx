"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Lock, RefreshCw, Server, Users } from "lucide-react";
import { launcherJoinUrl, isOneClickSlug } from "@/lib/launcher";
import type { GameServer } from "@/lib/servers/types";
import { estimateLatencyMs } from "@/lib/servers/latencyEstimate";
import { EmptyHint } from "@/components/ui/bits";
import { LauncherInstallButton } from "@/components/LauncherInstallButton";
import { CompatibilityListingBar } from "@/components/GameCompatibilityToggle";
import { cn } from "@/lib/utils";
import { telemetry } from "@/lib/telemetry";
import { useCompatibilityFilter } from "@/hooks/useCompatibilityFilter";
import { isGameCompatible } from "@/lib/compatibility/compatibility";

type IndexGame = {
  slug: string;
  title: string;
  supported: boolean;
  platforms?: string[];
  browserPlayable?: boolean;
  steamDeck?: boolean;
};

type CatalogMod = {
  slug: string;
  title: string;
  baseGameSlug: string;
  baseSupported?: boolean;
  baseHasServers?: boolean;
};

type Props = {
  installedGameSlugs: string[];
  installedModSlugs: string[];
  signedIn: boolean;
};

type ApiResponse = {
  supported: boolean;
  servers: GameServer[];
  updatedAt?: string;
  error?: string;
};

type ViewerGeo = {
  countryCode: string | null;
  lat: number | null;
  lon: number | null;
};

type SortKey = "name" | "players" | "map" | "location" | "est";
type SortDir = "asc" | "desc";

const SORT_DEFAULT_DIR: Record<SortKey, SortDir> = {
  name: "asc",
  players: "desc",
  map: "asc",
  location: "asc",
  est: "desc",
};

function cmpNullLast(a: number | null, b: number | null, dir: SortDir): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return dir === "asc" ? a - b : b - a;
}

function formatLocation(server: GameServer): string {
  const loc = server.location;
  if (!loc) return "—";
  if (loc.region && loc.region.length > 2) return loc.region;
  const code = loc.countryCode?.toUpperCase();
  if (code && code !== "ZZ" && code !== "XX") return code;
  return "—";
}

function formatEstMs(ms: number | null): string {
  if (ms == null) return "—";
  return `~${ms} ms`;
}

function norm(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function filterServersForMod(servers: GameServer[], mod: CatalogMod): {
  matched: boolean;
  servers: GameServer[];
} {
  const needles = [mod.slug, mod.title].map(norm).filter(Boolean);
  const matched = servers.filter((s) => {
    const gt = norm(s.gameType || "");
    if (!gt) return false;
    return needles.some((n) => gt.includes(n) || n.includes(gt));
  });
  if (matched.length) return { matched: true, servers: matched };
  return { matched: false, servers };
}

export function GlobalServerBrowser({
  installedGameSlugs,
  installedModSlugs,
  signedIn,
}: Props) {
  const searchParams = useSearchParams();
  const queryGame = searchParams.get("game")?.trim() || "";
  const queryMod = searchParams.get("mod")?.trim() || "";

  const installedGames = useMemo(() => new Set(installedGameSlugs), [installedGameSlugs]);
  const installedMods = useMemo(() => new Set(installedModSlugs), [installedModSlugs]);

  const [games, setGames] = useState<IndexGame[]>([]);
  const [mods, setMods] = useState<CatalogMod[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [gameSlug, setGameSlug] = useState(queryGame);
  const [modSlug, setModSlug] = useState(queryMod);
  const [installedOnly, setInstalledOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [viewer, setViewer] = useState<ViewerGeo | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [modNote, setModNote] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("players");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const { mode, device } = useCompatibilityFilter();
  const lastViewedSlug = useRef<string | null>(null);

  function setSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(SORT_DEFAULT_DIR[key]);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [serversRes, modsRes] = await Promise.all([
          fetch("/api/launcher/servers", { cache: "no-store" }),
          fetch("/api/launcher/mods", { cache: "no-store" }),
        ]);
        const serversJson = serversRes.ok ? await serversRes.json() : { games: [] };
        const modsJson = modsRes.ok ? await modsRes.json() : { mods: [] };
        if (cancelled) return;
        const supported = (serversJson.games || []).filter((g: IndexGame) => g.supported);
        setGames(supported);
        setMods(modsJson.mods || []);
        const preferred =
          (queryGame && supported.find((g: IndexGame) => g.slug === queryGame)?.slug) ||
          supported[0]?.slug ||
          "";
        setGameSlug(preferred);
        if (queryMod) setModSlug(queryMod);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setCatalogLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [queryGame, queryMod]);

  const visibleGames = useMemo(() => {
    let list = games;
    if (mode === "compatible") {
      list = list.filter((g) =>
        isGameCompatible(
          {
            platforms: g.platforms,
            browserPlayable: g.browserPlayable,
            steamDeck: g.steamDeck,
          },
          device.type
        )
      );
    }
    if (installedOnly) list = list.filter((g) => installedGames.has(g.slug));
    return list;
  }, [games, installedOnly, installedGames, mode, device.type]);

  /**
   * The selection is validated during render rather than corrected afterwards
   * in an effect.
   *
   * Reconciling in an effect meant an out-of-range slug — a ?mod= deep link
   * that is filtered out, or a selection hidden by "installed only" — was
   * still visible to the fetch effect for one render. That fired a request for
   * the stale value, then the effect reset the state and fired a second one.
   * Deriving here means the invalid value never reaches the fetch at all.
   */
  const effectiveGameSlug = useMemo(
    () =>
      visibleGames.some((g) => g.slug === gameSlug) ? gameSlug : visibleGames[0]?.slug || "",
    [visibleGames, gameSlug]
  );

  const visibleMods = useMemo(() => {
    let list = mods.filter(
      (m) => m.baseGameSlug === effectiveGameSlug && (m.baseSupported || m.baseHasServers)
    );
    if (installedOnly) list = list.filter((m) => installedMods.has(m.slug));
    return list;
  }, [mods, effectiveGameSlug, installedOnly, installedMods]);

  const effectiveModSlug = useMemo(
    () => (modSlug && visibleMods.some((m) => m.slug === modSlug) ? modSlug : ""),
    [visibleMods, modSlug]
  );

  // Guards against an earlier, slower request resolving after a later one and
  // painting servers for a game the user has already navigated away from.
  const requestSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const viewerGeoFetched = useRef(false);
  /** Instant switch-back for recently viewed games (base list, before mod filter). */
  const listCache = useRef(new Map<string, ApiResponse>());

  const loadServers = useCallback(async (slug: string, mod: CatalogMod | null) => {
    if (!slug) {
      setData(null);
      return;
    }
    const seq = ++requestSeq.current;
    const isStale = () => seq !== requestSeq.current;

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const cacheKey = slug;
    const cached = listCache.current.get(cacheKey);
    if (cached) {
      let servers = Array.isArray(cached.servers) ? cached.servers : [];
      setModNote("");
      if (mod) {
        const filtered = filterServersForMod(servers, mod);
        setModNote(
          filtered.matched
            ? `Showing servers matching ${mod.title}.`
            : `No gameType match for ${mod.title} — showing all ${slug} servers.`
        );
        servers = filtered.servers;
      }
      setData({ ...cached, servers });
    } else {
      setData(null);
    }

    setLoading(true);
    if (!cached) setModNote("");
    try {
      const needGeo = !viewerGeoFetched.current;
      const [serversRes, geoRes] = await Promise.all([
        fetch(`/api/games/${encodeURIComponent(slug)}/servers`, {
          cache: "no-store",
          signal: ac.signal,
        }),
        needGeo
          ? fetch("/api/geo/me", { cache: "no-store", signal: ac.signal }).catch(() => null)
          : Promise.resolve(null),
      ]);
      if (isStale() || ac.signal.aborted) return;

      const json = serversRes.ok
        ? ((await serversRes.json()) as ApiResponse)
        : { supported: false, servers: [] };
      if (isStale()) return;

      listCache.current.set(cacheKey, json);
      if (listCache.current.size > 12) {
        const oldest = listCache.current.keys().next().value;
        if (oldest) listCache.current.delete(oldest);
      }

      if (geoRes?.ok) {
        const geo = await geoRes.json();
        viewerGeoFetched.current = true;
        setViewer({
          countryCode: geo.countryCode ?? null,
          lat: geo.lat ?? null,
          lon: geo.lon ?? null,
        });
      } else if (needGeo) {
        // Avoid hammering geo/me on every switch after a failure.
        viewerGeoFetched.current = true;
      }

      let servers = Array.isArray(json.servers) ? json.servers : [];
      if (mod) {
        const filtered = filterServersForMod(servers, mod);
        if (filtered.matched) {
          setModNote(`Showing servers matching ${mod.title}.`);
        } else {
          setModNote(`No gameType match for ${mod.title} — showing all ${slug} servers.`);
        }
        servers = filtered.servers;
      } else {
        setModNote("");
      }
      setData({ ...json, servers });
      if (slug && lastViewedSlug.current !== slug) {
        lastViewedSlug.current = slug;
        void telemetry.track("server_viewed", { gameSlug: slug });
      }
    } catch {
      if (ac.signal.aborted || isStale()) return;
      if (!cached) setData({ supported: false, servers: [] });
    } finally {
      if (!isStale()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const mod = effectiveModSlug
      ? mods.find((m) => m.slug === effectiveModSlug) || null
      : null;
    void loadServers(effectiveGameSlug, mod);
    return () => {
      abortRef.current?.abort();
    };
  }, [effectiveGameSlug, effectiveModSlug, mods, loadServers]);

  const estFor = useCallback(
    (s: GameServer) => {
      if (viewer?.lat == null || viewer?.lon == null) return null;
      if (s.location?.lat == null || s.location?.lon == null) return null;
      return estimateLatencyMs(viewer.lat, viewer.lon, s.location.lat, s.location.lon);
    },
    [viewer]
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = data?.servers || [];
    if (q) {
      list = list.filter((s) =>
        `${s.name} ${s.map || ""} ${s.gameType || ""} ${s.players}/${s.maxPlayers}`.toLowerCase().includes(q)
      );
    }
    const sorted = list.slice().sort((a, b) => {
      if (sortKey === "players") {
        return cmpNullLast(Number(a.players) || 0, Number(b.players) || 0, sortDir);
      }
      if (sortKey === "est") {
        return cmpNullLast(estFor(a), estFor(b), sortDir);
      }
      let av = "";
      let bv = "";
      if (sortKey === "name") {
        av = a.name || "";
        bv = b.name || "";
      } else if (sortKey === "map") {
        av = a.map || a.gameType || "";
        bv = b.map || b.gameType || "";
      } else {
        av = formatLocation(a);
        bv = formatLocation(b);
      }
      const cmp = av.localeCompare(bv, undefined, { sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [data, search, sortKey, sortDir, estFor]);

  const totalPlayers = useMemo(
    () => rows.reduce((sum, s) => sum + (Number(s.players) || 0), 0),
    [rows]
  );

  const selectedTitle = games.find((g) => g.slug === effectiveGameSlug)?.title || effectiveGameSlug;

  function sortLabel(key: SortKey, label: string, title?: string) {
    const active = sortKey === key;
    const arrow = active ? (sortDir === "asc" ? " ↑" : " ↓") : "";
    return (
      <th className="px-3 py-2.5 font-semibold" title={title}>
        <button
          type="button"
          onClick={() => setSort(key)}
          title={title}
          className={cn(
            "inline-flex items-center gap-0.5 uppercase tracking-wide transition-colors",
            active ? "text-foreground" : "hover:text-foreground"
          )}
          aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
        >
          {label}
          {arrow}
        </button>
      </th>
    );
  }

  return (
    <div className="space-y-4">
      <CompatibilityListingBar />

      {catalogLoaded && visibleGames.length === 0 ? (
        <EmptyHint icon={Server}>
          No live servers for games compatible with this device. Switch to All Games to browse every
          title.
        </EmptyHint>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[160px] flex-1 flex-col gap-1 text-xs font-semibold text-muted-foreground">
          Game
          <select
            value={effectiveGameSlug}
            onChange={(e) => {
              setGameSlug(e.target.value);
              setModSlug("");
            }}
            disabled={!catalogLoaded || visibleGames.length === 0}
            className="h-10 rounded-xl border border-border bg-secondary px-3 text-sm font-bold text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/40 disabled:opacity-50"
          >
            {visibleGames.map((g) => (
              <option key={g.slug} value={g.slug}>
                {g.title}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[160px] flex-1 flex-col gap-1 text-xs font-semibold text-muted-foreground">
          Mod
          <select
            value={effectiveModSlug}
            onChange={(e) => setModSlug(e.target.value)}
            className="h-10 rounded-xl border border-border bg-secondary px-3 text-sm font-bold text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
          >
            <option value="">Base game</option>
            {visibleMods.map((m) => (
              <option key={m.slug} value={m.slug}>
                {m.title}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[180px] flex-[1.2] flex-col gap-1 text-xs font-semibold text-muted-foreground">
          Search
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, map, players…"
            className="h-10 rounded-xl border border-border bg-secondary px-3 text-sm font-semibold text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
          />
        </label>
        <label
          className={cn(
            "flex h-10 items-center gap-2 rounded-xl border border-border bg-secondary px-3 text-sm font-semibold",
            !signedIn && "opacity-60"
          )}
          title={!signedIn ? "Sign in and sync the launcher to use Installed only" : undefined}
        >
          <input
            type="checkbox"
            checked={installedOnly}
            disabled={!signedIn}
            onChange={(e) => setInstalledOnly(e.target.checked)}
          />
          Installed only
        </label>
        <button
          type="button"
          onClick={() => {
            const mod = effectiveModSlug ? mods.find((m) => m.slug === effectiveModSlug) || null : null;
            void loadServers(effectiveGameSlug, mod);
          }}
          className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border bg-secondary px-3 text-xs font-bold"
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {!signedIn && (
        <p className="text-xs text-muted-foreground">
          <Link href="/login?callbackUrl=/servers" className="font-semibold text-primary hover:underline">
            Sign in
          </Link>{" "}
          and connect the launcher to filter by installed games and mods.
        </p>
      )}
      {modNote && <p className="text-xs text-muted-foreground">{modNote}</p>}
      {data?.error && (
        <p className="text-xs font-semibold text-destructive">
          Couldn&apos;t refresh live list: {data.error}
        </p>
      )}
      {effectiveGameSlug && data?.supported ? (
        <p className="text-sm font-semibold text-muted-foreground">
          {totalPlayers} player{totalPlayers === 1 ? "" : "s"} · {rows.length} server
          {rows.length === 1 ? "" : "s"}
        </p>
      ) : null}

      {!catalogLoaded ? (
        <p className="text-sm text-muted-foreground">Loading server catalog…</p>
      ) : !effectiveGameSlug || (installedOnly && !visibleGames.length) ? (
        <EmptyHint icon={Server}>
          {installedOnly
            ? "No installed games have live server browsers. Install a multiplayer title or turn off Installed only."
            : "No server providers available."}
        </EmptyHint>
      ) : loading && !data ? (
        <p className="text-sm text-muted-foreground">Loading servers…</p>
      ) : data && !data.supported ? (
        <EmptyHint icon={Server}>Live listings for {selectedTitle} aren&apos;t wired yet.</EmptyHint>
      ) : rows.length === 0 ? (
        <EmptyHint icon={Server}>
          {data?.error ? "No servers returned (see error above)." : "No servers match."}
        </EmptyHint>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {sortLabel("name", "Server")}
                {sortLabel("players", "Players")}
                {sortLabel("map", "Map / Mode")}
                {sortLabel("location", "Location")}
                {sortLabel("est", "Est.", "GeoIP estimate, not a real ping")}
                <th className="px-3 py-2.5 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const addr = `${s.host}:${s.port}`;
                return (
                  <tr key={s.id || addr} className="border-b border-border last:border-0">
                    <td className="px-3 py-3">
                      <div className="font-semibold">{s.name}</div>
                      {s.gameType && (
                        <div className="text-xs text-muted-foreground">{s.gameType}</div>
                      )}
                      {s.protected && (
                        <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Lock className="size-3" /> Password
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1">
                        <Users className="size-3.5 text-muted-foreground" />
                        {s.players == null ? "—" : `${s.players}/${s.maxPlayers ?? "—"}`}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{s.map || "—"}</td>
                    <td className="px-3 py-3 text-muted-foreground">{formatLocation(s)}</td>
                    <td className="px-3 py-3 tabular-nums text-muted-foreground">{formatEstMs(estFor(s))}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {isOneClickSlug(effectiveGameSlug) ? (
                          <a
                            href={launcherJoinUrl(effectiveGameSlug, s.host, s.port, s.name)}
                            onClick={() => {
                              void telemetry.track("server_join_clicked", {
                                serverId: `${s.host}:${s.port}`,
                                gameSlug: effectiveGameSlug,
                              });
                            }}
                            className="rounded-full bg-play px-3 py-1 text-xs font-bold text-play-foreground hover:brightness-110"
                          >
                            Join
                          </a>
                        ) : (
                          <LauncherInstallButton slug={effectiveGameSlug} label="Install" className="px-3 py-1 text-xs" />
                        )}
                        <button
                          type="button"
                          onClick={async () => {
                            await navigator.clipboard.writeText(addr);
                            setCopied(addr);
                            setTimeout(() => setCopied(null), 1500);
                          }}
                          className="rounded-full border border-border bg-secondary px-3 py-1 text-xs font-bold"
                        >
                          {copied === addr ? "Copied" : "Copy"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
