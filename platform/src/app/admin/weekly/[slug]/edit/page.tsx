import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listAllGames } from "@/lib/catalog";
import { getWeeklyIssue } from "@/lib/weekly";
import { WeeklyIssueForm } from "@/components/admin/WeeklyIssueForm";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: `Admin · Edit ${slug}` } satisfies Metadata;
}

export default async function AdminEditWeeklyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const issue = await getWeeklyIssue(slug, { includeUnpublished: true });
  if (!issue) notFound();
  const games = await listAllGames();

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Edit weekly issue</h1>
        <p className="mt-1 text-muted-foreground">{issue.slug}</p>
      </div>
      <WeeklyIssueForm
        mode="edit"
        initial={{
          slug: issue.slug,
          gameSlug: issue.gameSlug,
          publishedAt: issue.publishedAt,
          published: issue.published,
        }}
        games={games.map((g) => ({ slug: g.slug, title: g.title }))}
      />
    </div>
  );
}
