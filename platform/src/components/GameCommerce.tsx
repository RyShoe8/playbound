"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { Game } from "@/lib/data/types";
import type { RetailOffer } from "@/lib/access/types";
import { formatCents, gameRequiresPurchase } from "@/lib/access/resolver";
import { activeOffers, bestPurchase, heroPurchases } from "@/lib/access/offers";
import { withOutboundUtm } from "@/lib/utm";
import { withStoreAffiliate } from "@/lib/access/storeUrls";
import { TelemetryAnchor } from "@/components/TelemetryAnchor";
import { useGameTier } from "@/components/AccessTiersProvider";
import { cn } from "@/lib/utils";

export type StoreAffiliateMap = Record<string, { id: string; param: string }>;

const ctaSizes = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
  lg: "h-12 px-7 text-base",
};

function purchaseHref(offer: RetailOffer, slug: string, affiliates: StoreAffiliateMap = {}): string {
  const stamp = affiliates[offer.retailer];
  const tagged = withStoreAffiliate(offer.url, {
    affiliate: offer.affiliate,
    id: stamp?.id,
    param: stamp?.param,
  });
  return withOutboundUtm(tagged, { campaign: "game_get", content: slug });
}

export function GetGameCta({
  game,
  offer,
  size = "md",
  className,
  affiliates,
}: {
  game: Game;
  offer?: RetailOffer | null;
  size?: "sm" | "md" | "lg";
  className?: string;
  affiliates?: StoreAffiliateMap;
}) {
  const buy = offer ?? bestPurchase(game.access);
  if (!buy) return null;
  const href = purchaseHref(buy, game.slug, affiliates);
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

function StoreOfferButton({
  game,
  offer,
  size = "md",
  affiliates,
}: {
  game: Game;
  offer: RetailOffer;
  size?: "sm" | "md" | "lg";
  affiliates?: StoreAffiliateMap;
}) {
  const href = purchaseHref(offer, game.slug, affiliates);
  return (
    <TelemetryAnchor
      href={href}
      target="_blank"
      rel={offer.affiliate ? "sponsored noopener noreferrer" : "noopener noreferrer"}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-border bg-background/80 font-bold text-foreground transition-all hover:border-play hover:text-play active:translate-y-px",
        ctaSizes[size]
      )}
      event="purchase_clicked"
      properties={{
        gameSlug: game.slug,
        retailer: offer.retailer,
        affiliate: offer.affiliate,
        priceCents: offer.priceCents,
        surface: "get_game_store",
      }}
    >
      {offer.retailer} — {formatCents(offer.priceCents)}
    </TelemetryAnchor>
  );
}

/** Cheapest Get Game plus every other displayed store. */
export function GetGameStoreButtons({
  game,
  size = "md",
  affiliates,
}: {
  game: Game;
  size?: "sm" | "md" | "lg";
  affiliates?: StoreAffiliateMap;
}) {
  const { primary, secondary } = heroPurchases(game.access);
  if (!primary) return null;
  return (
    <>
      <GetGameCta game={game} offer={primary} size={size} affiliates={affiliates} />
      {secondary.map((offer) => (
        <StoreOfferButton
          key={`${offer.retailer}-${offer.url}`}
          game={game}
          offer={offer}
          size={size}
          affiliates={affiliates}
        />
      ))}
    </>
  );
}

/**
 * Where to buy a paid title, and that PlayBound is not the shop.
 *
 * Free games render nothing. Engines that need a paid original point at that
 * game rather than pretending the engine is for sale.
 */
export function GameCommerce({
  game,
  affiliates,
}: {
  game: Game;
  affiliates?: StoreAffiliateMap;
}) {
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
    <section className="max-w-md rounded-xl border border-border bg-card p-5">
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
          <GetGameCta game={game} offer={buy} size="lg" affiliates={affiliates} />
        </div>
      ) : null}

      {sources.length > 0 ? (
        <ul className="mt-4 divide-y divide-border border-t border-border">
          {sources.map((source) => {
            const href = purchaseHref(source, game.slug, affiliates);
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
