import Link from "next/link";
import { connection } from "next/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getGame, listAllGames } from "@/lib/catalog";
import { listDevelopers } from "@/lib/developers";
import { emptyModDraft } from "@/lib/modPayload";
import { ModEditorForm } from "@/components/admin/ModEditorForm";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: `Admin · New ${slug} mod` } satisfies Metadata;
}

export default async function AdminGameNewModPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  // Never prerendered — see the layout. Each segment prerenders
  // independently, so the layout's opt-out does not cover this page.
  await connection();
  const { slug } = await params;
  const game = await getGame(slug, { includeUnpublished: true });
  if (!game) notFound();

  const games = await listAllGames();

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <Link
          href={`/admin/games/${game.slug}/mods`}
          className="text-sm font-semibold text-muted-foreground hover:underline"
        >
          ← {game.title} mods
        </Link>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">New mod</h1>
        <p className="mt-1 text-muted-foreground">
          Add-on for {game.title}. Install folder is relative to that game&apos;s directory.
        </p>
      </div>
      <ModEditorForm
        mode="create"
        initial={emptyModDraft(game.slug)}
        developers={(await listDevelopers()).map((d) => ({ slug: d.slug, name: d.name }))}
        games={games.map((g) => ({ slug: g.slug, title: g.title }))}
      />
    </div>
  );
}
