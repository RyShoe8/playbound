"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Copy, Lock, RefreshCw, Server, Users } from "lucide-react";
import { launcherJoinUrl, launcherInstallUrl, isOneClickSlug } from "@/lib/launcher";
import type { GameServer } from "@/lib/servers/types";
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

function formatLocation(server: GameServer): string {
  const loc = server.location;
  if (!loc) return "—";
  if (loc.region && loc.region.length > 2) return loc.region;
  return loc.countryCode || "—";
}

export function ServerBrowser({ slug, title, supportsServers }: Props) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supportsServers) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/games/${slug}/servers`, { cache: "no-store" });
      const json = (await res.json()) as ApiResponse;
      setData(json);
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

  const servers = data?.servers ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold">Live servers</h3>
          <p className="text-sm text-muted-foreground">
            Location is from the master list / GeoIP (not your personal ping). Join opens the PlayBound
            Launcher when installed.
          </p>
        </div>
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

      {data?.error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {data.error}
        </p>
      )}

      {loading && !data ? (
        <p className="text-sm text-muted-foreground">Loading servers…</p>
      ) : servers.length === 0 ? (
        <EmptyHint icon={Server}>No public servers reported right now. Try refresh in a minute.</EmptyHint>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2.5 font-semibold">Server</th>
                <th className="px-3 py-2.5 font-semibold">Players</th>
                <th className="px-3 py-2.5 font-semibold">Map / Mode</th>
                <th className="px-3 py-2.5 font-semibold">Location</th>
                <th className="px-3 py-2.5 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {servers.map((s) => (
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
          Updated {new Date(data.updatedAt).toLocaleTimeString()} · {servers.length} shown
        </p>
      )}
    </div>
  );
}
