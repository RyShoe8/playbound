import dbConnect from "@/lib/db";
import { connection } from "next/server";
import GuidePost from "@/lib/models/GuidePost";
import DiscussionTopic from "@/lib/models/DiscussionTopic";
import TelemetryEvent from "@/lib/models/TelemetryEvent";
import { PeriodStatTile, SectionHeader, StatTile } from "@/components/ui/bits";
import { daysAgo, periodTelemetryCounts } from "@/lib/admin/analyticsPeriods";

async function loadContentAnalytics() {
  await dbConnect();
  const d7 = daysAgo(7);

  const [
    guidesTotal,
    postsTotal,
    pageViews,
    guideViews,
    discussionsCreated,
    topPaths,
    topGuides,
  ] = await Promise.all([
    GuidePost.countDocuments(),
    DiscussionTopic.countDocuments({ status: { $ne: "removed" } }),
    periodTelemetryCounts(TelemetryEvent, "page_view"),
    periodTelemetryCounts(TelemetryEvent, "guide_viewed"),
    periodTelemetryCounts(TelemetryEvent, "discussion_created"),
    TelemetryEvent.aggregate<{ _id: string; count: number }>([
      {
        $match: {
          event: "page_view",
          createdAt: { $gte: d7 },
        },
      },
      {
        $project: {
          path: {
            $let: {
              vars: {
                propPath: "$properties.path",
                url: { $ifNull: ["$url", ""] },
              },
              in: {
                $cond: [
                  {
                    $and: [
                      { $ne: ["$$propPath", null] },
                      { $ne: ["$$propPath", ""] },
                    ],
                  },
                  "$$propPath",
                  {
                    $cond: [{ $eq: ["$$url", ""] }, "—", "$$url"],
                  },
                ],
              },
            },
          },
        },
      },
      { $group: { _id: "$path", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 15 },
    ]),
    TelemetryEvent.aggregate<{
      _id: string;
      guideId: string | null;
      gameSlug: string | null;
      count: number;
    }>([
      {
        $match: {
          event: "guide_viewed",
          createdAt: { $gte: d7 },
        },
      },
      {
        $group: {
          _id: {
            $ifNull: [
              "$properties.guideId",
              { $ifNull: ["$properties.gameSlug", "unknown"] },
            ],
          },
          guideId: { $first: "$properties.guideId" },
          gameSlug: { $first: "$properties.gameSlug" },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 15 },
    ]),
  ]);

  return {
    guidesTotal,
    postsTotal,
    pageViews,
    guideViews,
    discussionsCreated,
    topPaths,
    topGuides,
  };
}

export default async function ContentAnalyticsPage() {
  // Never prerendered — see the layout. Each segment prerenders
  // independently, so the layout's opt-out does not cover this page.
  await connection();
  let data: Awaited<ReturnType<typeof loadContentAnalytics>> | null = null;
  let loadError = false;

  try {
    data = await loadContentAnalytics();
  } catch (err) {
    console.error("Failed to load content analytics", err);
    loadError = true;
  }

  const maxPath = Math.max(1, ...(data?.topPaths.map((d) => d.count) || [1]));
  const maxGuide = Math.max(1, ...(data?.topGuides.map((d) => d.count) || [1]));

  return (
    <div className="space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Content</h1>
        <p className="mt-1 text-muted-foreground">
          Guides, discussion posts, and traffic from{" "}
          <code className="text-xs">page_view</code> /{" "}
          <code className="text-xs">guide_viewed</code>.
        </p>
      </div>

      {loadError || !data ? (
        <p className="text-sm text-muted-foreground">
          Could not load content analytics. Check the database connection.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Guides" value={String(data.guidesTotal)} />
            <StatTile
              label="Posts"
              value={String(data.postsTotal)}
              hint="Discussion topics"
              href="/admin/community"
            />
            <PeriodStatTile label="Page views" periods={data.pageViews} />
            <PeriodStatTile label="Guide views" periods={data.guideViews} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <PeriodStatTile
              label="Discussions created"
              hint="discussion_created events"
              periods={data.discussionsCreated}
            />
          </div>

          <section>
            <SectionHeader title="Top paths" subtitle="page_view · last 7 days" />
            {data.topPaths.length === 0 ? (
              <p className="text-sm text-muted-foreground">No page views yet.</p>
            ) : (
              <ul className="space-y-2 rounded-xl border border-border bg-card p-4">
                {data.topPaths.map((row) => (
                  <li key={row._id} className="flex items-center gap-3 text-sm">
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                      {row._id || "—"}
                    </span>
                    <div className="h-2 w-32 shrink-0 overflow-hidden rounded-full bg-secondary sm:w-48">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{
                          width: `${Math.max(4, (row.count / maxPath) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="w-10 shrink-0 text-right font-semibold">{row.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <SectionHeader title="Top guides" subtitle="guide_viewed · last 7 days" />
            {data.topGuides.length === 0 ? (
              <p className="text-sm text-muted-foreground">No guide views yet.</p>
            ) : (
              <ul className="space-y-2 rounded-xl border border-border bg-card p-4">
                {data.topGuides.map((row) => {
                  const label =
                    (typeof row.guideId === "string" && row.guideId) ||
                    (typeof row.gameSlug === "string" && `game:${row.gameSlug}`) ||
                    String(row._id);
                  return (
                    <li key={String(row._id)} className="flex items-center gap-3 text-sm">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
                      <div className="h-2 w-32 shrink-0 overflow-hidden rounded-full bg-secondary sm:w-48">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{
                            width: `${Math.max(4, (row.count / maxGuide) * 100)}%`,
                          }}
                        />
                      </div>
                      <span className="w-10 shrink-0 text-right font-semibold">{row.count}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
