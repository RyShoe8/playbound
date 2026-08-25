import type { Metadata } from "next";
import { Gift, Sparkles, Clock, History } from "lucide-react";
import { listActiveOffers, listRecentlyExpiredOffers } from "@/lib/freeOffers/service";
import { ActiveOffersGrid } from "@/components/ActiveOffersGrid";
import { Badge, EmptyHint, SectionHeader } from "@/components/ui/bits";
import { storeDisplayName, dateRangeLabel, offerTypeLabel } from "@/lib/freeOffers/labels";
import type { StoreSlug } from "@/lib/freeOffers/types";
import { pageMetadata } from "@/lib/seo";
import { JsonLd, graph, breadcrumbSchema } from "@/components/JsonLd";
import { absoluteUrl } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Free Games This Week — Active Giveaways & Store Promotions",
  description:
    "Claim time-limited free games from Epic Games Store, Steam, GOG, and Prime Gaming before they expire. Live promotion tracker updated continuously.",
  path: "/free-games",
});

export default async function FreeGamesPage() {
  const [activeOffers, recentlyExpired] = await Promise.all([
    listActiveOffers(),
    listRecentlyExpiredOffers(30),
  ]);

  // Group active offers by store
  const activeStores = [...new Set(activeOffers.map((o) => o.store))] as StoreSlug[];

  const offersSchema = {
    "@type": "ItemList",
    name: "Free Games This Week",
    description:
      "Active free game promotions and giveaways from Epic Games Store, Steam, GOG, and Prime Gaming.",
    url: absoluteUrl("/free-games"),
    numberOfItems: activeOffers.length,
    itemListElement: activeOffers.map((offer, i) => {
      const metaTitle = offer.metadata?.title as string | undefined;
      const title =
        offer.unmatchedTitle ||
        metaTitle ||
        (offer.gameSlug
          ? offer.gameSlug
              .replace(/[-_]+/g, " ")
              .replace(/\b\w/g, (c) => c.toUpperCase())
          : null) ||
        `${storeDisplayName(offer.store)} Free Offer`;
      return {
        "@type": "ListItem",
        position: i + 1,
        name: title,
        item: {
          "@type": "Offer",
          name: title,
          url: offer.claimUrl || offer.storeUrl || absoluteUrl("/free-games"),
          price: "0",
          priceCurrency: "USD",
          availability: "https://schema.org/InStock",
          seller: {
            "@type": "Organization",
            name: storeDisplayName(offer.store),
          },
          ...(offer.startDate ? { validFrom: new Date(offer.startDate).toISOString() } : {}),
          ...(offer.endDate ? { validThrough: new Date(offer.endDate).toISOString() } : {}),
        },
      };
    }),
  };

  return (
    <div className="space-y-12 px-4 py-8 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <JsonLd
        data={graph(
          offersSchema,
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Free Games", path: "/free-games" },
          ])
        )}
      />
      {/* ── Page Header ─────────────────────────────────────────── */}
      <header className="max-w-3xl space-y-3">
        <Badge tone="play" className="w-fit">
          <Gift className="size-3.5" /> Free Promotions Aggregator
        </Badge>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Free Games This Week
        </h1>
        <p className="text-base text-muted-foreground sm:text-lg">
          Discover and claim time-limited free games from Epic Games Store, Steam, GOG, and Prime Gaming before they expire.
        </p>
      </header>

      {/* ── Active Offers Section ──────────────────────────────── */}
      <section className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Active Giveaways & Promotions</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Claim these games right now to keep permanently or play during free access windows.
          </p>
        </div>

        <ActiveOffersGrid offers={activeOffers} />
      </section>

      {/* ── Recently Free Archive Section ─────────────────────── */}
      {recentlyExpired.length > 0 && (
        <section className="space-y-6 pt-6 border-t border-border">
          <div>
            <div className="flex items-center gap-2">
              <History className="size-5 text-muted-foreground" />
              <h2 className="text-2xl font-bold tracking-tight">Recently Free</h2>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Promotions that ended in the last 30 days. Historical promotion records are preserved permanently.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recentlyExpired.map((offer) => {
              const metaTitle = offer.metadata?.title as string | undefined;
              const displayTitle =
                (metaTitle && !/^[0-9a-f]{16,}$/i.test(metaTitle) ? metaTitle : null) ||
                (offer.unmatchedTitle && !/^[0-9a-f]{16,}$/i.test(offer.unmatchedTitle)
                  ? offer.unmatchedTitle
                  : null) ||
                (offer.gameSlug && !/^[0-9a-f]{16,}$/i.test(offer.gameSlug)
                  ? offer.gameSlug
                      .replace(/[-_][a-f0-9]{5,}$/i, "")
                      .replace(/[-_]+/g, " ")
                      .replace(/\b\w/g, (c) => c.toUpperCase())
                      .trim()
                  : null) ||
                `${storeDisplayName(offer.store)} Offer`;
              const storeName = storeDisplayName(offer.store);
              const dates = dateRangeLabel(offer.startDate, offer.endDate);
              const typeLabel = offerTypeLabel(offer.offerType, offer.store);

              return (
                <div
                  key={`${offer.store}-${offer.externalId}`}
                  className="rounded-xl border border-border bg-card p-4 flex flex-col justify-between gap-3 opacity-80 transition-opacity hover:opacity-100"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-muted-foreground">
                        {storeName}
                      </span>
                      <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {typeLabel}
                      </span>
                    </div>
                    <p className="font-semibold text-sm line-clamp-1">{displayTitle}</p>
                    <p className="text-xs text-muted-foreground">{dates}</p>
                  </div>

                  {offer.storeUrl && (
                    <a
                      href={offer.storeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      View on {storeName} →
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
