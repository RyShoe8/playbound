import type { Metadata } from "next";
import { connection } from "next/server";
import { listDevelopers } from "@/lib/developers";
import { emptyGameDraft, slugifyTitle, type GamePayload } from "@/lib/gamePayload";
import { gameAccessTiers } from "@/lib/access/tiers";
import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import GameSubmission from "@/lib/models/GameSubmission";
import { GameEditorForm } from "@/components/admin/GameEditorForm";

export const metadata: Metadata = { title: "Admin · New game" };

export default async function AdminNewGamePage({
  searchParams,
}: {
  searchParams: Promise<{ fromSubmission?: string; import?: string }>;
}) {
  // Never prerendered — see the layout. Each segment prerenders
  // independently, so the layout's opt-out does not cover this page.
  await connection();
  const { fromSubmission } = await searchParams;
  let initial: GamePayload = emptyGameDraft();
  initial.website = "https://example.com";

  const [subDoc, developersList, catalogGamesDocs, tiers] = await Promise.all([
    fromSubmission
      ? (async () => {
          try {
            await dbConnect();
            return await GameSubmission.findById(fromSubmission).lean();
          } catch {
            return null;
          }
        })()
      : Promise.resolve(null),
    listDevelopers(),
    CatalogGame.find({}).select("slug title access.priceType").sort({ title: 1 }).lean(),
    gameAccessTiers(),
  ]);

  if (subDoc) {
    const sub = subDoc as unknown as {
      _id: unknown;
      title: string;
      description: string;
      website: string;
      githubRepo?: string | null;
      license?: string | null;
    };
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

  const developers = developersList.map((d: { slug: string; name: string }) => ({
    slug: d.slug,
    name: d.name,
  }));
  const catalogGames = catalogGamesDocs.map((g: any) => ({
    slug: String(g.slug),
    title: String(g.title),
    priceType: g.access?.priceType,
  }));

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">New game</h1>
        <p className="mt-1 text-muted-foreground">
          Prefill from Steam/GitHub or a submission, then review before publishing.
        </p>
      </div>
      <GameEditorForm
        key={fromSubmission ? `submission-${fromSubmission}` : `new-${Date.now()}`}
        mode="create"
        initial={initial}
        developers={developers}
        catalogGames={catalogGames}
        catalogTiers={tiers}
      />
    </div>
  );
}
