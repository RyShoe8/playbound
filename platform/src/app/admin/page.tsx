import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { CalendarDays, Plus, Shield } from "lucide-react";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import User from "@/lib/models/User";
import Review from "@/lib/models/Review";
import GuidePost from "@/lib/models/GuidePost";
import DiscussionPost from "@/lib/models/DiscussionPost";
import PlatformEvent from "@/lib/models/PlatformEvent";
import NewsletterSubscriber from "@/lib/models/NewsletterSubscriber";
import { developers, games } from "@/lib/data";
import { GameArt } from "@/components/GameArt";
import { SectionHeader, StatTile } from "@/components/ui/bits";

export const metadata: Metadata = { title: "Admin" };

async function getCounts() {
  try {
    await dbConnect();
    const [totalUsers, verifiedUsers, reviews, guides, discussions, events, newsletter] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ emailVerified: true }),
      Review.countDocuments(),
      GuidePost.countDocuments(),
      DiscussionPost.countDocuments(),
      PlatformEvent.countDocuments({ startsAt: { $gte: new Date() } }),
      NewsletterSubscriber.countDocuments(),
    ]);
    return { totalUsers, verifiedUsers, reviews, guides, discussions, events, newsletter };
  } catch (err) {
    console.error("Failed to load admin counts:", err);
    return { totalUsers: 0, verifiedUsers: 0, reviews: 0, guides: 0, discussions: 0, events: 0, newsletter: 0 };
  }
}

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") redirect("/");

  const counts = await getCounts();

  return (
    <div className="space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight">
          <Shield className="size-7 text-primary" /> Administration
        </h1>
        <p className="mt-1 text-muted-foreground">Real counts, pulled live from MongoDB and the game catalog.</p>
      </div>

      <section>
        <SectionHeader title="Platform Overview" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          <StatTile label="Games" value={String(games.length)} />
          <StatTile label="Developers" value={String(developers.length)} />
          <StatTile label="Registered Users" value={String(counts.totalUsers)} hint={`${counts.verifiedUsers} verified`} />
          <StatTile label="Newsletter Subs" value={String(counts.newsletter)} />
          <StatTile label="Reviews" value={String(counts.reviews)} />
          <StatTile label="Guides" value={String(counts.guides)} />
          <StatTile label="Discussion Posts" value={String(counts.discussions)} />
          <StatTile label="Upcoming Events" value={String(counts.events)} />
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Games Catalog</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Managed in code at src/lib/data/games.ts</p>
          </div>
          <Link
            href="/admin/events/new"
            className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-all hover:brightness-110"
          >
            <Plus className="size-4" /> New Event
          </Link>
        </div>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/40 text-left text-xs tracking-wide text-muted-foreground uppercase">
                <th className="px-4 py-3 font-semibold">Game</th>
                <th className="px-4 py-3 font-semibold">Genres</th>
                <th className="px-4 py-3 font-semibold">Launch</th>
                <th className="px-4 py-3 font-semibold">License</th>
              </tr>
            </thead>
            <tbody>
              {games.map((g) => (
                <tr key={g.slug} className="border-b border-border bg-card last:border-0">
                  <td className="px-4 py-2.5">
                    <Link href={`/games/${g.slug}`} className="flex items-center gap-2.5 hover:underline">
                      <GameArt game={g} showTitle={false} iconSize="sm" className="size-8 rounded-md" />
                      <span className="font-semibold">{g.title}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{g.genres.join(", ")}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {g.launchMethods.map((m) => (m === "install" ? "Install" : m === "server" ? "Servers" : "Browser")).join(" · ")}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{g.license}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <CalendarDays className="size-3.5" /> To add or edit games, developers, and collections, edit the
        files in <code className="rounded bg-secondary px-1 py-0.5">src/lib/data</code>. Reviews, guides,
        discussion posts, and events are stored in MongoDB and reflected above in real time.
      </p>
    </div>
  );
}
