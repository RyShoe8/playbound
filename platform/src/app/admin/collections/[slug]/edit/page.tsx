import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";
import { listAllCollections } from "@/lib/collections";
import { listGames } from "@/lib/catalog";
import { CollectionEditorForm } from "@/components/admin/CollectionEditorForm";

export const metadata: Metadata = { title: "Admin · Edit collection" };

export default async function EditCollectionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  // Never prerendered — see the layout. Each segment prerenders
  // independently, so the layout's opt-out does not cover this page.
  await connection();
  const { slug } = await params;
  const [all, games] = await Promise.all([listAllCollections(), listGames()]);
  const collection = all.find((c) => c.slug === slug);
  if (!collection) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">{collection.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">/collections/{collection.slug}</p>
      </div>
      <CollectionEditorForm
        mode="edit"
        initial={collection}
        games={games.map((g) => ({ slug: g.slug, title: g.title }))}
      />
    </div>
  );
}
