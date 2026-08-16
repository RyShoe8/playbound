"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, X, ArrowUp, ArrowDown } from "lucide-react";
import type { Game } from "@/lib/data/types";
import { CATALOG_STATUSES, type CatalogStatus } from "@/lib/catalogStatus";
import { GameArt } from "@/components/GameArt";
import { LocalTime } from "@/components/LocalTime";

export type AdminGameRow = Game & {
  published: boolean;
  updatedAt?: string;
  /** Set when the game was last moved to published; absent on older rows. */
  publishedAt?: string | null;
  installCount?: number;
};

/**
 * The admin games table, with search, status filtering, and inline status editing.
 */
export function AdminGamesTable({
  games,
  editionCounts,
  modCounts,
}: {
  games: AdminGameRow[];
  /** Plain object rather than a Map — this crosses the server/client boundary. */
  editionCounts: Record<string, number>;
  modCounts?: Record<string, number>;
}) {
  const [rows, setRows] = useState(games);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortCol, setSortCol] = useState<string>("Updated");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  const [statusPendingSlug, setStatusPendingSlug] = useState<string | null>(null);

  function handleSort(col: string) {
    if (sortCol === col) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
  }

  async function changeStatus(slug: string, nextStatus: CatalogStatus) {
    const prev = (rows.find((g) => g.slug === slug)?.status || "draft") as CatalogStatus;
    if (prev === nextStatus) return;
    setStatusPendingSlug(slug);
    setRows((list) =>
      list.map((g) =>
        g.slug === slug ? { ...g, status: nextStatus, published: nextStatus === "published" } : g
      )
    );
    try {
      const res = await fetch(`/api/admin/games/${encodeURIComponent(slug)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `Failed (${res.status})`);
      }
    } catch (err) {
      setRows((list) =>
        list.map((g) => (g.slug === slug ? { ...g, status: prev, published: prev === "published" } : g))
      );
      console.error(err);
      alert(err instanceof Error ? err.message : "Could not update status");
    } finally {
      setStatusPendingSlug(null);
    }
  }

  async function toggleComplete(slug: string, next: boolean) {
    const prev = rows.find((g) => g.slug === slug)?.complete;
    setPendingSlug(slug);
    setRows((list) => list.map((g) => (g.slug === slug ? { ...g, complete: next } : g)));
    try {
      const res = await fetch(`/api/admin/games/${encodeURIComponent(slug)}/complete`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complete: next }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `Failed (${res.status})`);
      }
    } catch (err) {
      setRows((list) =>
        list.map((g) => (g.slug === slug ? { ...g, complete: Boolean(prev) } : g))
      );
      console.error(err);
      alert(err instanceof Error ? err.message : "Could not update Complete");
    } finally {
      setPendingSlug(null);
    }
  }

  const filtered = useMemo(() => {
    let result = rows;
    const q = query.trim().toLowerCase();

    if (q) {
      result = rows.filter((g) =>
        [
          g.title,
          g.slug,
          g.developerSlug,
          ...(g.aliases ?? []),
          ...(g.platforms ?? []),
          ...(g.genres ?? []),
          ...(g.tags ?? []),
        ]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(q))
      );
    }

    if (statusFilter !== "all") {
      result = result.filter((g) => (g.status || "draft") === statusFilter);
    }

    return result.slice().sort((a, b) => {
      let aVal: any = 0;
      let bVal: any = 0;

      switch (sortCol) {
        case "Game":
          aVal = (a.title || "").toLowerCase();
          bVal = (b.title || "").toLowerCase();
          break;
        case "Slug":
          aVal = (a.slug || "").toLowerCase();
          bVal = (b.slug || "").toLowerCase();
          break;
        case "Installs":
          aVal = a.installCount ?? 0;
          bVal = b.installCount ?? 0;
          break;
        case "Version":
          aVal = (a.launcherInstall?.detectedVersion || a.launcherInstall?.versionLabel || "").toLowerCase();
          bVal = (b.launcherInstall?.detectedVersion || b.launcherInstall?.versionLabel || "").toLowerCase();
          break;
        case "Status":
          aVal = (a.status || "").toLowerCase();
          bVal = (b.status || "").toLowerCase();
          break;
        case "Mods":
          aVal = modCounts?.[a.slug] ?? 0;
          bVal = modCounts?.[b.slug] ?? 0;
          break;
        case "Complete":
          aVal = Number(Boolean(a.complete));
          bVal = Number(Boolean(b.complete));
          break;
        case "Published":
          aVal = a.status === "published" && a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
          bVal = b.status === "published" && b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
          break;
        case "Updated":
        default:
          aVal = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          bVal = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          break;
      }

      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [rows, query, statusFilter, sortCol, sortDir, modCounts]);

  const SortableHeader = ({ label }: { label: string }) => (
    <th
      className="px-4 py-3 font-semibold cursor-pointer select-none hover:bg-secondary/80 transition-colors"
      onClick={() => handleSort(label)}
    >
      <div className="flex items-center gap-1">
        {label}
        {sortCol === label ? (
          sortDir === "asc" ? (
            <ArrowUp className="size-3 text-primary" />
          ) : (
            <ArrowDown className="size-3 text-primary" />
          )
        ) : (
          <ArrowDown className="size-3 opacity-0" />
        )}
      </div>
    </th>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1 min-w-[240px]">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, slug, developer, platform…"
            aria-label="Search games"
            className="h-9 w-full rounded-lg border border-input bg-secondary/50 pr-9 pl-9 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
          className="h-9 rounded-lg border border-input bg-secondary/50 px-3 text-sm font-medium outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
        >
          <option value="all">All statuses</option>
          <option value="published">Published</option>
          <option value="testing">Testing</option>
          <option value="watchlist">Watchlist</option>
          <option value="draft">Draft</option>
        </select>
      </div>

      {(query || statusFilter !== "all") && (
        <p className="text-xs text-muted-foreground">
          {filtered.length} of {rows.length} game{rows.length === 1 ? "" : "s"}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/40 text-left text-xs tracking-wide text-muted-foreground uppercase">
              <SortableHeader label="Game" />
              <SortableHeader label="Slug" />
              <SortableHeader label="Mods" />
              <SortableHeader label="Installs" />
              <SortableHeader label="Version" />
              <SortableHeader label="Status" />
              <SortableHeader label="Complete" />
              <SortableHeader label="Published" />
              <SortableHeader label="Updated" />
              <th className="px-4 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                  No games match the current filters.
                </td>
              </tr>
            ) : (
              filtered.map((g) => {
                const editions = editionCounts[g.slug] ?? 0;
                const mods = modCounts?.[g.slug] ?? 0;
                const isComplete = Boolean(g.complete);
                const toggling = pendingSlug === g.slug;
                const statusChanging = statusPendingSlug === g.slug;
                const currentStatus = (g.status || "draft") as CatalogStatus;
                return (
                  <tr key={g.slug} className="border-b border-border bg-card last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <GameArt game={g} showTitle={false} iconSize="sm" className="size-8 rounded-md" />
                        <span className="font-semibold">{g.title}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{g.slug}</td>
                    <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                      {mods}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                      {g.installCount ?? 0}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground tabular-nums">
                      {g.launcherInstall?.detectedVersion || g.launcherInstall?.versionLabel || "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <select
                        disabled={statusChanging}
                        value={currentStatus}
                        onChange={(e) => void changeStatus(g.slug, e.target.value as CatalogStatus)}
                        aria-label={`Status for ${g.title}`}
                        className={`rounded-md border px-2 py-1 text-xs font-bold outline-none cursor-pointer transition-colors disabled:opacity-50 ${
                          currentStatus === "published"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : currentStatus === "testing"
                              ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                              : currentStatus === "watchlist"
                                ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                                : "border-border bg-secondary/60 text-muted-foreground"
                        }`}
                      >
                        {CATALOG_STATUSES.map((statusVal) => (
                          <option key={statusVal} value={statusVal} className="bg-popover text-popover-foreground capitalize">
                            {statusVal.charAt(0).toUpperCase() + statusVal.slice(1)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        disabled={toggling}
                        onClick={() => void toggleComplete(g.slug, !isComplete)}
                        title="Mark whether catalog info for this title is fully entered"
                        className={
                          isComplete
                            ? "rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary disabled:opacity-60"
                            : "rounded-md border border-border bg-secondary/60 px-2 py-0.5 text-xs font-bold text-muted-foreground disabled:opacity-60"
                        }
                      >
                        {isComplete ? "Yes" : "No"}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {currentStatus === "published" && g.publishedAt ? (
                        <LocalTime
                          value={new Date(g.publishedAt).toISOString()}
                        />
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      <LocalTime
                        value={g.updatedAt ? new Date(g.updatedAt).toISOString() : null}
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <Link
                        href={`/admin/games/${g.slug}/editions`}
                        className="mr-3 text-xs font-semibold text-muted-foreground hover:underline"
                      >
                        Editions
                        {editions > 0 && (
                          <span className="ml-1 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-bold">
                            {editions}
                          </span>
                        )}
                      </Link>
                      <Link
                        href={`/admin/games/${g.slug}/edit`}
                        className="font-semibold text-primary hover:underline"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
