"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import type { CatalogModPublic } from "@/lib/mods";

type AdminModRow = CatalogModPublic & {
  classifications?: Array<{ id: string; name: string; path: string; leaf: string }>;
};

interface Props {
  mods: AdminModRow[];
  gameTitlesBySlug: Record<string, string>;
}

export function AdminModsTable({ mods, gameTitlesBySlug }: Props) {
  const [query, setQuery] = useState("");
  const [selectedGame, setSelectedGame] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");

  const filtered = useMemo(() => {
    let list = mods;
    if (selectedGame) {
      list = list.filter((m) => m.baseGameSlug === selectedGame);
    }
    if (selectedStatus !== "all") {
      list = list.filter((m) => (m.status || "published") === selectedStatus);
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((m) => {
        const gameName = gameTitlesBySlug[m.baseGameSlug] || m.baseGameSlug;
        const tags = (m.classifications || []).map((c) => `${c.name} ${c.path}`).join(" ");
        return `${m.title} ${m.slug} ${gameName} ${tags} ${m.developerSlug}`.toLowerCase().includes(q);
      });
    }
    return list;
  }, [mods, query, selectedGame, selectedStatus, gameTitlesBySlug]);

  const uniqueGames = useMemo(() => {
    const set = new Set(mods.map((m) => m.baseGameSlug));
    return Array.from(set).sort((a, b) =>
      (gameTitlesBySlug[a] || a).localeCompare(gameTitlesBySlug[b] || b)
    );
  }, [mods, gameTitlesBySlug]);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search mods by name, game, or tags…"
            className="h-10 w-full rounded-xl border border-border bg-secondary pl-10 pr-4 text-sm font-semibold outline-none focus:border-primary"
          />
        </div>

        <select
          value={selectedGame}
          onChange={(e) => setSelectedGame(e.target.value)}
          className="h-10 rounded-xl border border-border bg-secondary px-3 text-sm font-semibold outline-none focus:border-primary"
        >
          <option value="">All Games ({uniqueGames.length})</option>
          {uniqueGames.map((slug) => (
            <option key={slug} value={slug}>
              {gameTitlesBySlug[slug] || slug}
            </option>
          ))}
        </select>

        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="h-10 rounded-xl border border-border bg-secondary px-3 text-sm font-semibold outline-none focus:border-primary"
        >
          <option value="all">All Statuses</option>
          <option value="published">Published</option>
          <option value="testing">Testing</option>
          <option value="draft">Draft</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/40 text-left text-xs font-bold tracking-wide text-muted-foreground uppercase">
              <th className="px-4 py-3">Mod</th>
              <th className="px-4 py-3">Game</th>
              <th className="px-4 py-3">Classifications</th>
              <th className="px-4 py-3">Install</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No mods found matching your filters.
                </td>
              </tr>
            ) : (
              filtered.map((m) => {
                const gameTitle = gameTitlesBySlug[m.baseGameSlug] || m.baseGameSlug;
                const status = m.status || "published";

                return (
                  <tr key={m.slug} className="border-b border-border last:border-0 hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 font-semibold">
                      <div>
                        <Link href={`/admin/mods/${m.slug}/edit`} className="font-bold hover:underline text-foreground">
                          {m.title}
                        </Link>
                        <p className="font-mono text-xs text-muted-foreground">{m.slug}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <Link href={`/admin/games/${m.baseGameSlug}/mods`} className="hover:underline font-semibold">
                        {gameTitle}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {m.classifications && m.classifications.length > 0 ? (
                          m.classifications.map((c) => (
                            <span
                              key={c.id}
                              title={c.path}
                              className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-foreground border border-border"
                            >
                              {c.name}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground italic">None</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={m.downloadKind === "external" ? "text-muted-foreground text-xs" : "font-bold text-primary text-xs"}>
                        {m.downloadKind === "external" ? "External link" : "One-click"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          status === "published"
                            ? "bg-primary/10 text-primary"
                            : status === "testing"
                              ? "bg-amber-500/10 text-amber-500"
                              : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/mods/${m.slug}/edit`}
                        className="rounded-full bg-secondary px-3 py-1.5 text-xs font-bold hover:bg-primary hover:text-primary-foreground transition-colors"
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
