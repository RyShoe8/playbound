"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import {
  Clock,
  Crown,
  Gamepad2,
  History,
  Loader2,
  RefreshCw,
  Search,
  User as UserIcon,
  Users,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { LocalTime } from "@/components/LocalTime";
import type {
  ConnectAdminPartyHistoryPayload,
  ConnectAdminPartyHistoryRow,
} from "@/lib/playTogether/adminPartyHistory";

export function ConnectPartyHistory() {
  const [data, setData] = useState<ConnectAdminPartyHistoryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [expandedParties, setExpandedParties] = useState<Record<string, boolean>>({});

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", "15");
        if (debouncedSearch) params.set("search", debouncedSearch);

        const res = await fetch(`/api/admin/connect/parties/history?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("Failed to load party history");
        const json = (await res.json()) as ConnectAdminPartyHistoryPayload;
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load party history");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [page, debouncedSearch]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const toggleExpand = (partyId: string) => {
    setExpandedParties((prev) => ({
      ...prev,
      [partyId]: !prev[partyId],
    }));
  };

  const summary = data?.summary;
  const parties = data?.parties ?? [];
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      {/* Section Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4 border-b border-border/50 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <History className="size-4" />
            </div>
            <h2 className="text-lg font-bold tracking-tight">Party history</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Past PlayBound parties — host, full roster, games played, and how long each player stayed.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={loading || refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-50 transition-colors"
            title="Refresh history"
          >
            <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      {summary ? (
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/50 p-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-sky-500/10 text-sky-400">
              <History className="size-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Completed parties</p>
              <p className="text-xl font-bold tabular-nums">{summary.totalEndedParties}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/50 p-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-400">
              <Clock className="size-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Average party length</p>
              <p className="text-xl font-bold tabular-nums">{summary.avgDurationFormatted}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/50 p-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-purple-500/10 text-purple-400">
              <Users className="size-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Unique participants</p>
              <p className="text-xl font-bold tabular-nums">{summary.totalUniquePlayers}</p>
            </div>
          </div>
        </div>
      ) : null}

      {/* Search Bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by host or party name…"
            className="w-full rounded-lg border border-border bg-background py-1.5 pl-9 pr-3 text-xs placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {data ? (
          <p className="text-xs text-muted-foreground">
            Showing <span className="font-semibold text-foreground">{parties.length}</span> of{" "}
            <span className="font-semibold text-foreground">{data.total}</span> total sessions
          </p>
        ) : null}
      </div>

      {/* Error state */}
      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
          {error}
        </div>
      ) : null}

      {/* Loading state */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="size-6 animate-spin mb-2" />
          <p className="text-xs">Loading party history…</p>
        </div>
      ) : parties.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-12 text-center">
          <History className="mx-auto size-8 text-muted-foreground/50 mb-2" />
          <p className="text-sm font-medium text-muted-foreground">No party history found</p>
          <p className="mt-1 text-xs text-muted-foreground/80">
            {debouncedSearch
              ? "No past party sessions match your search."
              : "Completed parties will appear here once players finish their sessions."}
          </p>
        </div>
      ) : (
        /* History Table */
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1020px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground text-xs font-semibold">
                <th className="pb-2.5 pr-4">Party & Host</th>
                <th className="pb-2.5 pr-4">Total People</th>
                <th className="pb-2.5 pr-4">Party Roster & Member Duration</th>
                <th className="pb-2.5 pr-4">Games Played</th>
                <th className="pb-2.5 pr-4">Party Duration</th>
                <th className="pb-2.5">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {parties.map((party) => {
                const isExpanded = Boolean(expandedParties[party.id]);
                const displayedMembers = isExpanded
                  ? party.members
                  : party.members.slice(0, 3);
                const hasMoreMembers = party.members.length > 3;

                return (
                  <tr key={party.id} className="align-top hover:bg-muted/20 transition-colors">
                    {/* Party & Host */}
                    <td className="py-3 pr-4 max-w-[220px]">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground truncate">{party.name}</p>
                          <div className="mt-1 flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-400 border border-amber-500/20">
                              <Crown className="size-3 shrink-0" />
                              <span className="truncate max-w-[110px]">{party.host.username}</span>
                            </span>
                          </div>
                          <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                            ID: {party.id.slice(-8)}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Total People */}
                    <td className="py-3 pr-4 tabular-nums">
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-secondary/60 px-2.5 py-1 text-xs font-semibold">
                        <Users className="size-3.5 text-muted-foreground" />
                        {party.totalPeople} {party.totalPeople === 1 ? "player" : "players"}
                      </span>
                    </td>

                    {/* Members & Duration in party */}
                    <td className="py-3 pr-4 max-w-[340px]">
                      <div className="flex flex-wrap gap-1.5">
                        {displayedMembers.map((member) => (
                          <div
                            key={member.userId}
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs transition-colors ${
                              member.isHost
                                ? "border-amber-500/30 bg-amber-500/5 text-foreground"
                                : "border-border/70 bg-background/60 text-foreground/90"
                            }`}
                          >
                            <div className="flex size-4 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-bold">
                              {member.isHost ? (
                                <Crown className="size-2.5 text-amber-400" />
                              ) : (
                                <UserIcon className="size-2.5 text-muted-foreground" />
                              )}
                            </div>
                            <span className="font-medium truncate max-w-[100px]" title={member.username}>
                              {member.username}
                            </span>
                            <span
                              className="rounded bg-secondary/80 px-1 py-0.5 font-mono text-[10px] text-muted-foreground"
                              title={`In party for ${member.durationFormatted}`}
                            >
                              {member.durationFormatted}
                            </span>
                          </div>
                        ))}
                      </div>

                      {hasMoreMembers && (
                        <button
                          type="button"
                          onClick={() => toggleExpand(party.id)}
                          className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                        >
                          {isExpanded ? (
                            <>
                              Show fewer <ChevronUp className="size-3" />
                            </>
                          ) : (
                            <>
                              +{party.members.length - 3} more participants{" "}
                              <ChevronDown className="size-3" />
                            </>
                          )}
                        </button>
                      )}
                    </td>

                    {/* Games Played */}
                    <td className="py-3 pr-4 max-w-[200px]">
                      {party.gamesPlayed.length === 0 ? (
                        <span className="text-xs text-muted-foreground italic">None declared</span>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          {party.gamesPlayed.map((game) => (
                            <div
                              key={game.slug}
                              className="flex items-center gap-2 rounded-md border border-border/50 bg-background/50 px-2 py-1"
                            >
                              {game.coverUrl ? (
                                <div className="relative size-6 shrink-0 overflow-hidden rounded">
                                  <Image
                                    src={game.coverUrl}
                                    alt={game.title}
                                    fill
                                    sizes="24px"
                                    className="object-cover"
                                  />
                                </div>
                              ) : (
                                <div className="flex size-6 shrink-0 items-center justify-center rounded bg-secondary text-muted-foreground">
                                  <Gamepad2 className="size-3.5" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="truncate text-xs font-medium" title={game.title}>
                                  {game.title}
                                </p>
                                <p className="truncate font-mono text-[10px] text-muted-foreground">
                                  {game.slug}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>

                    {/* Party Overall Duration */}
                    <td className="py-3 pr-4">
                      <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
                        <Clock className="size-3.5" />
                        <span className="tabular-nums">{party.durationFormatted}</span>
                      </div>
                    </td>

                    {/* When (Dates) */}
                    <td className="py-3 text-xs text-muted-foreground">
                      <div>
                        <span className="text-[11px] block font-medium text-foreground/80">Ended</span>
                        <LocalTime value={party.endedAt} />
                      </div>
                      <div className="mt-1 text-[11px]">
                        <span className="text-muted-foreground/60">Started: </span>
                        <LocalTime value={party.startedAt} mode="date" />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Footer */}
      {!loading && parties.length > 0 && totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-3 text-xs text-muted-foreground">
          <p>
            Page <span className="font-semibold text-foreground">{page}</span> of{" "}
            <span className="font-semibold text-foreground">{totalPages}</span>
          </p>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 font-medium hover:bg-secondary disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="size-3.5" /> Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 font-medium hover:bg-secondary disabled:opacity-40 transition-colors"
            >
              Next <ChevronRight className="size-3.5" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
