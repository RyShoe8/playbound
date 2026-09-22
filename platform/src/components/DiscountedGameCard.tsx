import Image from "next/image";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { DiscountedGame } from "@/lib/deals";
import { formatCents } from "@/lib/deals";
import { withOutboundUtm } from "@/lib/utm";
import { Badge } from "@/components/ui/bits";
import { cn } from "@/lib/utils";

/**
 * One catalog game currently on sale, for /deals.
 *
 * Separate from FreeGameCard because the two say different things. A free offer
 * is a countdown — claim it before it expires. A discount is a comparison — this
 * is what it costs and what it normally costs. Reusing one card for both would
 * mean a price row that is blank half the time and an expiry row that is blank
 * the other half.
 *
 * A server component: nothing here needs state, and unlike FreeGameCard there is
 * no compatibility hook to call, because these are catalog games whose own pages
 * already carry that information.
 */
export function DiscountedGameCard({
  game,
  className,
}: {
  game: DiscountedGame;
  className?: string;
}) {
  const storeHref = game.storeUrl
    ? withOutboundUtm(game.storeUrl, { campaign: "deals_discount" })
    : null;
  const [from, to] = game.art ? [game.art.from, game.art.to] : ["#1e1b4b", "#312e81"];

  return (
    <div
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_12px_32px_-12px_rgba(0,0,0,0.7)]",
        className
      )}
    >
      <Link href={`/games/${game.slug}`} className="relative block aspect-[16/9] overflow-hidden">
        {game.coverImage ? (
          <Image
            src={game.coverImage}
            alt=""
            fill
            sizes="(min-width: 1024px) 300px, (min-width: 640px) 45vw, 90vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            /*
             * Same rule as FreeGameCard: a URL with no image extension is
             * something the optimizer cannot be trusted to fetch, so it is
             * handed through untouched. Everything else goes through
             * next/image and therefore needs its host in
             * next.config.ts remotePatterns — see providerImageHosts.test.ts
             * for why that is worth a test.
             */
            unoptimized={!/\.(jpg|jpeg|png|webp|avif)(\?|$)/i.test(game.coverImage)}
          />
        ) : (
          <div
            className="size-full"
            style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
          />
        )}
        <div className="absolute left-2 top-2">
          <Badge tone="play">-{game.percentOff}%</Badge>
        </div>
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <Link href={`/games/${game.slug}`} className="font-bold leading-tight hover:underline">
          {game.title}
        </Link>
        {game.tagline && (
          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {game.tagline}
          </p>
        )}

        <div className="mt-auto flex items-baseline gap-2 pt-1">
          <span className="text-lg font-extrabold">
            {formatCents(game.currentPriceCents, game.currency)}
          </span>
          <span className="text-xs text-muted-foreground line-through">
            {formatCents(game.regularPriceCents, game.currency)}
          </span>
        </div>

        {storeHref ? (
          <a
            href={storeHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {game.storeName ? `Buy on ${game.storeName}` : "View deal"}
            <ExternalLink className="size-3.5" />
          </a>
        ) : (
          <Link
            href={`/games/${game.slug}`}
            className="inline-flex items-center justify-center rounded-lg border border-border px-3 py-2 text-xs font-bold transition-colors hover:border-primary/60"
          >
            View game
          </Link>
        )}
      </div>
    </div>
  );
}
