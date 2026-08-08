"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, X, ArrowUp, ArrowDown } from "lucide-react";
import type { Game } from "@/lib/data/types";
import { GameArt } from "@/components/GameArt";

export type AdminGameRow = Game & {
  published: boolean;
  updatedAt?: string;
  installCount?: number;
};

/**
 * The admin games table, with search and sorting.
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
  const [query, setQuery] = useState("");
  const [sortCol, setSortCol] = useState<string>("Updated");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function handleSort(col: string) {
    if (sortCol === col) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
  }

  const filtered = useMemo(() => {
    let result = games;
    const q = query.trim().toLowerCase();

    if (q) {
      result = games.filter((g) =>
        [g.title, g.slug, g.developerSlug, ...(g.aliases ?? [])]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(q))
      );
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
        case "Published":
          aVal = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          bVal = b.createdAt ? new Date(b.createdAt).getTime() : 0;
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
  }, [games, query, sortCol, sortDir, modCounts]);

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
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, slug or developer…"
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

      {query && (
        <p className="text-xs text-muted-foreground">
          {filtered.length} of {games.length} game{games.length === 1 ? "" : "s"}
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
              <SortableHeader label="Published" />
              <SortableHeader label="Updated" />
              <th className="px-4 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                  No games match &ldquo;{query}&rdquo;.
                </td>
              </tr>
            ) : (
              filtered.map((g) => {
                const editions = editionCounts[g.slug] ?? 0;
                const mods = modCounts?.[g.slug] ?? 0;
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
                      <span
                        className={
                          g.status === "published"
                            ? "font-semibold text-primary"
                            : g.status === "testing"
                              ? "font-semibold text-amber-600 dark:text-amber-300"
                              : "text-muted-foreground"
                        }
                      >
                        {g.status === "published"
                          ? "Published"
                          : g.status === "testing"
                            ? "Testing"
                            : "Draft"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {g.createdAt ? new Date(g.createdAt).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {g.updatedAt ? new Date(g.updatedAt).toLocaleString() : "—"}
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
