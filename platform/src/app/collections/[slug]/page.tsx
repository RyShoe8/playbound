import Link from "next/link";
import { notFound } from "next/navigation";
import { collectionsBySlug } from "@/lib/data";
import { gamesFor } from "@/lib/catalog";
import { GameArt } from "@/components/GameArt";
import { LaunchBadge, PlayCta } from "@/components/GameCard";
import { Badge } from "@/components/ui/bits";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const collection = collectionsBySlug.get(slug);
  return { title: collection ? collection.title : "Collection Not Found" };
}

export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const collection = collectionsBySlug.get(slug);
  if (!collection) notFound();

  const games = await gamesFor(collection.gameSlugs);

  return (
    <div className="space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-2xl border border-border bg-gradient-to-br from-primary/15 via-card to-card p-6 sm:p-8">
        <Badge tone="brand">PlayBound Curated</Badge>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight">{collection.title}</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">{collection.description}</p>
        <p className="mt-4 text-sm text-muted-foreground">{games.length} games</p>
      </section>

      <div className="space-y-3">
        {games.map((game, i) => (
          <div
            key={game.slug}
            className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
          >
            <span className="w-6 text-center text-lg font-extrabold text-muted-foreground">{i + 1}</span>
            <Link href={`/games/${game.slug}`} className="shrink-0">
              <GameArt game={game} showTitle={false} iconSize="sm" className="size-16 rounded-lg sm:size-20" />
            </Link>
            <div className="min-w-0 flex-1">
              <Link href={`/games/${game.slug}`} className="font-bold hover:underline">
                {game.title}
              </Link>
              <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{game.tagline}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs">
                <LaunchBadge game={game} />
                <span className="text-muted-foreground">{game.genres.join(" · ")}</span>
              </div>
            </div>
            <PlayCta game={game} size="sm" />
          </div>
        ))}
      </div>
    </div>
  );
}
