import type { Metadata } from "next";
import { listAllGames } from "@/lib/catalog";
import { WeeklyIssueForm } from "@/components/admin/WeeklyIssueForm";
import { getNewsletterFooterTemplate } from "@/lib/weekly";

export const metadata: Metadata = { title: "Admin · New weekly issue" };

export default async function AdminNewWeeklyPage() {
  const games = await listAllGames();
  const today = new Date().toISOString().slice(0, 10);
  const year = Number(today.slice(0, 4)) || new Date().getUTCFullYear();
  const footer = await getNewsletterFooterTemplate({ year });
  const emailDraft = footer ? { footer } : undefined;

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">New weekly issue</h1>
        <p className="mt-1 text-muted-foreground">
          Pick the featured game and Wednesday publication date, then build the newsletter HTML below.
        </p>
      </div>
      <WeeklyIssueForm
        mode="create"
        initial={{ gameSlug: "", publishedAt: today, published: true, emailDraft }}
        games={games.map((g) => ({
          slug: g.slug,
          title: g.title,
          tagline: g.tagline,
          description: g.description,
          coverImage: g.coverImage,
          whyWePickedIt: g.whyWePickedIt,
        }))}
      />
    </div>
  );
}
