"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Lock, RefreshCw, Server, Users } from "lucide-react";
import { launcherJoinUrl, isOneClickSlug } from "@/lib/launcher";
import type { GameServer } from "@/lib/servers/types";
import { estimateLatencyMs } from "@/lib/servers/latencyEstimate";
import { EmptyHint } from "@/components/ui/bits";
import { LauncherInstallButton } from "@/components/LauncherInstallButton";
import { cn } from "@/lib/utils";

type IndexGame = {
  slug: string;
  title: string;
  supported: boolean;
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

function formatLocation(server: GameServer): string {
  const loc = server.location;
  if (!loc) return "—";
  if (loc.region && loc.region.length > 2) return loc.region;
  return loc.countryCode || "—";
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
  const installedGames = useMemo(() => new Set(installedGameSlugs), [installedGameSlugs]);
  const installedMods = useMemo(() => new Set(installedModSlugs), [installedModSlugs]);

  const [games, setGames] = useState<IndexGame[]>([]);
  const [mods, setMods] = useState<CatalogMod[]>([]);
  const [gameSlug, setGameSlug] = useState("");
  const [modSlug, setModSlug] = useState("");
  const [installedOnly, setInstalledOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [viewer, setViewer] = useState<ViewerGeo | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [modNote, setModNote] = useState("");

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
        if (supported[0]?.slug) setGameSlug(supported[0].slug);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleGames = useMemo(() => {
    if (!installedOnly) return games;
    return games.filter((g) => installedGames.has(g.slug));
  }, [games, installedOnly, installedGames]);

  const visibleMods = useMemo(() => {
    let list = mods.filter((m) => m.baseGameSlug === gameSlug && (m.baseSupported || m.baseHasServers));
    if (installedOnly) list = list.filter((m) => installedMods.has(m.slug));
    return list;
  }, [mods, gameSlug, installedOnly, installedMods]);

  useEffect(() => {
    if (!visibleGames.some((g) => g.slug === gameSlug)) {
      setGameSlug(visibleGames[0]?.slug || "");
      setModSlug("");
    }
  }, [visibleGames, gameSlug]);

  useEffect(() => {
    if (modSlug && !visibleMods.some((m) => m.slug === modSlug)) setModSlug("");
  }, [visibleMods, modSlug]);

  const loadServers = useCallback(async (slug: string, mod: CatalogMod | null) => {
    if (!slug) {
      setData(null);
      return;
    }
    setLoading(true);
    setModNote("");
    try {
      const [serversRes, geoRes] = await Promise.all([
        fetch(`/api/games/${encodeURIComponent(slug)}/servers`, { cache: "no-store" }),
        fetch("/api/geo/me", { cache: "no-store" }).catch(() => null),
      ]);
      const json = serversRes.ok
        ? ((await serversRes.json()) as ApiResponse)
        : { supported: false, servers: [] };
      if (geoRes?.ok) {
        const geo = await geoRes.json();
        setViewer({
          countryCode: geo.countryCode ?? null,
          lat: geo.lat ?? null,
          lon: geo.lon ?? null,
        });
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
      }
      setData({ ...json, servers });
    } catch {
      setData({ supported: false, servers: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const mod = modSlug ? mods.find((m) => m.slug === modSlug) || null : null;
    void loadServers(gameSlug, mod);
  }, [gameSlug, modSlug, mods, loadServers]);

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
    return list;
  }, [data, search]);

  const selectedTitle = games.find((g) => g.slug === gameSlug)?.title || gameSlug;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[160px] flex-1 flex-col gap-1 text-xs font-semibold text-muted-foreground">
          Game
          <select
            value={gameSlug}
            onChange={(e) => {
              setGameSlug(e.target.value);
              setModSlug("");
            }}
            className="h-10 rounded-xl border border-border bg-secondary px-3 text-sm font-bold text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
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
            value={modSlug}
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
            const mod = modSlug ? mods.find((m) => m.slug === modSlug) || null : null;
            void loadServers(gameSlug, mod);
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

      {!gameSlug || (installedOnly && !visibleGames.length) ? (
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
        <EmptyHint icon={Server}>No servers match.</EmptyHint>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Server</th>
                <th className="px-3 py-2.5 font-semibold">Players</th>
                <th className="px-3 py-2.5 font-semibold">Map / Mode</th>
                <th className="px-3 py-2.5 font-semibold">Location</th>
                <th className="px-3 py-2.5 font-semibold" title="GeoIP estimate, not a real ping">
                  Est.
                </th>
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
                        {s.players}/{s.maxPlayers ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{s.map || "—"}</td>
                    <td className="px-3 py-3 text-muted-foreground">{formatLocation(s)}</td>
                    <td className="px-3 py-3 tabular-nums text-muted-foreground">{formatEstMs(estFor(s))}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {isOneClickSlug(gameSlug) ? (
                          <a
                            href={launcherJoinUrl(gameSlug, s.host, s.port, s.name)}
                            className="rounded-full bg-play px-3 py-1 text-xs font-bold text-play-foreground hover:brightness-110"
                          >
                            Join
                          </a>
                        ) : (
                          <LauncherInstallButton slug={gameSlug} label="Install" className="px-3 py-1 text-xs" />
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
