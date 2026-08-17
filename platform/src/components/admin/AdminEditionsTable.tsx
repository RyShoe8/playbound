"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import type { Edition } from "@/lib/editionTypes";

interface Props {
  editions: Edition[];
  gameTitlesBySlug: Record<string, string>;
}

export function AdminEditionsTable({ editions, gameTitlesBySlug }: Props) {
  const [query, setQuery] = useState("");
  const [selectedGame, setSelectedGame] = useState("");
  const [selectedVisibility, setSelectedVisibility] = useState("all");

  const filtered = useMemo(() => {
    let list = editions;
    if (selectedGame) {
      list = list.filter((e) => e.gameSlug === selectedGame);
    }
    if (selectedVisibility !== "all") {
      list = list.filter((e) => (e.visibility || "public") === selectedVisibility);
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((e) => {
        const gameName = gameTitlesBySlug[e.gameSlug] || e.gameSlug;
        return `${e.name} ${e.slug} ${gameName} ${e.type} ${(e.tags || []).join(" ")}`.toLowerCase().includes(q);
      });
    }
    return list;
  }, [editions, query, selectedGame, selectedVisibility, gameTitlesBySlug]);

  const uniqueGames = useMemo(() => {
    const set = new Set(editions.map((e) => e.gameSlug));
    return Array.from(set).sort((a, b) =>
      (gameTitlesBySlug[a] || a).localeCompare(gameTitlesBySlug[b] || b)
    );
  }, [editions, gameTitlesBySlug]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search editions by name or game…"
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
          value={selectedVisibility}
          onChange={(e) => setSelectedVisibility(e.target.value)}
          className="h-10 rounded-xl border border-border bg-secondary px-3 text-sm font-semibold outline-none focus:border-primary"
        >
          <option value="all">All Visibility</option>
          <option value="public">Public</option>
          <option value="unlisted">Unlisted</option>
          <option value="hidden">Hidden</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/40 text-left text-xs font-bold tracking-wide text-muted-foreground uppercase">
              <th className="px-4 py-3">Edition</th>
              <th className="px-4 py-3">Game</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Install Method</th>
              <th className="px-4 py-3">Visibility</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No editions found matching your filters.
                </td>
              </tr>
            ) : (
              filtered.map((e) => {
                const gameTitle = gameTitlesBySlug[e.gameSlug] || e.gameSlug;
                return (
                  <tr key={`${e.gameSlug}-${e.slug}`} className="border-b border-border last:border-0 hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 font-semibold">
                      <div>
                        <Link href={`/admin/games/${e.gameSlug}/editions/${e.slug}/edit`} className="font-bold hover:underline text-foreground">
                          {e.name}
                        </Link>
                        <p className="font-mono text-xs text-muted-foreground">{e.slug}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <Link href={`/admin/games/${e.gameSlug}/editions`} className="hover:underline font-semibold">
                        {gameTitle}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-foreground">
                        {e.type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-muted-foreground">
                        {e.installMethod}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          e.visibility === "public"
                            ? "bg-primary/10 text-primary"
                            : e.visibility === "unlisted"
                              ? "bg-amber-500/10 text-amber-500"
                              : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        {e.visibility}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/games/${e.gameSlug}/editions/${e.slug}/edit`}
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
