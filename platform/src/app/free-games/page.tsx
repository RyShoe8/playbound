import { Gift, Sparkles, Clock, History } from "lucide-react";
import { listActiveOffers, listRecentlyExpiredOffers } from "@/lib/freeOffers/service";
import { FreeGameCard } from "@/components/FreeGameCard";
import { Badge, EmptyHint, SectionHeader } from "@/components/ui/bits";
import { storeDisplayName, dateRangeLabel, offerTypeLabel } from "@/lib/freeOffers/labels";
import type { StoreSlug } from "@/lib/freeOffers/types";

export default async function FreeGamesPage() {
  const [activeOffers, recentlyExpired] = await Promise.all([
    listActiveOffers(),
    listRecentlyExpiredOffers(30),
  ]);

  // Group active offers by store
  const activeStores = [...new Set(activeOffers.map((o) => o.store))] as StoreSlug[];

  return (
    <div className="space-y-12 px-4 py-8 sm:px-6 lg:px-8 max-w-7xl mx-auto">
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

        {activeOffers.length === 0 ? (
          <EmptyHint icon={Gift}>
            <p className="font-semibold">No active promotions right now</p>
            <p className="text-xs">Check back soon! New giveaways are added weekly.</p>
          </EmptyHint>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {activeOffers.map((offer) => (
              <FreeGameCard
                key={`${offer.store}-${offer.externalId}`}
                offer={offer}
                playboundSupported={
                  offer.matchConfidence === "exact" || offer.matchConfidence === "high"
                }
                className="w-full sm:w-full"
              />
            ))}
          </div>
        )}
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
              const displayTitle =
                (offer.metadata?.title as string | undefined) ||
                offer.unmatchedTitle ||
                offer.externalId;
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
