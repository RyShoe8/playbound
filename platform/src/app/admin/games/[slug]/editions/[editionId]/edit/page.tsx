import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getGame, listAllGames } from "@/lib/catalog";
import { getEditionById } from "@/lib/editions";
import { EditionEditorForm } from "@/components/admin/EditionEditorForm";
import { editionToDraft } from "@/lib/editionDraft";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; editionId: string }>;
}) {
  const { editionId } = await params;
  const edition = await getEditionById(editionId);
  return { title: `Admin · Edit ${edition?.name ?? "edition"}` } satisfies Metadata;
}

export default async function EditEditionPage({
  params,
}: {
  params: Promise<{ slug: string; editionId: string }>;
}) {
  const { slug, editionId } = await params;
  const [game, edition, games] = await Promise.all([
    getGame(slug, { includeUnpublished: true }),
    getEditionById(editionId),
    listAllGames(),
  ]);
  if (!game || !edition) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <Link
          href={`/admin/games/${game.slug}/editions`}
          className="text-sm font-semibold text-muted-foreground hover:underline"
        >
          ← {game.title} editions
        </Link>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">{edition.name}</h1>
        <p className="mt-1 text-muted-foreground">
          <Link
            href={`/games/${game.slug}/editions/${edition.slug}`}
            className="hover:underline"
          >
            /games/{game.slug}/editions/{edition.slug}
          </Link>
        </p>
      </div>
      <EditionEditorForm
        mode="edit"
        initial={editionToDraft(edition)}
        games={games.map((g) => ({ slug: g.slug, title: g.title }))}
      />
    </div>
  );
}
