import Link from "next/link";
import type { Metadata } from "next";
import { Bug, CalendarDays, Download, Gamepad2, Inbox, Plus, Shield, Users } from "lucide-react";
import dbConnect from "@/lib/db";
import User from "@/lib/models/User";
import NewsletterSubscriber from "@/lib/models/NewsletterSubscriber";
import GameSubmission from "@/lib/models/GameSubmission";
import BugReport from "@/lib/models/BugReport";
import TelemetryEvent from "@/lib/models/TelemetryEvent";
import CatalogMod from "@/lib/models/CatalogMod";
import { listAllGames } from "@/lib/catalog";
import { GameArt } from "@/components/GameArt";
import { PeriodStatTile, SectionHeader } from "@/components/ui/bits";
import {
  addPeriodCounts,
  emptyPeriodCounts,
  periodDistinctUsers,
  periodDocumentCounts,
  periodTelemetryCounts,
} from "@/lib/admin/analyticsPeriods";
import { getAdminLauncherDownloadUrl } from "@/lib/launcherDownload";

export const metadata: Metadata = { title: "Admin" };

async function loadDashboardKpis() {
  try {
    await dbConnect();
    const [
      totalUsers,
      verifiedUsers,
      newUsers,
      activeUsers,
      launcherInstalls,
      launcherInstallsTotal,
      bugReports,
      errorEvents,
      gamesPlayed,
      newsletterNew,
      newsletterActive,
      submissions,
      openBugs,
      pendingSubs,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ emailVerified: true }),
      periodDocumentCounts(User),
      periodDistinctUsers((filter) => TelemetryEvent.distinct("userId", filter)),
      periodTelemetryCounts(TelemetryEvent, "launcher_connected"),
      TelemetryEvent.countDocuments({ event: "launcher_connected" }),
      periodDocumentCounts(BugReport),
      periodTelemetryCounts(TelemetryEvent, "error"),
      periodTelemetryCounts(TelemetryEvent, "game_started"),
      periodDocumentCounts(NewsletterSubscriber, { subscribed: true }),
      NewsletterSubscriber.countDocuments({ subscribed: true }),
      periodDocumentCounts(GameSubmission),
      BugReport.countDocuments({ status: { $in: ["open", "reviewing"] } }),
      GameSubmission.countDocuments({ status: "pending" }),
    ]);

    return {
      totalUsers,
      verifiedUsers,
      newUsers,
      activeUsers,
      launcherInstalls,
      launcherInstallsTotal,
      bugs: addPeriodCounts(bugReports, errorEvents),
      bugReports,
      errorEvents,
      gamesPlayed,
      newsletterNew,
      newsletterActive,
      submissions,
      openBugs,
      pendingSubs,
    };
  } catch (err) {
    console.error("Failed to load admin dashboard KPIs:", err);
    const empty = emptyPeriodCounts();
    return {
      totalUsers: 0,
      verifiedUsers: 0,
      newUsers: empty,
      activeUsers: empty,
      launcherInstalls: empty,
      launcherInstallsTotal: 0,
      bugs: empty,
      bugReports: empty,
      errorEvents: empty,
      gamesPlayed: empty,
      newsletterNew: empty,
      newsletterActive: 0,
      submissions: empty,
      openBugs: 0,
      pendingSubs: 0,
    };
  }
}

export default async function AdminPage() {
  const [kpis, games, brokenModCount] = await Promise.all([
    loadDashboardKpis(),
    listAllGames(),
    CatalogMod.countDocuments({ versionCheckStatus: "broken" }),
  ]);

  const brokenVersions =
    games.filter((g) => g.launcherInstall?.versionCheckStatus === "broken").length +
    brokenModCount;
  const adminLauncherUrl = getAdminLauncherDownloadUrl();

  return (
    <div className="space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight">
            <Shield className="size-7 text-primary" /> Administration
          </h1>
          <p className="mt-1 text-muted-foreground">
            Live product KPIs (today / 7d / 30d vs previous period) and the editable game catalog.
          </p>
        </div>
        <a
          href={adminLauncherUrl}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-4 py-2 text-sm font-bold transition-colors hover:bg-secondary/70"
        >
          <Download className="size-4" />
          Unsigned launcher (admin)
        </a>
      </div>

      <section>
        <SectionHeader title="Platform Overview" subtitle="Period columns compare to the prior day / week / month" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <PeriodStatTile
            label="Total PlayBounders"
            primary={String(kpis.totalUsers)}
            hint={`${kpis.verifiedUsers} verified · new below`}
            href="/admin/users"
            periods={kpis.newUsers}
          />
          <PeriodStatTile
            label="Active PlayBounders"
            hint="Identified users with any telemetry"
            periods={kpis.activeUsers}
          />
          <PeriodStatTile
            label="Launcher Installs"
            primary={String(kpis.launcherInstallsTotal)}
            hint="Lifetime first connects · periods below"
            periods={kpis.launcherInstalls}
          />
          <PeriodStatTile
            label="Bugs"
            hint={`${kpis.bugReports.month} reports + ${kpis.errorEvents.month} errors (30d) · ${kpis.openBugs} open`}
            href="/admin/bugs"
            periods={kpis.bugs}
          />
          <PeriodStatTile
            label="Games Played"
            hint="game_started (site + launcher)"
            href="/admin/analytics/gameplay"
            periods={kpis.gamesPlayed}
          />
          <PeriodStatTile
            label="Newsletter Subs"
            primary={String(kpis.newsletterActive)}
            hint="Active subscribers · new below"
            periods={kpis.newsletterNew}
          />
          <PeriodStatTile
            label="Version Issues"
            primary={String(brokenVersions)}
            hint="Broken game/mod recipe probes"
            href="/admin/version-issues"
          />
          <PeriodStatTile
            label="Submissions"
            hint={`${kpis.pendingSubs} pending`}
            href="/admin/submissions"
            periods={kpis.submissions}
          />
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
              {kpis.pendingSubs > 0 ? ` (${kpis.pendingSubs})` : ""}
            </Link>
            <Link
              href="/admin/bugs"
              className="flex items-center gap-2 rounded-full border border-border bg-secondary px-4 py-2 text-sm font-bold transition-colors hover:bg-secondary/70"
            >
              <Bug className="size-4" /> Bugs
              {kpis.openBugs > 0 ? ` (${kpis.openBugs})` : ""}
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
