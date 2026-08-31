import type { Metadata } from "next";
import { connection } from "next/server";
import { listGames } from "@/lib/catalog";
import { CollectionEditorForm } from "@/components/admin/CollectionEditorForm";

export const metadata: Metadata = { title: "Admin · New collection" };

export default async function NewCollectionPage() {
  // Never prerendered — see the layout. Each segment prerenders
  // independently, so the layout's opt-out does not cover this page.
  await connection();
  const games = await listGames();

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-extrabold tracking-tight">New collection</h1>
      <CollectionEditorForm
        mode="create"
        initial={{
          slug: "",
          title: "",
          description: "",
          gameSlugs: [],
          published: true,
          sortOrder: 0,
        }}
        games={games.map((g) => ({ slug: g.slug, title: g.title }))}
      />
    </div>
  );
}
