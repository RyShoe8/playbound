import type { Metadata } from "next";
import { listDevelopers } from "@/lib/developers";
import { emptyGameDraft, slugifyTitle, type GamePayload } from "@/lib/gamePayload";
import { listGames } from "@/lib/catalog";
import { gameAccessTiers } from "@/lib/access/tiers";
import dbConnect from "@/lib/db";
import GameSubmission from "@/lib/models/GameSubmission";
import { GameEditorForm } from "@/components/admin/GameEditorForm";

export const metadata: Metadata = { title: "Admin · New game" };

export default async function AdminNewGamePage({
  searchParams,
}: {
  searchParams: Promise<{ fromSubmission?: string; import?: string }>;
}) {
  const { fromSubmission } = await searchParams;
  let initial: GamePayload = emptyGameDraft();
  initial.website = "https://example.com";

  if (fromSubmission) {
    try {
      await dbConnect();
      const sub = await GameSubmission.findById(fromSubmission).lean();
      if (sub) {
        initial = {
          ...emptyGameDraft(),
          title: sub.title,
          slug: slugifyTitle(sub.title),
          tagline: sub.title,
          description: sub.description,
          website: sub.website,
          githubRepo: sub.githubRepo || null,
          license: sub.license || "Free / Open Source",
          published: false,
          submissionId: String(sub._id),
        };
      }
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">New game</h1>
        <p className="mt-1 text-muted-foreground">
          Prefill from Steam/GitHub or a submission, then review before publishing.
        </p>
      </div>
      <GameEditorForm
        mode="create"
        initial={initial}
        developers={(await listDevelopers()).map((d) => ({ slug: d.slug, name: d.name }))}
        catalogGames={(await listGames({ includeTesting: true })).map((g) => ({
          slug: g.slug,
          title: g.title,
        }))}
        catalogTiers={await gameAccessTiers()}
      />
    </div>
  );
}
