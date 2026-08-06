"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import type { Game } from "@/lib/data/types";
import { GameArt } from "@/components/GameArt";

export type AdminGameRow = Game & {
  published: boolean;
  updatedAt?: string;
  installCount?: number;
};

/**
 * The admin games table, with search.
 *
 * Filtering happens in memory rather than through the URL: the page already
 * loads every game server-side, so a round trip per keystroke would be slower
 * for no benefit. That also keeps the table instant as the catalog grows.
 */
export function AdminGamesTable({
  games,
  editionCounts,
}: {
  games: AdminGameRow[];
  /** Plain object rather than a Map — this crosses the server/client boundary. */
  editionCounts: Record<string, number>;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return games;
    // Slug and developer are searched alongside the title because an admin
    // looking for a game often knows its URL or who made it, not its exact
    // display name.
    return games.filter((g) =>
      [g.title, g.slug, g.developerSlug, ...(g.aliases ?? [])]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q))
    );
  }, [games, query]);

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
              <th className="px-4 py-3 font-semibold">Game</th>
              <th className="px-4 py-3 font-semibold">Slug</th>
              <th className="px-4 py-3 font-semibold">Installs</th>
              <th className="px-4 py-3 font-semibold">Version</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Updated</th>
              <th className="px-4 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  No games match &ldquo;{query}&rdquo;.
                </td>
              </tr>
            ) : (
              filtered.map((g) => {
                const editions = editionCounts[g.slug] ?? 0;
                return (
                  <tr key={g.slug} className="border-b border-border bg-card last:border-0">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <GameArt game={g} showTitle={false} iconSize="sm" className="size-8 rounded-md" />
                        <span className="font-semibold">{g.title}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{g.slug}</td>
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
