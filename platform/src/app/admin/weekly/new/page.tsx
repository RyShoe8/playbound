import type { Metadata } from "next";
import { listAllGames } from "@/lib/catalog";
import { WeeklyIssueForm } from "@/components/admin/WeeklyIssueForm";

export const metadata: Metadata = { title: "Admin · New weekly issue" };

export default async function AdminNewWeeklyPage() {
  const games = await listAllGames();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">New weekly issue</h1>
        <p className="mt-1 text-muted-foreground">
          Pick the featured game and Wednesday publication date. Public copy comes from the catalog.
        </p>
      </div>
      <WeeklyIssueForm
        mode="create"
        initial={{ gameSlug: "", publishedAt: today, published: true }}
        games={games.map((g) => ({ slug: g.slug, title: g.title }))}
      />
    </div>
  );
}
