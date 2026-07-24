import Link from "next/link";
import type { Metadata } from "next";
import { FolderHeart } from "lucide-react";
import { collections, gamesFor } from "@/lib/data";
import { GameArt } from "@/components/GameArt";
import { Badge } from "@/components/ui/bits";

export const metadata: Metadata = { title: "Collections" };

const curatorTone = {
  playbound: "brand",
  developer: "play",
  community: "neutral",
} as const;

const curatorLabel = {
  playbound: "PlayBound Curated",
  developer: "Developer Pick",
  community: "Community Made",
} as const;

export default function CollectionsPage() {
  return (
    <div className="space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Collections</h1>
          <p className="mt-1 text-muted-foreground">
            Curated lists from PlayBound, developers, and the community. Follow one and never run
            out of things to play.
          </p>
        </div>
        <button className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-all hover:brightness-110">
          <FolderHeart className="size-4" /> Create Collection
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {collections.map((c) => {
          const preview = gamesFor(c.gameSlugs).slice(0, 4);
          return (
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
                <Badge tone={curatorTone[c.curatorType]}>{curatorLabel[c.curatorType]}</Badge>
                <p className="mt-2 font-bold">{c.title}</p>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{c.description}</p>
                <p className="mt-3 text-xs text-muted-foreground">
                  {c.gameSlugs.length} games · by {c.curator} ·{" "}
                  {Intl.NumberFormat("en", { notation: "compact" }).format(c.followers)} followers ·
                  updated {c.updatedAgo}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
