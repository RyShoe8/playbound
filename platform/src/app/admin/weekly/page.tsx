import Link from "next/link";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { listWeeklyIssues } from "@/lib/weekly";
import { getGame } from "@/lib/catalog";

export const metadata: Metadata = { title: "Admin · Weekly" };

export default async function AdminWeeklyPage() {
  const issues = await listWeeklyIssues({ includeUnpublished: true });
  const titles = new Map<string, string>();
  await Promise.all(
    issues.map(async (i) => {
      const g = await getGame(i.gameSlug, { includeUnpublished: true });
      titles.set(i.gameSlug, g?.title ?? i.gameSlug);
    })
  );

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Weekly</h1>
          <p className="mt-1 text-muted-foreground">
            Set the featured game and publication date for each Wednesday issue.
          </p>
        </div>
        <Link
          href="/admin/weekly/new"
          className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:brightness-110"
        >
          <Plus className="size-4" /> New issue
        </Link>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/40 text-left text-xs tracking-wide text-muted-foreground uppercase">
              <th className="px-4 py-3 font-semibold">Week</th>
              <th className="px-4 py-3 font-semibold">Game</th>
              <th className="px-4 py-3 font-semibold">Published</th>
              <th className="px-4 py-3 font-semibold">Date</th>
              <th className="px-4 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {issues.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No issues yet.
                </td>
              </tr>
            ) : (
              issues.map((i) => (
                <tr key={i.slug} className="border-b border-border bg-card last:border-0">
                  <td className="px-4 py-2.5 font-semibold">
                    {i.year} W{i.week}
                  </td>
                  <td className="px-4 py-2.5">{titles.get(i.gameSlug) ?? i.gameSlug}</td>
                  <td className="px-4 py-2.5">
                    <span className={i.published ? "font-semibold text-primary" : "text-muted-foreground"}>
                      {i.published ? "Yes" : "Draft"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{i.publishedAt}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      href={`/admin/weekly/${i.slug}/edit`}
                      className="font-semibold text-primary hover:underline"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
