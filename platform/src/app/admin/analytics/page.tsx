import Link from "next/link";
import { connection } from "next/server";
import dbConnect from "@/lib/db";
import TelemetryEvent from "@/lib/models/TelemetryEvent";
import User from "@/lib/models/User";
import { Types } from "mongoose";
import { SectionHeader, StatTile } from "@/components/ui/bits";
import { LocalTime } from "@/components/LocalTime";

type SearchParams = Promise<{
  event?: string;
  from?: string;
  to?: string;
  includeBots?: string;
}>;

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

interface TelemetryDoc {
  _id: unknown;
  event: string;
  userId?: string | null;
  username?: string | null;
  sessionId?: string | null;
  url?: string | null;
  country?: string | null;
  browser?: string | null;
  os?: string | null;
  device?: string | null;
  isBot?: boolean;
  createdAt?: Date | string | null;
  properties?: Record<string, unknown>;
}

async function loadAnalytics(filters: {
  event?: string;
  from?: string;
  to?: string;
  includeBots?: boolean;
}) {
  await dbConnect();

  const now = new Date();
  const today = startOfDay(now);
  const yesterday = daysAgo(1);
  const d7 = daysAgo(7);
  const d14 = daysAgo(14);
  const d30 = daysAgo(30);
  const d60 = daysAgo(60);

  const botCondition = filters.includeBots ? {} : { isBot: { $ne: true } };
  const recentFilter: Record<string, unknown> = { ...botCondition };
  if (filters.event) recentFilter.event = filters.event;
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
    eventsToday,
    events7d,
    events30d,
    uniqueSessions7d,
    identifiedUsers7d,
    topEvents,
    dailyVolume,
    recent,
    eventsTodayPrev,
    events7dPrev,
    events30dPrev,
    uniqueSessions7dPrev,
    identifiedUsers7dPrev,
  ] = await Promise.all([
    TelemetryEvent.countDocuments({ ...botCondition, createdAt: { $gte: today } }),
    TelemetryEvent.countDocuments({ ...botCondition, createdAt: { $gte: d7 } }),
    TelemetryEvent.countDocuments({ ...botCondition, createdAt: { $gte: d30 } }),
    TelemetryEvent.distinct("sessionId", {
      ...botCondition,
      createdAt: { $gte: d7 },
      sessionId: { $nin: [null, ""] },
    }).then((ids) => ids.length),
    TelemetryEvent.distinct("userId", {
      ...botCondition,
      createdAt: { $gte: d7 },
      userId: { $nin: [null, ""] },
    }).then((ids) => ids.length),
    TelemetryEvent.aggregate<{ _id: string; count: number }>([
      { $match: { ...botCondition, createdAt: { $gte: d7 } } },
      { $group: { _id: "$event", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 15 },
    ]),
    TelemetryEvent.aggregate<{ _id: string; count: number }>([
      { $match: { ...botCondition, createdAt: { $gte: d14 } } },
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
    TelemetryEvent.find(recentFilter)
      .sort({ createdAt: -1 })
      .limit(40)
      .select("event userId sessionId url country browser os device isBot createdAt properties")
      .lean(),
    TelemetryEvent.countDocuments({ ...botCondition, createdAt: { $gte: yesterday, $lt: today } }),
    TelemetryEvent.countDocuments({ ...botCondition, createdAt: { $gte: d14, $lt: d7 } }),
    TelemetryEvent.countDocuments({ createdAt: { $gte: d60, $lt: d30 } }),
    TelemetryEvent.distinct("sessionId", {
      createdAt: { $gte: d14, $lt: d7 },
      sessionId: { $nin: [null, ""] },
    }).then((ids) => ids.length),
    TelemetryEvent.distinct("userId", {
      createdAt: { $gte: d14, $lt: d7 },
      userId: { $nin: [null, ""] },
    }).then((ids) => ids.length),
  ]);

  const uniqueUserIds = Array.from(new Set(recent.map((doc: any) => doc.userId).filter(Boolean)))
    .filter((id: any) => typeof id === "string" && Types.ObjectId.isValid(id));
  const users = await User.find({ _id: { $in: uniqueUserIds } }).select("username").lean();
  const usernameMap = new Map(users.map((u: any) => [String(u._id), u.username]));

  const recentWithUsernames = recent.map((doc: any) => ({
    ...doc,
    username: doc.userId ? usernameMap.get(doc.userId) || null : null
  }));

  return {
    eventsToday,
    events7d,
    events30d,
    uniqueSessions7d,
    identifiedUsers7d,
    topEvents,
    dailyVolume,
    recent: recentWithUsernames,
    eventsTodayPrev,
    events7dPrev,
    events30dPrev,
    uniqueSessions7dPrev,
    identifiedUsers7dPrev,
  };
}

function pathFromEvent(doc: {
  url?: string | null;
  properties?: Record<string, unknown> | null;
}): string {
  const props = doc.properties || {};
  if (typeof props.path === "string") return props.path;
  if (doc.url) {
    try {
      const u = new URL(doc.url);
      return `${u.pathname}${u.search}`;
    } catch {
      return doc.url;
    }
  }
  return "—";
}

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // Never prerendered — see the layout. Each segment prerenders
  // independently, so the layout's opt-out does not cover this page.
  await connection();
  const sp = await searchParams;
  let data: Awaited<ReturnType<typeof loadAnalytics>> | null = null;
  let loadError = false;

  try {
    data = await loadAnalytics({
      event: sp.event,
      from: sp.from,
      to: sp.to,
      includeBots: Boolean(sp.includeBots),
    });
  } catch (err) {
    console.error("Failed to load telemetry analytics", err);
    loadError = true;
  }

  const maxDaily = Math.max(1, ...(data?.dailyVolume.map((d) => d.count) || [1]));

  return (
    <div className="space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Analytics</h1>
        <p className="mt-1 text-muted-foreground">
          Product telemetry stored in MongoDB via the Telemetry SDK.
        </p>
      </div>

      {loadError || !data ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">
          Could not load analytics. Make sure MongoDB is reachable.
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <StatTile
              label="Events today"
              value={String(data.eventsToday)}
              trend={{ value: data.eventsTodayPrev, label: "yesterday" }}
            />
            <StatTile
              label="Events (7d)"
              value={String(data.events7d)}
              trend={{ value: data.events7dPrev }}
            />
            <StatTile
              label="Events (30d)"
              value={String(data.events30d)}
              trend={{ value: data.events30dPrev }}
            />
            <StatTile
              label="Sessions (7d)"
              value={String(data.uniqueSessions7d)}
              trend={{ value: data.uniqueSessions7dPrev }}
            />
            <StatTile
              label="Users (7d)"
              value={String(data.identifiedUsers7d)}
              hint="Identified only"
              trend={{ value: data.identifiedUsers7dPrev }}
            />
          </div>

          <section>
            <SectionHeader
              title="Daily volume"
              subtitle="Events over the last 14 days"
            />
            {data.dailyVolume.length === 0 ? (
              <p className="text-sm text-muted-foreground">No volume data.</p>
            ) : (
              <ul className="space-y-2">
                {data.dailyVolume.map((day) => (
                  <li
                    key={day._id}
                    className="flex items-center gap-3 text-sm"
                  >
                    <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">
                      {day._id}
                    </span>
                    <div className="h-4 flex-1 rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary"
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

          <section>
            <SectionHeader title="Top events" subtitle="Last 7 days" />
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[320px] text-left text-sm">
                <thead className="bg-secondary/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Event</th>
                    <th className="px-4 py-3 font-semibold">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topEvents.length === 0 ? (
                    <tr className="bg-card">
                      <td
                        colSpan={2}
                        className="px-4 py-6 text-muted-foreground"
                      >
                        No events in the last 7 days.
                      </td>
                    </tr>
                  ) : (
                    data.topEvents.map((row) => (
                      <tr
                        key={row._id}
                        className="border-t border-border bg-card"
                      >
                        <td className="px-4 py-2.5">
                          <Link
                            href={`/admin/analytics?event=${encodeURIComponent(row._id)}`}
                            className="font-semibold text-primary hover:underline"
                          >
                            {row._id}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 font-mono">{row.count}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <SectionHeader
              title="Recent events"
              subtitle={
                sp.event
                  ? `Filtered to ${sp.event}`
                  : sp.includeBots
                    ? "Latest 40 events (including bots)"
                    : "Latest 40 events (excluding bots)"
              }
            />
            <form
              action="/admin/analytics"
              method="get"
              className="mb-4 flex flex-wrap items-end gap-3"
            >
              <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
                Event
                <input
                  name="event"
                  defaultValue={sp.event || ""}
                  placeholder="page_view"
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
              <label className="flex items-center gap-1.5 pb-2 text-xs font-semibold text-muted-foreground cursor-pointer select-none">
                <input
                  name="includeBots"
                  type="checkbox"
                  value="1"
                  defaultChecked={Boolean(sp.includeBots)}
                  className="rounded border-border"
                />
                Include bots
              </label>
              <button
                type="submit"
                className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
              >
                Filter
              </button>
              {(sp.event || sp.from || sp.to || sp.includeBots) && (
                <Link
                  href="/admin/analytics"
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
                    <th className="px-4 py-3 font-semibold">Path</th>
                    <th className="px-4 py-3 font-semibold">User</th>
                    <th className="px-4 py-3 font-semibold">Country</th>
                    <th className="px-4 py-3 font-semibold">Client</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.length === 0 ? (
                    <tr className="bg-card">
                      <td
                        colSpan={6}
                        className="px-4 py-6 text-muted-foreground"
                      >
                        No matching events.
                      </td>
                    </tr>
                  ) : (
                    data.recent.map((doc) => (
                      <tr
                        key={String(doc._id)}
                        className="border-t border-border bg-card"
                      >
                        <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground whitespace-nowrap">
                          <LocalTime
                            value={
                              doc.createdAt
                                ? new Date(doc.createdAt).toISOString()
                                : null
                            }
                          />
                        </td>
                        <td className="px-4 py-2.5 font-semibold">
                          {doc.event}
                        </td>
                        <td className="max-w-[220px] truncate px-4 py-2.5 text-muted-foreground">
                          {pathFromEvent(doc)}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs">
                          {doc.username || doc.userId || "—"}
                        </td>
                        <td className="px-4 py-2.5">{doc.country || "—"}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            {[doc.browser, doc.os, doc.device]
                              .filter(Boolean)
                              .join(" · ") || "—"}
                            {doc.isBot && (
                              <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-500 uppercase tracking-wide">
                                Bot
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
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
