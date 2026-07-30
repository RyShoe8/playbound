import Link from "next/link";
import type { Metadata } from "next";
import { CalendarDays, Gamepad2, Inbox, Plus, Shield, Users } from "lucide-react";
import dbConnect from "@/lib/db";
import User from "@/lib/models/User";
import Review from "@/lib/models/Review";
import GuidePost from "@/lib/models/GuidePost";
import DiscussionTopic from "@/lib/models/DiscussionTopic";
import PlatformEvent from "@/lib/models/PlatformEvent";
import NewsletterSubscriber from "@/lib/models/NewsletterSubscriber";
import GameSubmission from "@/lib/models/GameSubmission";
import { developers, listAllGames } from "@/lib/catalog";
import { listAllMods } from "@/lib/mods";
import { GameArt } from "@/components/GameArt";
import { SectionHeader, StatTile } from "@/components/ui/bits";

export const metadata: Metadata = { title: "Admin" };

async function getCounts() {
  try {
    await dbConnect();
    const [totalUsers, verifiedUsers, reviews, guides, discussions, events, newsletter, pendingSubs] =
      await Promise.all([
        User.countDocuments(),
        User.countDocuments({ emailVerified: true }),
        Review.countDocuments(),
        GuidePost.countDocuments(),
        DiscussionTopic.countDocuments({ status: { $ne: "removed" } }),
        PlatformEvent.countDocuments({ startsAt: { $gte: new Date() } }),
        NewsletterSubscriber.countDocuments(),
        GameSubmission.countDocuments({ status: "pending" }),
      ]);
    return {
      totalUsers,
      verifiedUsers,
      reviews,
      guides,
      discussions,
      events,
      newsletter,
      pendingSubs,
    };
  } catch (err) {
    console.error("Failed to load admin counts:", err);
    return {
      totalUsers: 0,
      verifiedUsers: 0,
      reviews: 0,
      guides: 0,
      discussions: 0,
      events: 0,
      newsletter: 0,
      pendingSubs: 0,
    };
  }
}

export default async function AdminPage() {
  const [counts, games, mods] = await Promise.all([getCounts(), listAllGames(), listAllMods()]);
  const oneClickMods = mods.filter((m) => m.downloadKind !== "external").length;
  const brokenVersions =
    games.filter((g) => g.launcherInstall?.versionCheckStatus === "broken").length +
    mods.filter((m) => m.versionCheckStatus === "broken").length;

  return (
    <div className="space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight">
          <Shield className="size-7 text-primary" /> Administration
        </h1>
        <p className="mt-1 text-muted-foreground">Live MongoDB counts and the editable game catalog.</p>
      </div>

      <section>
        <SectionHeader title="Platform Overview" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          <StatTile label="Games" value={String(games.length)} />
          <StatTile
            label="Launcher Installs"
            value={String(games.reduce((sum, g) => sum + (g.installCount ?? 0), 0))}
          />
          <StatTile
            label="One-click mods"
            value={String(oneClickMods)}
            hint={`${mods.length - oneClickMods} external links`}
          />
          <StatTile
            label="Version issues"
            value={String(brokenVersions)}
            hint="Broken game/mod recipe probes"
          />
          <StatTile label="Developers" value={String(developers.length)} />
          <StatTile label="Registered Users" value={String(counts.totalUsers)} hint={`${counts.verifiedUsers} verified`} />
          <StatTile label="Newsletter Subs" value={String(counts.newsletter)} />
          <StatTile label="Reviews" value={String(counts.reviews)} />
          <StatTile label="Guides" value={String(counts.guides)} />
          <StatTile label="Discussion Posts" value={String(counts.discussions)} />
          <StatTile label="Upcoming Events" value={String(counts.events)} />
          <StatTile label="Pending Submissions" value={String(counts.pendingSubs)} />
        </div>
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Games Catalog</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Managed in Admin → Games (MongoDB)</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/games"
              className="flex items-center gap-2 rounded-full border border-border bg-secondary px-4 py-2 text-sm font-bold transition-colors hover:bg-secondary/70"
            >
              <Gamepad2 className="size-4" /> Manage games
            </Link>
            <Link
              href="/admin/users"
              className="flex items-center gap-2 rounded-full border border-border bg-secondary px-4 py-2 text-sm font-bold transition-colors hover:bg-secondary/70"
            >
              <Users className="size-4" /> Users
            </Link>
            <Link
              href="/admin/submissions"
              className="flex items-center gap-2 rounded-full border border-border bg-secondary px-4 py-2 text-sm font-bold transition-colors hover:bg-secondary/70"
            >
              <Inbox className="size-4" /> Submissions
              {counts.pendingSubs > 0 ? ` (${counts.pendingSubs})` : ""}
            </Link>
            <Link
              href="/admin/events/new"
              className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-all hover:brightness-110"
            >
              <Plus className="size-4" /> New Event
            </Link>
          </div>
        </div>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/40 text-left text-xs tracking-wide text-muted-foreground uppercase">
                <th className="px-4 py-3 font-semibold">Game</th>
                <th className="px-4 py-3 font-semibold">Genres</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">License</th>
              </tr>
            </thead>
            <tbody>
              {games.slice(0, 12).map((g) => (
                <tr key={g.slug} className="border-b border-border bg-card last:border-0">
                  <td className="px-4 py-2.5">
                    <Link href={`/admin/games/${g.slug}/edit`} className="flex items-center gap-2.5 hover:underline">
                      <GameArt game={g} showTitle={false} iconSize="sm" className="size-8 rounded-md" />
                      <span className="font-semibold">{g.title}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{g.genres.join(", ")}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{g.published ? "Published" : "Draft"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{g.license}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <CalendarDays className="size-3.5" /> Catalog text and metadata publish from Admin without a code deploy.
        Cover files can still live under <code className="rounded bg-secondary px-1 py-0.5">public/games</code> or as
        absolute URLs. Launcher install recipes are edited on each game (Admin) and sync to the desktop
        app via API — no launcher rebuild needed for new titles.
      </p>
    </div>
  );
}
