import Link from "next/link";
import { connection } from "next/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import CatalogMod from "@/lib/models/CatalogMod";
import { VersionIssueRecheck } from "@/components/admin/VersionIssueRecheck";
import { LocalTime } from "@/components/LocalTime";

export const metadata: Metadata = { title: "Version issues" };

type IssueRow = {
  kind: "game" | "mod";
  slug: string;
  title: string;
  note: string | null;
  lastCheck: Date | null;
  editHref: string;
};

export default async function AdminVersionIssuesPage() {
  // Never prerendered — see the layout. Each segment prerenders
  // independently, so the layout's opt-out does not cover this page.
  await connection();
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") redirect("/");

  let rows: IssueRow[] = [];

  try {
    await dbConnect();
    const [games, mods] = await Promise.all([
      CatalogGame.find({
        published: true,
        "launcherInstall.versionCheckStatus": "broken",
      })
        .select("slug title launcherInstall.versionCheckNote launcherInstall.lastVersionCheckAt")
        .lean(),
      CatalogMod.find({
        published: true,
        versionCheckStatus: "broken",
      })
        .select("slug title versionCheckNote lastVersionCheckAt")
        .lean(),
    ]);

    rows = [
      ...games.map((g) => {
        const row = g as {
          slug: string;
          title: string;
          launcherInstall?: {
            versionCheckNote?: string | null;
            lastVersionCheckAt?: Date | null;
          };
        };
        return {
          kind: "game" as const,
          slug: row.slug,
          title: row.title,
          note: row.launcherInstall?.versionCheckNote || null,
          lastCheck: row.launcherInstall?.lastVersionCheckAt
            ? new Date(row.launcherInstall.lastVersionCheckAt)
            : null,
          editHref: `/admin/games/${row.slug}/edit`,
        };
      }),
      ...mods.map((m) => {
        const row = m as {
          slug: string;
          title: string;
          versionCheckNote?: string | null;
          lastVersionCheckAt?: Date | null;
        };
        return {
          kind: "mod" as const,
          slug: row.slug,
          title: row.title,
          note: row.versionCheckNote || null,
          lastCheck: row.lastVersionCheckAt ? new Date(row.lastVersionCheckAt) : null,
          editHref: `/admin/mods/${row.slug}/edit`,
        };
      }),
    ].sort((a, b) => a.title.localeCompare(b.title));
  } catch (err) {
    console.error("Failed to load version issues:", err);
  }

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Admin
        </Link>
        <h1 className="mt-2 flex items-center gap-2 text-3xl font-extrabold tracking-tight">
          <AlertTriangle className="size-7 text-primary" /> Version issues
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {rows.length} broken install recipe{rows.length === 1 ? "" : "s"} after probes
          (auto-heal runs on Re-check and the daily cron).
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No broken game or mod recipes right now.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/40 text-left text-xs tracking-wide text-muted-foreground uppercase">
                <th className="px-4 py-3 font-semibold">Title</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">Note</th>
                <th className="px-4 py-3 font-semibold">Last check</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.kind}:${row.slug}`} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <Link href={row.editHref} className="font-bold text-primary hover:underline">
                      {row.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">{row.slug}</p>
                  </td>
                  <td className="px-4 py-3 capitalize">{row.kind}</td>
                  <td className="max-w-md px-4 py-3 text-muted-foreground">
                    {row.note || "—"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    <LocalTime
                      value={row.lastCheck ? row.lastCheck.toISOString() : null}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Link
                        href={row.editHref}
                        className="rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold hover:bg-secondary/70"
                      >
                        Edit
                      </Link>
                      <VersionIssueRecheck kind={row.kind} slug={row.slug} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
