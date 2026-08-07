import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShoppingCart } from "lucide-react";
import dbConnect from "@/lib/db";
import Gear from "@/lib/models/Gear";
import GearRecommendation from "@/lib/models/GearRecommendation";
import { getGame } from "@/lib/catalog";
import { PlayboundCertifiedBadge } from "@/components/gear/PlayboundCertifiedBadge";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  await dbConnect();
  const gear = await Gear.findOne({ slug }).lean();
  
  if (!gear) {
    return { title: "Not Found" };
  }

  return {
    title: `${gear.title} · Playbound Gear`,
    description: gear.description,
  };
}

export default async function GearProductPage({ params }: { params: Promise<{ slug: string; category: string }> }) {
  const { slug, category } = await params;
  await dbConnect();

  const gear = await Gear.findOne({ slug, status: "published" }).lean();

  if (!gear) {
    notFound();
  }

  // Get games this is recommended for
  const recommendations = await GearRecommendation.find({ gearSlug: gear.slug }).lean();
  
  const recommendedGames = [];
  for (const rec of recommendations) {
    const game = await getGame(rec.gameSlug);
    if (game) {
      recommendedGames.push({ game, rec });
    }
  }

  const activeLinks = (gear.affiliateLinks || []).filter((l: any) => l.isActive);

  return (
    <div className="space-y-12 px-4 py-8 sm:px-6 lg:px-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/gear" className="hover:text-foreground">Gear</Link>
        <span>/</span>
        <Link href={`/gear/${category.toLowerCase()}`} className="hover:text-foreground">
          {gear.category}
        </Link>
        <span>/</span>
        <span className="font-semibold text-foreground">{gear.title}</span>
      </div>

      <div className="grid gap-12 md:grid-cols-2">
        <div>
          {gear.coverImage ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={gear.coverImage}
              alt={gear.title}
              className="w-full rounded-2xl object-cover bg-secondary/20 border border-border"
            />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center rounded-2xl bg-secondary/50 border border-border">
              <span className="text-muted-foreground uppercase tracking-widest">{gear.category}</span>
            </div>
          )}
        </div>

        <div className="space-y-8">
          <div className="space-y-4">
            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">{gear.title}</h1>
            
            {gear.playboundCertified && (
              <div>
                <PlayboundCertifiedBadge />
              </div>
            )}
            
            {gear.platforms?.length > 0 && (
              <div className="flex flex-wrap gap-2 text-sm">
                <span className="font-semibold text-muted-foreground">Platforms:</span>
                {gear.platforms.map((p: string) => (
                  <span key={p} className="text-foreground">{p}</span>
                ))}
              </div>
            )}
            
            {gear.bestFor?.length > 0 && (
              <div className="flex flex-wrap gap-2 text-sm">
                <span className="font-semibold text-muted-foreground">Best for:</span>
                {gear.bestFor.map((b: string) => (
                  <span key={b} className="text-foreground">{b}</span>
                ))}
              </div>
            )}

            <p className="text-lg leading-relaxed text-muted-foreground pt-4">
              {gear.description}
            </p>
          </div>

          <div className="space-y-4 pt-4 border-t border-border">
            <h3 className="font-bold text-lg">Where to buy</h3>
            {activeLinks.length > 0 ? (
              <div className="flex flex-col gap-3">
                {activeLinks.map((link: any, i: number) => (
                  <a
                    key={i}
                    href={link.url}
                    target="_blank"
                    rel="nofollow noopener noreferrer"
                    className="inline-flex items-center justify-between rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-secondary/20"
                  >
                    <div className="flex items-center gap-3 font-semibold text-lg">
                      <ShoppingCart className="size-5 text-primary" />
                      {link.retailer}
                    </div>
                    <div className="text-right">
                      {link.price && <div className="font-bold">{link.price}</div>}
                      {link.shipping && <div className="text-xs text-muted-foreground">{link.shipping}</div>}
                    </div>
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No purchase links available.</p>
            )}
          </div>
        </div>
      </div>

      {recommendedGames.length > 0 && (
        <div className="space-y-6 pt-8 border-t border-border">
          <h2 className="text-2xl font-bold">Officially tested with {recommendedGames.length} game{recommendedGames.length === 1 ? "" : "s"}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recommendedGames.map(({ game, rec }: any) => (
              <Link
                key={game.slug}
                href={`/games/${game.slug}`}
                className="flex items-start gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
              >
                {game.coverImage ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={game.coverImage} alt="" className="h-16 w-16 rounded object-cover" />
                ) : (
                  <div className="h-16 w-16 rounded bg-secondary/50" />
                )}
                <div>
                  <h3 className="font-bold hover:underline">{game.title}</h3>
                  {rec.rank && <div className="text-xl leading-none mt-1">{rec.rank}</div>}
                  {rec.notes && <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{rec.notes}</p>}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
