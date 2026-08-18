"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { Game } from "@/lib/data/types";
import type { RetailOffer } from "@/lib/access/types";
import { formatCents, gameRequiresPurchase } from "@/lib/access/resolver";
import { activeOffers, bestPurchase } from "@/lib/access/offers";
import { withOutboundUtm } from "@/lib/utm";
import { TelemetryAnchor } from "@/components/TelemetryAnchor";
import { useGameTier } from "@/components/AccessTiersProvider";
import { cn } from "@/lib/utils";

const ctaSizes = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
  lg: "h-12 px-7 text-base",
};

function purchaseHref(offer: RetailOffer, slug: string): string {
  return withOutboundUtm(offer.url, { campaign: "game_get", content: slug });
}

export function GetGameCta({
  game,
  offer,
  size = "md",
  className,
}: {
  game: Game;
  offer?: RetailOffer | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const buy = offer ?? bestPurchase(game.access);
  if (!buy) return null;
  const href = purchaseHref(buy, game.slug);
  return (
    <TelemetryAnchor
      href={href}
      target="_blank"
      rel={buy.affiliate ? "sponsored noopener noreferrer" : "noopener noreferrer"}
      className={cn(
        "inline-flex items-center gap-2 rounded-full bg-play font-bold text-play-foreground shadow-[0_0_24px_-6px_var(--play)] transition-all hover:brightness-110 active:translate-y-px",
        ctaSizes[size],
        className
      )}
      event="purchase_clicked"
      properties={{
        gameSlug: game.slug,
        retailer: buy.retailer,
        affiliate: buy.affiliate,
        priceCents: buy.priceCents,
        surface: "get_game_cta",
      }}
    >
      <ExternalLink className={size === "lg" ? "size-5" : "size-4"} />
      Get Game — {formatCents(buy.priceCents)}
    </TelemetryAnchor>
  );
}

/**
 * Where to buy a paid title, and that PlayBound is not the shop.
 *
 * Free games render nothing. Engines that need a paid original point at that
 * game rather than pretending the engine is for sale.
 */
export function GameCommerce({ game }: { game: Game }) {
  const paid = gameRequiresPurchase(game.access);
  const buy = bestPurchase(game.access);
  const sources = activeOffers(game.access).slice().sort((a, b) => a.priceCents - b.priceCents);
  const tier = useGameTier(game.slug);
  const required = tier.requires.filter((r) => r.slug && r.slug !== game.slug);

  if (!paid) return null;

  const usual =
    game.access?.regularPriceCents &&
    buy &&
    game.access.regularPriceCents > buy.priceCents
      ? game.access.regularPriceCents
      : null;

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-lg font-bold">{buy ? `Get ${game.title}` : `To play ${game.title}`}</h2>
      {buy ? (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <p className="text-3xl font-extrabold tabular-nums">{formatCents(buy.priceCents)}</p>
          {usual ? (
            <p className="pb-1 text-sm text-muted-foreground">
              Usually {formatCents(usual)}
            </p>
          ) : null}
        </div>
      ) : game.access?.qualifyingPriceCents ? (
        <p className="mt-3 text-3xl font-extrabold tabular-nums">
          {formatCents(game.access.qualifyingPriceCents)}
        </p>
      ) : null}

      {required.length > 0 ? (
        <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
          {required.map((dep) => (
            <li key={dep.slug}>
              Requires{" "}
              <Link href={`/games/${dep.slug}`} className="font-semibold text-foreground hover:underline">
                {dep.label}
              </Link>
              {dep.currentPriceCents ?? dep.qualifyingPriceCents
                ? ` — ${formatCents(dep.currentPriceCents ?? dep.qualifyingPriceCents)}`
                : ""}
            </li>
          ))}
        </ul>
      ) : null}

      {buy ? (
        <div className="mt-4">
          <GetGameCta game={game} offer={buy} size="lg" />
        </div>
      ) : null}

      {sources.length > 0 ? (
        <ul className="mt-4 divide-y divide-border border-t border-border">
          {sources.map((source) => {
            const href = purchaseHref(source, game.slug);
            return (
              <li key={`${source.retailer}-${source.url}`}>
                <TelemetryAnchor
                  href={href}
                  target="_blank"
                  rel={source.affiliate ? "sponsored noopener noreferrer" : "noopener noreferrer"}
                  className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-primary"
                  event="purchase_clicked"
                  properties={{
                    gameSlug: game.slug,
                    retailer: source.retailer,
                    affiliate: source.affiliate,
                    priceCents: source.priceCents,
                    surface: "game_commerce_list",
                  }}
                >
                  <span className="font-semibold">
                    {source.retailer}
                    {source.affiliate ? (
                      <span className="ml-2 text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
                        Partner
                      </span>
                    ) : null}
                  </span>
                  <span className="tabular-nums">{formatCents(source.priceCents)}</span>
                </TelemetryAnchor>
              </li>
            );
          })}
        </ul>
      ) : null}

      <p className="mt-4 text-xs text-muted-foreground">
        PlayBound does not sell this game. Once you own it, install the PlayBound
        edition from the header or the Install tab.
      </p>
    </section>
  );
}
