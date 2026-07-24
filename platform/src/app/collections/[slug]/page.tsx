import Link from "next/link";
import { notFound } from "next/navigation";
import { Bell, Share2 } from "lucide-react";
import { collectionsBySlug, gamesFor } from "@/lib/data";
import { GameArt } from "@/components/GameArt";
import { PlayCta } from "@/components/GameCard";
import { Badge, PlayersOnline, Rating } from "@/components/ui/bits";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const collection = collectionsBySlug.get(slug);
  return { title: collection ? collection.title : "Collection Not Found" };
}

export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const collection = collectionsBySlug.get(slug);
  if (!collection) notFound();

  const games = gamesFor(collection.gameSlugs);

  return (
    <div className="space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-2xl border border-border bg-gradient-to-br from-primary/15 via-card to-card p-6 sm:p-8">
        <Badge tone="brand">
          {collection.curatorType === "playbound"
            ? "PlayBound Curated"
            : collection.curatorType === "developer"
              ? "Developer Pick"
              : "Community Made"}
        </Badge>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight">{collection.title}</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">{collection.description}</p>
        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <span>
            Curated by <span className="font-semibold text-foreground">{collection.curator}</span>
          </span>
          <span>{games.length} games</span>
          <span>{Intl.NumberFormat("en", { notation: "compact" }).format(collection.followers)} followers</span>
          <span>Updated {collection.updatedAgo}</span>
        </div>
        <div className="mt-5 flex gap-2">
          <button className="flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground transition-all hover:brightness-110">
            <Bell className="size-4" /> Follow Collection
          </button>
          <button className="flex items-center gap-2 rounded-full border border-border bg-secondary px-5 py-2 text-sm font-bold transition-colors hover:bg-secondary/70">
            <Share2 className="size-4" /> Share
          </button>
        </div>
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
                <Rating value={game.rating} />
                <PlayersOnline count={game.playersOnline} className="text-xs" />
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
