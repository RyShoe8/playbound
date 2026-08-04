import Link from "next/link";
import dbConnect from "@/lib/db";
import TelemetryEvent from "@/lib/models/TelemetryEvent";
import { SectionHeader, StatTile } from "@/components/ui/bits";

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return startOfDay(d);
}

function formatDuration(ms: number): string {
  if (!ms || ms < 0) return "—";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${totalSeconds}s`;
}

function formatTotalPlayTime(ms: number): string {
  if (!ms || ms < 0) return "0h";
  const totalHours = ms / (1000 * 60 * 60);
  if (totalHours >= 1) return `${totalHours.toFixed(1)}h`;
  const totalMinutes = ms / (1000 * 60);
  return `${Math.round(totalMinutes)}m`;
}

type SearchParams = Promise<{
  game?: string;
  from?: string;
  to?: string;
}>;

async function loadGameplayAnalytics(filters: {
  game?: string;
  from?: string;
  to?: string;
}) {
  await dbConnect();

  const d7 = daysAgo(7);
  const d14 = daysAgo(14);

  // Build the recent filter for the sessions table
  const recentFilter: Record<string, unknown> = {
    event: { $in: ["game_started", "game_finished"] },
  };
  if (filters.game) {
    recentFilter["properties.gameSlug"] = filters.game;
  }
  const createdAt: { $gte?: Date; $lte?: Date } = {};
  if (filters.from) {
    const d = new Date(filters.from);
    if (!Number.isNaN(d.getTime())) createdAt.$gte = d;
  }
  if (filters.to) {
    const d = new Date(filters.to);
    if (!Number.isNaN(d.getTime())) createdAt.$lte = d;
  }
  if (Object.keys(createdAt).length) recentFilter.createdAt = createdAt;

  const [
    totalSessions7d,
    totalPlayTimeAgg,
    uniquePlayers7d,
    topGamesByTime,
    topGamesBySessions,
    dailySessions,
    recentEvents,
  ] = await Promise.all([
    // Total game_started events in last 7 days
    TelemetryEvent.countDocuments({
      event: "game_started",
      createdAt: { $gte: d7 },
    }),

    // Total play time from game_finished events (sum durationMs)
    TelemetryEvent.aggregate<{ _id: null; totalMs: number; count: number; avgMs: number }>([
      {
        $match: {
          event: "game_finished",
          createdAt: { $gte: d7 },
          "properties.durationMs": { $exists: true, $gt: 0 },
        },
      },
      {
        $group: {
          _id: null,
          totalMs: { $sum: "$properties.durationMs" },
          count: { $sum: 1 },
          avgMs: { $avg: "$properties.durationMs" },
        },
      },
    ]),

    // Unique players (by userId or sessionId)
    TelemetryEvent.aggregate<{ _id: null; count: number }>([
      {
        $match: {
          event: "game_started",
          createdAt: { $gte: d7 },
        },
      },
      {
        $group: {
          _id: {
            $ifNull: [
              { $cond: [{ $eq: ["$userId", null] }, "$sessionId", "$userId"] },
              "$sessionId",
            ],
          },
        },
      },
      { $count: "count" },
    ]),

    // Top games by play time
    TelemetryEvent.aggregate<{
      _id: string;
      title: string;
      totalMs: number;
      sessions: number;
      avgMs: number;
      players: number;
    }>([
      {
        $match: {
          event: "game_finished",
          createdAt: { $gte: d7 },
          "properties.durationMs": { $exists: true, $gt: 0 },
          "properties.gameSlug": { $exists: true },
        },
      },
      {
        $group: {
          _id: "$properties.gameSlug",
          title: { $first: "$properties.gameTitle" },
          totalMs: { $sum: "$properties.durationMs" },
          sessions: { $sum: 1 },
          avgMs: { $avg: "$properties.durationMs" },
          players: {
            $addToSet: {
              $ifNull: [
                { $cond: [{ $eq: ["$userId", null] }, "$sessionId", "$userId"] },
                "$sessionId",
              ],
            },
          },
        },
      },
      { $addFields: { players: { $size: "$players" } } },
      { $sort: { totalMs: -1 } },
      { $limit: 15 },
    ]),

    // Top games by session count (from game_started)
    TelemetryEvent.aggregate<{
      _id: string;
      title: string;
      sessions: number;
      players: number;
    }>([
      {
        $match: {
          event: "game_started",
          createdAt: { $gte: d7 },
          "properties.gameSlug": { $exists: true },
        },
      },
      {
        $group: {
          _id: "$properties.gameSlug",
          title: { $first: "$properties.gameTitle" },
          sessions: { $sum: 1 },
          players: {
            $addToSet: {
              $ifNull: [
                { $cond: [{ $eq: ["$userId", null] }, "$sessionId", "$userId"] },
                "$sessionId",
              ],
            },
          },
        },
      },
      { $addFields: { players: { $size: "$players" } } },
      { $sort: { sessions: -1 } },
      { $limit: 15 },
    ]),

    // Daily play sessions (14 days)
    TelemetryEvent.aggregate<{ _id: string; count: number }>([
      {
        $match: {
          event: "game_started",
          createdAt: { $gte: d14 },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),

    // Recent events (game_started + game_finished)
    TelemetryEvent.find(recentFilter)
      .sort({ createdAt: -1 })
      .limit(40)
      .select("event userId sessionId country browser os device createdAt properties")
      .lean(),
  ]);

  const playTimeData = totalPlayTimeAgg[0] || { totalMs: 0, count: 0, avgMs: 0 };
  const uniquePlayersCount = uniquePlayers7d[0]?.count || 0;

  return {
    totalSessions7d,
    totalPlayTimeMs: playTimeData.totalMs,
    avgSessionMs: playTimeData.avgMs,
    uniquePlayers7d: uniquePlayersCount,
    topGamesByTime,
    topGamesBySessions,
    dailySessions,
    recentEvents,
  };
}

export default async function GameplayAnalyticsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  let data: Awaited<ReturnType<typeof loadGameplayAnalytics>> | null = null;
  let loadError = false;

  try {
    data = await loadGameplayAnalytics({
      game: sp.game,
      from: sp.from,
      to: sp.to,
    });
  } catch (err) {
    console.error("Failed to load gameplay analytics", err);
    loadError = true;
  }

  const maxDaily = Math.max(
    1,
    ...(data?.dailySessions.map((d) => d.count) || [1])
  );

  return (
    <div className="space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Gameplay</h1>
        <p className="mt-1 text-muted-foreground">
          Play sessions tracked via <code className="text-xs">game_started</code> /{" "}
          <code className="text-xs">game_finished</code> telemetry events.
        </p>
      </div>

      {loadError || !data ? (
        <p className="text-sm text-muted-foreground">
          Could not load gameplay data. Check the database connection.
        </p>
      ) : (
        <>
          {/* ── Summary tiles ─────────────────────────────────────────── */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Play sessions (7d)"
              value={String(data.totalSessions7d)}
            />
            <StatTile
              label="Total play time (7d)"
              value={formatTotalPlayTime(data.totalPlayTimeMs)}
            />
            <StatTile
              label="Avg session"
              value={formatDuration(data.avgSessionMs)}
            />
            <StatTile
              label="Unique players (7d)"
              value={String(data.uniquePlayers7d)}
            />
          </div>

          {/* ── Daily play sessions chart ──────────────────────────────── */}
          <section>
            <SectionHeader
              title="Daily play sessions"
              subtitle="Last 14 days"
            />
            {data.dailySessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No play sessions recorded yet.
              </p>
            ) : (
              <ul className="space-y-2 rounded-xl border border-border bg-card p-4">
                {data.dailySessions.map((day) => (
                  <li
                    key={day._id}
                    className="flex items-center gap-3 text-sm"
                  >
                    <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">
                      {day._id}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-play"
                        style={{
                          width: `${Math.max(4, (day.count / maxDaily) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="w-12 shrink-0 text-right font-semibold">
                      {day.count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── Top games by play time ─────────────────────────────────── */}
          <section>
            <SectionHeader
              title="Top games by play time"
              subtitle="Last 7 days"
            />
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="bg-secondary/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Game</th>
                    <th className="px-4 py-3 font-semibold">Sessions</th>
                    <th className="px-4 py-3 font-semibold">Total Time</th>
                    <th className="px-4 py-3 font-semibold">Avg Duration</th>
                    <th className="px-4 py-3 font-semibold">Players</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topGamesByTime.length === 0 ? (
                    <tr className="bg-card">
                      <td
                        colSpan={5}
                        className="px-4 py-6 text-muted-foreground"
                      >
                        No gameplay data in the last 7 days.
                      </td>
                    </tr>
                  ) : (
                    data.topGamesByTime.map((row) => (
                      <tr
                        key={row._id}
                        className="border-t border-border bg-card"
                      >
                        <td className="px-4 py-2.5">
                          <Link
                            href={`/admin/analytics/gameplay?game=${encodeURIComponent(row._id)}`}
                            className="font-semibold text-primary hover:underline"
                          >
                            {row.title || row._id}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 font-mono">
                          {row.sessions}
                        </td>
                        <td className="px-4 py-2.5 font-mono">
                          {formatTotalPlayTime(row.totalMs)}
                        </td>
                        <td className="px-4 py-2.5 font-mono">
                          {formatDuration(row.avgMs)}
                        </td>
                        <td className="px-4 py-2.5 font-mono">
                          {row.players}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Top games by session count ─────────────────────────────── */}
          <section>
            <SectionHeader
              title="Top games by sessions"
              subtitle="Last 7 days"
            />
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead className="bg-secondary/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Game</th>
                    <th className="px-4 py-3 font-semibold">Sessions</th>
                    <th className="px-4 py-3 font-semibold">Players</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topGamesBySessions.length === 0 ? (
                    <tr className="bg-card">
                      <td
                        colSpan={3}
                        className="px-4 py-6 text-muted-foreground"
                      >
                        No gameplay data in the last 7 days.
                      </td>
                    </tr>
                  ) : (
                    data.topGamesBySessions.map((row) => (
                      <tr
                        key={row._id}
                        className="border-t border-border bg-card"
                      >
                        <td className="px-4 py-2.5">
                          <Link
                            href={`/admin/analytics/gameplay?game=${encodeURIComponent(row._id)}`}
                            className="font-semibold text-primary hover:underline"
                          >
                            {row.title || row._id}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 font-mono">
                          {row.sessions}
                        </td>
                        <td className="px-4 py-2.5 font-mono">
                          {row.players}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Recent sessions ────────────────────────────────────────── */}
          <section>
            <SectionHeader
              title="Recent sessions"
              subtitle={
                sp.game
                  ? `Filtered to ${sp.game}`
                  : "Latest 40 events"
              }
            />
            <form
              action="/admin/analytics/gameplay"
              method="get"
              className="mb-4 flex flex-wrap items-end gap-3"
            >
              <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
                Game slug
                <input
                  name="game"
                  defaultValue={sp.game || ""}
                  placeholder="openra"
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
                From
                <input
                  name="from"
                  type="date"
                  defaultValue={sp.from || ""}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
                To
                <input
                  name="to"
                  type="date"
                  defaultValue={sp.to || ""}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </label>
              <button
                type="submit"
                className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
              >
                Filter
              </button>
              {(sp.game || sp.from || sp.to) && (
                <Link
                  href="/admin/analytics/gameplay"
                  className="rounded-full border border-border bg-secondary px-4 py-2 text-sm font-bold"
                >
                  Clear
                </Link>
              )}
            </form>

            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-secondary/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-semibold">When</th>
                    <th className="px-4 py-3 font-semibold">Event</th>
                    <th className="px-4 py-3 font-semibold">Game</th>
                    <th className="px-4 py-3 font-semibold">Duration</th>
                    <th className="px-4 py-3 font-semibold">Platform</th>
                    <th className="px-4 py-3 font-semibold">Player</th>
                    <th className="px-4 py-3 font-semibold">Country</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentEvents.length === 0 ? (
                    <tr className="bg-card">
                      <td
                        colSpan={7}
                        className="px-4 py-6 text-muted-foreground"
                      >
                        No matching events.
                      </td>
                    </tr>
                  ) : (
                    data.recentEvents.map((doc) => {
                      const props = (doc.properties || {}) as Record<string, unknown>;
                      return (
                        <tr
                          key={String(doc._id)}
                          className="border-t border-border bg-card"
                        >
                          <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-muted-foreground">
                            {doc.createdAt
                              ? new Date(doc.createdAt).toLocaleString()
                              : "—"}
                          </td>
                          <td className="px-4 py-2.5">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                doc.event === "game_started"
                                  ? "bg-play/15 text-play"
                                  : "bg-primary/15 text-primary"
                              }`}
                            >
                              {doc.event === "game_started" ? "Started" : "Finished"}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 font-semibold">
                            {(props.gameTitle as string) ||
                              (props.gameSlug as string) ||
                              "—"}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-xs">
                            {doc.event === "game_finished" &&
                            typeof props.durationMs === "number"
                              ? formatDuration(props.durationMs)
                              : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground">
                            {(props.platform as string) || "—"}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-xs">
                            {doc.userId || "—"}
                          </td>
                          <td className="px-4 py-2.5">
                            {doc.country || "—"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
