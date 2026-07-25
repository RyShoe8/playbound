import Link from "next/link";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/bits";
import { collections } from "@/lib/data";
import { gamesFor } from "@/lib/catalog";
import { GameArt } from "@/components/GameArt";

export const metadata: Metadata = { title: "Collections" };

export default async function CollectionsPage() {
  const previews = await Promise.all(
    collections.map(async (c) => ({
      collection: c,
      preview: (await gamesFor(c.gameSlugs)).slice(0, 4),
    }))
  );

  return (
    <div className="space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Collections</h1>
        <p className="mt-1 text-muted-foreground">Curated groupings of real free games, hand-picked by PlayBound.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {previews.map(({ collection: c, preview }) => (
          <Link
            key={c.slug}
            href={`/collections/${c.slug}`}
            className="group overflow-hidden rounded-xl border border-border bg-card transition-all hover:-translate-y-0.5 hover:border-primary/40"
          >
            <div className="grid grid-cols-4 gap-px">
              {preview.map((g) => (
                <GameArt key={g.slug} game={g} showTitle={false} iconSize="sm" className="aspect-square" />
              ))}
            </div>
            <div className="p-4">
              <Badge tone="brand">PlayBound Curated</Badge>
              <p className="mt-2 font-bold">{c.title}</p>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{c.description}</p>
              <p className="mt-3 text-xs text-muted-foreground">{c.gameSlugs.length} games</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
