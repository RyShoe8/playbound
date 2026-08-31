import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getGame, listAllGames } from "@/lib/catalog";
import { EditionEditorForm } from "@/components/admin/EditionEditorForm";
import { emptyEditionDraft } from "@/lib/editionDraft";

export const metadata: Metadata = { title: "Admin · New edition" };

export default async function NewEditionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  // Never prerendered — see the layout. Each segment prerenders
  // independently, so the layout's opt-out does not cover this page.
  await connection();
  const { slug } = await params;
  const [game, games] = await Promise.all([
    getGame(slug, { includeUnpublished: true }),
    listAllGames(),
  ]);
  if (!game) notFound();

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <Link
          href={`/admin/games/${game.slug}/editions`}
          className="text-sm font-semibold text-muted-foreground hover:underline"
        >
          ← {game.title} editions
        </Link>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">New edition</h1>
      </div>
      <EditionEditorForm
        mode="create"
        initial={emptyEditionDraft(game.slug)}
        games={games.map((g) => ({ slug: g.slug, title: g.title }))}
      />
    </div>
  );
}
