import Link from "next/link";
import type { Metadata } from "next";
import { BookOpen, CheckCircle2, HelpCircle, MessagesSquare, Star, Users } from "lucide-react";
import dbConnect from "@/lib/db";
import Review from "@/lib/models/Review";
import GuidePost from "@/lib/models/GuidePost";
import DiscussionTopic from "@/lib/models/DiscussionTopic";
import { getGame } from "@/lib/catalog";
import { listDiscoverableGames } from "@/lib/access/discover";
import { viewerCanSeeTesting } from "@/lib/requestIncludesTesting";
import { EmptyHint, SectionHeader } from "@/components/ui/bits";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Community",
  description:
    "Guides, discussion and reviews from players of the free games in the PlayBound catalog.",
  path: "/community",
});

interface Activity {
  kind: "review" | "guide" | "discussion";
  gameSlug: string;
  username: string;
  title: string;
  createdAt: Date;
  href: string;
}

async function getRecentActivity(): Promise<Activity[]> {
  try {
    await dbConnect();
    const [reviews, guides, topics] = await Promise.all([
      Review.find().sort({ createdAt: -1 }).limit(10).lean(),
      GuidePost.find().sort({ createdAt: -1 }).limit(10).lean(),
      DiscussionTopic.find({ status: { $ne: "removed" } })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
    ]);
    const combined: Activity[] = [
      ...reviews.map((r) => ({
        kind: "review" as const,
        gameSlug: r.gameSlug,
        username: r.username,
        title: r.title,
        createdAt: r.createdAt,
        href: `/games/${r.gameSlug}?tab=reviews`,
      })),
      ...guides.map((g) => ({
        kind: "guide" as const,
        gameSlug: g.gameSlug,
        username: g.username,
        title: g.title,
        createdAt: g.createdAt,
        href: `/games/${g.gameSlug}?tab=guides`,
      })),
      ...topics.map((p) => ({
        kind: "discussion" as const,
        gameSlug: p.gameSlug,
        username: p.authorUsername,
        title: p.title,
        createdAt: p.createdAt,
        href: `/games/${p.gameSlug}/discussion/${p.slug}`,
      })),
    ];
    return combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 20);
  } catch (err) {
    console.error("Failed to load community activity:", err);
    return [];
  }
}

const kindIcon = { review: Star, guide: BookOpen, discussion: MessagesSquare };
const kindLabel = { review: "reviewed", guide: "published a guide for", discussion: "started a discussion on" };

export default async function CommunityPage() {
  const includeTesting = await viewerCanSeeTesting();
  const activity = await getRecentActivity();
  const rows = await Promise.all(
    activity.map(async (a) => ({
      a,
      game: await getGame(a.gameSlug, { includeTesting }),
    }))
  );

  let unanswered: { title: string; gameSlug: string; slug: string }[] = [];
  let solved: { title: string; gameSlug: string; slug: string }[] = [];
  let activeGames: { slug: string; title: string; count: number }[] = [];

  try {
    await dbConnect();
    const [u, s, agg] = await Promise.all([
      DiscussionTopic.find({
        status: { $ne: "removed" },
        replyCount: 0,
        isSolved: false,
      })
        .sort({ createdAt: -1 })
        .limit(8)
        .lean(),
      DiscussionTopic.find({ status: { $ne: "removed" }, isSolved: true })
        .sort({ updatedAt: -1 })
        .limit(8)
        .lean(),
      DiscussionTopic.aggregate<{ _id: string; count: number }>([
        { $match: { status: { $ne: "removed" } } },
        { $group: { _id: "$gameSlug", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 8 },
      ]),
    ]);
    unanswered = u.map((t) => ({ title: t.title, gameSlug: t.gameSlug, slug: t.slug }));
    solved = s.map((t) => ({ title: t.title, gameSlug: t.gameSlug, slug: t.slug }));
    const games = await listDiscoverableGames({ includeTesting });
    const bySlug = new Map(games.map((g) => [g.slug, g.title]));
    activeGames = agg
      .map((a) => ({
        slug: a._id,
        title: bySlug.get(a._id) ?? a._id,
        count: a.count,
      }))
      .filter((g) => bySlug.has(g.slug));
  } catch {
    /* ignore */
  }

  return (
    <div className="space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Community</h1>
        <p className="mt-1 text-muted-foreground">
          Reviews, guides, and discussions from real PlayBound players — centered around games.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <SectionHeader
            title="Recent Activity"
            subtitle="Live from reviews, guides, and discussions across the platform"
          />
          {rows.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-border">
              {rows.map(({ a, game }, i) => {
                const Icon = kindIcon[a.kind];
                return (
                  <div
                    key={i}
                    className={`flex items-center gap-3 bg-card px-4 py-3 ${i > 0 ? "border-t border-border" : ""}`}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary">
                      <Icon className="size-4 text-primary" />
                    </span>
                    <p className="min-w-0 flex-1 truncate text-sm">
                      <span className="font-semibold">{a.username}</span> {kindLabel[a.kind]}{" "}
                      {game ? (
                        <Link href={a.href} className="font-semibold hover:underline">
                          {game.title}
                        </Link>
                      ) : (
                        a.gameSlug
                      )}
                      : &ldquo;{a.title}&rdquo;
                    </p>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {new Date(a.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyHint icon={Users}>
              Nothing posted yet. Visit any game page and write the first review, guide, or discussion
              thread — it&apos;ll show up here.
            </EmptyHint>
          )}
        </section>

        <aside className="space-y-6">
          <section>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-bold">
              <HelpCircle className="size-4" /> Unanswered questions
            </h2>
            <ul className="space-y-1.5 text-sm">
              {unanswered.map((t) => (
                <li key={`${t.gameSlug}-${t.slug}`}>
                  <Link
                    href={`/games/${t.gameSlug}/discussion/${t.slug}`}
                    className="text-muted-foreground hover:text-primary hover:underline"
                  >
                    {t.title}
                  </Link>
                </li>
              ))}
              {unanswered.length === 0 && (
                <li className="text-xs text-muted-foreground">None right now.</li>
              )}
            </ul>
          </section>
          <section>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-bold">
              <CheckCircle2 className="size-4 text-emerald-600" /> Recently solved
            </h2>
            <ul className="space-y-1.5 text-sm">
              {solved.map((t) => (
                <li key={`${t.gameSlug}-${t.slug}`}>
                  <Link
                    href={`/games/${t.gameSlug}/discussion/${t.slug}`}
                    className="text-muted-foreground hover:text-primary hover:underline"
                  >
                    {t.title}
                  </Link>
                </li>
              ))}
              {solved.length === 0 && (
                <li className="text-xs text-muted-foreground">None yet.</li>
              )}
            </ul>
          </section>
          <section>
            <h2 className="mb-2 text-sm font-bold">Active games</h2>
            <ul className="space-y-1.5 text-sm">
              {activeGames.map((g) => (
                <li key={g.slug}>
                  <Link
                    href={`/games/${g.slug}?tab=discussion`}
                    className="font-medium hover:text-primary hover:underline"
                  >
                    {g.title}
                  </Link>
                  <span className="text-xs text-muted-foreground"> · {g.count}</span>
                </li>
              ))}
            </ul>
          </section>
          <p className="text-xs text-muted-foreground">
            <Link href="/standards" className="font-semibold text-primary hover:underline">
              Community guidelines
            </Link>{" "}
            — be kind, search before posting, and bring durable answers back from Discord.
          </p>
        </aside>
      </div>
    </div>
  );
}
