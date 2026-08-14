import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listAllGames } from "@/lib/catalog";
import { getWeeklyIssueAdmin } from "@/lib/weekly";
import { WeeklyIssueForm } from "@/components/admin/WeeklyIssueForm";
import { toCatalogGamePrefill } from "@/lib/newsletterEmail";

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
  const issue = await getWeeklyIssueAdmin({ slug });
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
          id: issue.id,
          gameSlug: issue.gameSlug,
          publishedAt: issue.publishedAt,
          published: issue.published,
          emailDraft: issue.emailDraft,
        }}
        games={games.map(toCatalogGamePrefill)}
      />
    </div>
  );
}
