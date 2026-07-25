import Link from "next/link";
import type { Metadata } from "next";
import { BookOpen, MessagesSquare, Star, Users } from "lucide-react";
import dbConnect from "@/lib/db";
import Review from "@/lib/models/Review";
import GuidePost from "@/lib/models/GuidePost";
import DiscussionPost from "@/lib/models/DiscussionPost";
import { getGame } from "@/lib/catalog";
import { EmptyHint, SectionHeader } from "@/components/ui/bits";

export const metadata: Metadata = { title: "Community" };

interface Activity {
  kind: "review" | "guide" | "discussion";
  gameSlug: string;
  username: string;
  title: string;
  createdAt: Date;
}

async function getRecentActivity(): Promise<Activity[]> {
  try {
    await dbConnect();
    const [reviews, guides, posts] = await Promise.all([
      Review.find().sort({ createdAt: -1 }).limit(10).lean(),
      GuidePost.find().sort({ createdAt: -1 }).limit(10).lean(),
      DiscussionPost.find().sort({ createdAt: -1 }).limit(10).lean(),
    ]);
    const combined: Activity[] = [
      ...reviews.map((r) => ({ kind: "review" as const, gameSlug: r.gameSlug, username: r.username, title: r.title, createdAt: r.createdAt })),
      ...guides.map((g) => ({ kind: "guide" as const, gameSlug: g.gameSlug, username: g.username, title: g.title, createdAt: g.createdAt })),
      ...posts.map((p) => ({ kind: "discussion" as const, gameSlug: p.gameSlug, username: p.username, title: p.title, createdAt: p.createdAt })),
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
  const activity = await getRecentActivity();
  const rows = await Promise.all(
    activity.map(async (a) => ({
      a,
      game: await getGame(a.gameSlug),
    }))
  );

  return (
    <div className="space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Community</h1>
        <p className="mt-1 text-muted-foreground">
          Reviews, guides, and discussions from real PlayBound players — centered around games.
        </p>
      </div>

      <section>
        <SectionHeader title="Recent Activity" subtitle="Live from reviews, guides, and discussions across the platform" />
        {rows.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-border">
            {rows.map(({ a, game }, i) => {
              const Icon = kindIcon[a.kind];
              return (
                <div key={i} className={`flex items-center gap-3 bg-card px-4 py-3 ${i > 0 ? "border-t border-border" : ""}`}>
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary">
                    <Icon className="size-4 text-primary" />
                  </span>
                  <p className="min-w-0 flex-1 truncate text-sm">
                    <span className="font-semibold">{a.username}</span> {kindLabel[a.kind]}{" "}
                    {game ? (
                      <Link href={`/games/${game.slug}`} className="font-semibold hover:underline">
                        {game.title}
                      </Link>
                    ) : (
                      a.gameSlug
                    )}
                    : &ldquo;{a.title}&rdquo;
                  </p>
                  <span className="shrink-0 text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleDateString()}</span>
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
    </div>
  );
}
