"use client";
import { PremiumSelect } from "@/components/ui/PremiumSelect";
import { Checkbox } from "@/components/ui/Checkbox";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  choosablePublicEditions,
  type EditionOption,
} from "@/lib/servers/editionOptions";
import { Lock, RefreshCw, Server, Users } from "lucide-react";
import { launcherJoinUrl, launcherPlayUrl, isOneClickSlug } from "@/lib/launcher";
import type { GameServer } from "@/lib/servers/types";
import { estimateLatencyMs } from "@/lib/servers/latencyEstimate";
import { EmptyHint } from "@/components/ui/bits";
import { LauncherInstallButton } from "@/components/LauncherInstallButton";
import { cn } from "@/lib/utils";
import { telemetry } from "@/lib/telemetry";
import { useCompatibilityFilter } from "@/hooks/useCompatibilityFilter";
import { isGameCompatible } from "@/lib/compatibility/compatibility";

const WITH_PLAYERS_PREF = "playbound_servers_with_players";

function readWithPlayersPref(): boolean {
  try {
    const v = localStorage.getItem(WITH_PLAYERS_PREF);
    if (v === null) return true;
    return v === "true";
  } catch {
    return true;
  }
}

type IndexGame = {
  slug: string;
  title: string;
  supported: boolean;
  platforms?: string[];
  browserPlayable?: boolean;
  steamDeck?: boolean;
  testing?: boolean;
  status?: string;
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
  /** When set, hide games whose resolved access is VALUE (FREE discovery mode). */
  allowedSlugs?: string[] | null;
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
  allowedSlugs = null,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryGame = searchParams.get("game")?.trim() || "";
  const queryMod = searchParams.get("mod")?.trim() || "";
  const queryEdition = searchParams.get("edition")?.trim() || "";

  const installedGames = useMemo(() => new Set(installedGameSlugs), [installedGameSlugs]);
  const installedMods = useMemo(() => new Set(installedModSlugs), [installedModSlugs]);

  const [games, setGames] = useState<IndexGame[]>([]);
  const [mods, setMods] = useState<CatalogMod[]>([]);
  const [editions, setEditions] = useState<EditionOption[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [gameSlug, setGameSlug] = useState(queryGame);
  const [modSlug, setModSlug] = useState(queryMod);
  const [editionSlug, setEditionSlug] = useState(queryEdition);
  const [installedOnly, setInstalledOnly] = useState(false);
  const [withPlayersOnly, setWithPlayersOnly] = useState(true);

  useEffect(() => {
    setWithPlayersOnly(readWithPlayersPref());
  }, []);
  const [search, setSearch] = useState("");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [viewer, setViewer] = useState<ViewerGeo | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [filterNote, setFilterNote] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("players");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const { mode, device } = useCompatibilityFilter();
  const lastViewedSlug = useRef<string | null>(null);
  const urlSyncSkip = useRef(true);

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
          fetch("/api/launcher/servers", { cache: "no-store", credentials: "same-origin" }),
          fetch("/api/launcher/mods", { cache: "no-store", credentials: "same-origin" }),
        ]);
        const serversJson = serversRes.ok ? await serversRes.json() : { games: [] };
        const modsJson = modsRes.ok ? await modsRes.json() : { mods: [] };
        if (cancelled) return;
        const allowed = allowedSlugs ? new Set(allowedSlugs) : null;
        const supported = (serversJson.games || []).filter(
          (g: IndexGame) => g.supported && (!allowed || allowed.has(g.slug))
        );
        setGames(supported);
        const allowedMods = allowed
          ? (modsJson.mods || []).filter((m: CatalogMod) => allowed.has(m.baseGameSlug))
          : modsJson.mods || [];
        setMods(allowedMods);
        if (queryGame && supported.some((g: IndexGame) => g.slug === queryGame)) {
          setGameSlug(queryGame);
        } else {
          setGameSlug((prev) =>
            prev && supported.some((g: IndexGame) => g.slug === prev) ? prev : ""
          );
        }
        if (queryMod) setModSlug(queryMod);
        if (queryEdition) setEditionSlug(queryEdition);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setCatalogLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [queryGame, queryMod, queryEdition, allowedSlugs]);

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

  const effectiveGameSlug = useMemo(
    () => (visibleGames.some((g) => g.slug === gameSlug) ? gameSlug : ""),
    [visibleGames, gameSlug]
  );

  // Load editions when game changes.
  useEffect(() => {
    let cancelled = false;
    if (!effectiveGameSlug) {
      setEditions([]);
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `/api/games/${encodeURIComponent(effectiveGameSlug)}/editions`,
          { cache: "no-store" }
        );
        if (!res.ok || cancelled) return;
        const json = await res.json();
        const list = (json.editions || []) as EditionOption[];
        if (!cancelled) setEditions(list);
      } catch {
        if (!cancelled) setEditions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveGameSlug]);

  const editionOptions = useMemo(() => choosablePublicEditions(editions), [editions]);
  const editionMode = editionOptions.length >= 1;

  const editionNameBySlug = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of editionOptions) map.set(e.slug, e.name);
    return map;
  }, [editionOptions]);

  const visibleMods = useMemo(() => {
    if (editionMode) return [];
    let list = mods.filter(
      (m) => m.baseGameSlug === effectiveGameSlug && (m.baseSupported || m.baseHasServers)
    );
    if (installedOnly) list = list.filter((m) => installedMods.has(m.slug));
    return list;
  }, [mods, effectiveGameSlug, installedOnly, installedMods, editionMode]);

  const effectiveModSlug = useMemo(() => {
    if (editionMode) return "";
    return modSlug && visibleMods.some((m) => m.slug === modSlug) ? modSlug : "";
  }, [visibleMods, modSlug, editionMode]);

  const effectiveEditionSlug = useMemo(() => {
    if (!editionMode) return "";
    return editionSlug && editionOptions.some((e) => e.slug === editionSlug) ? editionSlug : "";
  }, [editionMode, editionSlug, editionOptions]);

  // Keep URL shareable (game + edition/mod).
  useEffect(() => {
    if (!catalogLoaded) return;
    if (urlSyncSkip.current) {
      urlSyncSkip.current = false;
      return;
    }
    const params = new URLSearchParams();
    if (effectiveGameSlug) params.set("game", effectiveGameSlug);
    if (editionMode && effectiveEditionSlug) params.set("edition", effectiveEditionSlug);
    if (!editionMode && effectiveModSlug) params.set("mod", effectiveModSlug);
    const qs = params.toString();
    const next = qs ? `/servers?${qs}` : "/servers";
    const current = `${window.location.pathname}${window.location.search}`;
    if (current !== next) {
      router.replace(next, { scroll: false });
    }
  }, [
    catalogLoaded,
    effectiveGameSlug,
    effectiveEditionSlug,
    effectiveModSlug,
    editionMode,
    router,
  ]);

  const requestSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const viewerGeoFetched = useRef(false);
  const listCache = useRef(new Map<string, ApiResponse>());

  const loadServers = useCallback(
    async (slug: string, mod: CatalogMod | null, edition = "", editionLabel = "") => {
      if (!slug) {
        setData(null);
        return;
      }
      const seq = ++requestSeq.current;
      const isStale = () => seq !== requestSeq.current;

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      const applyFilters = (raw: GameServer[]) => {
        let servers = raw;
        setFilterNote("");
        if (mod) {
          const filtered = filterServersForMod(servers, mod);
          setFilterNote(
            filtered.matched
              ? `Showing servers matching ${mod.title}.`
              : `No gameType match for ${mod.title} — showing all ${slug} servers.`
          );
          servers = filtered.matched ? filtered.servers : servers;
        } else if (edition) {
          const needle = edition.toLowerCase();
          const matched = servers.filter((s) => (s.gameType || "").toLowerCase() === needle);
          const label = editionLabel || edition;
          /*
           * Only some providers encode the edition in gameType — EverQuest
           * reports "project-quarm" and "project-99", which is what this filter
           * was written for. Most use the field for what it says: a game mode
           * or gamedir, "csgo" for Counter-Strike, "Free" and "Members" for
           * RuneScape. Against those, an exact match found nothing and the
           * browser went blank for every edition except All.
           *
           * Whether any server carries the tag tells us which case we are in.
           * When none do, the list is shown unfiltered and the note says the
           * game does not tag its servers — the same shape as the mod filter
           * above. Falling back is only dishonest if it is silent.
           */
          const taggedByEdition = servers.some((s) =>
            (s.gameType || "").toLowerCase() === needle
          );
          if (taggedByEdition) {
            setFilterNote(`Showing servers for ${label}.`);
            servers = matched;
          } else {
            const anyTagged = servers.some((s) => s.gameType);
            setFilterNote(
              anyTagged
                ? `${slug} servers aren't tagged by edition — showing all of them.`
                : `Showing all ${slug} servers; this game doesn't report editions.`
            );
          }
        }
        return servers;
      };

      const cacheKey = slug;
      const cached = listCache.current.get(cacheKey);
      if (cached) {
        const servers = applyFilters(Array.isArray(cached.servers) ? cached.servers : []);
        setData({ ...cached, servers });
      } else {
        setData(null);
      }

      setLoading(true);
      if (!cached) setFilterNote("");
      try {
        const needGeo = !viewerGeoFetched.current;
        const [serversRes, geoRes] = await Promise.all([
          // Shares the route's 30s cache; provider queries behind it are the expensive part.
          fetch(`/api/games/${encodeURIComponent(slug)}/servers`, {
            credentials: "same-origin",
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
          viewerGeoFetched.current = true;
        }

        const servers = applyFilters(Array.isArray(json.servers) ? json.servers : []);
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
    },
    []
  );

  useEffect(() => {
    if (!effectiveGameSlug) {
      abortRef.current?.abort();
      return;
    }

    const mod = effectiveModSlug
      ? mods.find((m) => m.slug === effectiveModSlug) || null
      : null;
    const editionLabel = effectiveEditionSlug
      ? editionNameBySlug.get(effectiveEditionSlug) || effectiveEditionSlug
      : "";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadServers(effectiveGameSlug, mod, effectiveEditionSlug, editionLabel);
    return () => {
      abortRef.current?.abort();
    };
  }, [
    effectiveGameSlug,
    effectiveModSlug,
    effectiveEditionSlug,
    editionNameBySlug,
    mods,
    loadServers,
  ]);

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
    /*
     * Most master lists are mostly empty servers — an idle box still answers a
     * query — so an unfiltered browser buries the handful worth joining. Null
     * counts are dropped too: a server that does not report its population is
     * not evidence of anyone being on it.
     */
    if (withPlayersOnly) {
      list = list.filter((s) => Number(s.players) > 0);
    }
    if (q) {
      list = list.filter((s) => {
        const editionLabel = s.gameType
          ? editionNameBySlug.get(s.gameType) || s.gameType
          : "";
        return `${s.name} ${s.map || ""} ${s.gameType || ""} ${editionLabel} ${s.players}/${s.maxPlayers}`
          .toLowerCase()
          .includes(q);
      });
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
  }, [data, search, withPlayersOnly, sortKey, sortDir, estFor, editionNameBySlug]);

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

  function selectGame(next: string) {
    setGameSlug(next);
    setModSlug("");
    setEditionSlug("");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[160px] flex-1 flex-col gap-1 text-xs font-semibold text-muted-foreground">
          Game
          <PremiumSelect
            value={effectiveGameSlug}
            onChange={(e) => selectGame(e.target.value)}
            disabled={!catalogLoaded || visibleGames.length === 0}
            className="h-10 rounded-xl border border-border bg-secondary px-3 text-sm font-bold text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/40 disabled:opacity-50"
          >
            <option value="">Select a game…</option>
            {visibleGames.map((g) => (
              <option key={g.slug} value={g.slug}>
                {g.title}
                {g.testing ? " · Testing" : ""}
              </option>
            ))}
          </PremiumSelect>
        </label>

        {editionMode ? (
          <label className="flex min-w-[160px] flex-1 flex-col gap-1 text-xs font-semibold text-muted-foreground">
            Edition
            <PremiumSelect
              value={effectiveEditionSlug}
              onChange={(e) => {
                setEditionSlug(e.target.value);
                setModSlug("");
              }}
              disabled={!effectiveGameSlug}
              className="h-10 rounded-xl border border-border bg-secondary px-3 text-sm font-bold text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/40 disabled:opacity-50"
            >
              <option value="">All editions</option>
              {editionOptions.map((e) => (
                <option key={e.slug} value={e.slug}>
                  {e.name}
                </option>
              ))}
            </PremiumSelect>
          </label>
        ) : (
          <label className="flex min-w-[160px] flex-1 flex-col gap-1 text-xs font-semibold text-muted-foreground">
            Mod
            <PremiumSelect
              value={effectiveModSlug}
              onChange={(e) => {
                setModSlug(e.target.value);
                setEditionSlug("");
              }}
              disabled={!effectiveGameSlug}
              className="h-10 rounded-xl border border-border bg-secondary px-3 text-sm font-bold text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/40 disabled:opacity-50"
            >
              <option value="">Base game</option>
              {visibleMods.map((m) => (
                <option key={m.slug} value={m.slug}>
                  {m.title}
                </option>
              ))}
            </PremiumSelect>
          </label>
        )}

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
        <div
          className={cn(
            "flex h-10 items-center rounded-xl border border-border bg-secondary px-3.5 text-sm font-semibold",
            !signedIn && "opacity-60"
          )}
          title={!signedIn ? "Sign in and sync the launcher to use Installed only" : undefined}
        >
          <Checkbox
            checked={installedOnly}
            disabled={!signedIn}
            onCheckedChange={setInstalledOnly}
            label="Installed only"
          />
        </div>
        <div className="flex h-10 items-center rounded-xl border border-border bg-secondary px-3.5 text-sm font-semibold">
          <Checkbox
            checked={withPlayersOnly}
            onCheckedChange={(next) => {
              setWithPlayersOnly(next);
              try {
                localStorage.setItem(WITH_PLAYERS_PREF, String(next));
              } catch {
                /* ignore */
              }
            }}
            label="Servers With Players"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            listCache.current.delete(effectiveGameSlug);
            const mod = effectiveModSlug
              ? mods.find((m) => m.slug === effectiveModSlug) || null
              : null;
            const editionLabel = effectiveEditionSlug
              ? editionNameBySlug.get(effectiveEditionSlug) || effectiveEditionSlug
              : "";
            void loadServers(effectiveGameSlug, mod, effectiveEditionSlug, editionLabel);
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
          and connect the launcher to filter by installed games
          {editionMode ? "" : " and mods"}.
        </p>
      )}
      {filterNote && <p className="text-xs text-muted-foreground">{filterNote}</p>}
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
      {effectiveGameSlug === "openra" ? (
        <p className="text-xs text-muted-foreground">
          Joining a listed server never needs port forwarding. Hosting from your PC does —
          PlayBound turns on OpenRA&apos;s UPnP so most home routers open UDP 1234 automatically.
          Campus Wi-Fi and CGNAT still block hosting; use a public server in that case.
        </p>
      ) : null}

      {!catalogLoaded ? (
        <p className="text-sm text-muted-foreground">Loading server catalog…</p>
      ) : visibleGames.length === 0 ? (
        <EmptyHint icon={Server}>
          {installedOnly
            ? "No installed games have live server browsers. Install a multiplayer title or turn off Installed only."
            : "No live servers for games compatible with this device. Switch to All Games to browse every title."}
        </EmptyHint>
      ) : !effectiveGameSlug ? (
        <EmptyHint icon={Server}>
          Pick a game above to see who&apos;s playing right now.
        </EmptyHint>
      ) : loading && !data ? (
        <p className="text-sm text-muted-foreground">Loading servers…</p>
      ) : data && !data.supported ? (
        <EmptyHint icon={Server}>Live listings for {selectedTitle} aren&apos;t wired yet.</EmptyHint>
      ) : rows.length === 0 ? (
        <EmptyHint icon={Server}>
          {data?.error
            ? "No servers returned (see error above)."
            : withPlayersOnly
              ? "Every listed server is empty right now. Turn off Servers With Players to see them all."
              : effectiveEditionSlug
                ? `No servers for ${editionNameBySlug.get(effectiveEditionSlug) || effectiveEditionSlug}.`
                : "No servers match."}
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
                const editionLabel = s.gameType
                  ? editionNameBySlug.get(s.gameType) || s.gameType
                  : null;
                return (
                  <tr key={s.id || addr} className="border-b border-border last:border-0">
                    <td className="px-3 py-3">
                      <div className="font-semibold">{s.name}</div>
                      {editionLabel && (
                        <div className="text-xs text-muted-foreground">{editionLabel}</div>
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
                        {s.gameType === "steam-concurrent" ? (
                          installedGames.has(effectiveGameSlug) ? (
                            <a
                              href={launcherPlayUrl(effectiveGameSlug)}
                              onClick={() => {
                                void telemetry.track("server_join_clicked", {
                                  serverId: `${s.host}:${s.port}`,
                                  gameSlug: effectiveGameSlug,
                                  phase: "play",
                                });
                              }}
                              className="rounded-full bg-play px-3 py-1 text-xs font-bold text-play-foreground hover:brightness-110"
                            >
                              Play
                            </a>
                          ) : (
                            <LauncherInstallButton
                              slug={effectiveGameSlug}
                              label="Install"
                              className="px-3 py-1 text-xs"
                            />
                          )
                        ) : (
                          <>
                            {installedGames.has(effectiveGameSlug) &&
                            isOneClickSlug(effectiveGameSlug) ? (
                              <a
                                href={launcherJoinUrl(
                                  effectiveGameSlug,
                                  s.host,
                                  s.port,
                                  s.name,
                                  s.mod
                                )}
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
                              <LauncherInstallButton
                                slug={effectiveGameSlug}
                                label="Install"
                                className="px-3 py-1 text-xs"
                              />
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
                          </>
                        )}
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
