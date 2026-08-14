import { Gift } from "lucide-react";
import { listActiveOffers } from "@/lib/freeOffers/service";
import { FreeGameCard, FreeGameCardRow } from "@/components/FreeGameCard";
import { Badge, SectionHeader } from "@/components/ui/bits";
import type { StoreSlug } from "@/lib/freeOffers/types";

/**
 * Homepage "Free Games This Week" section.
 *
 * Server component — reads active offers from the cached service.
 * Hidden gracefully when no active offers exist.
 */
export async function FreeGamesSection() {
  const offers = await listActiveOffers();
  if (offers.length === 0) return null;

  // Determine unique stores for potential filtering.
  const stores = [...new Set(offers.map((o) => o.store))] as StoreSlug[];

  // Group by store for display.
  const grouped = new Map<StoreSlug, typeof offers>();
  for (const offer of offers) {
    const list = grouped.get(offer.store) ?? [];
    list.push(offer);
    grouped.set(offer.store, list);
  }

  return (
    <section id="free-games-this-week">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <Badge tone="play" className="mb-2">
            <Gift className="size-3" /> Free Games
          </Badge>
          <h2 className="text-xl font-bold tracking-tight">
            🎁 Free Games This Week
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Claim these games before their free offers expire.
          </p>
        </div>
        <a
          href="/free-games"
          className="shrink-0 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          See all free games →
        </a>
      </div>

      {/* If only one store, show a flat row. If multiple, group by store. */}
      {stores.length <= 1 ? (
        <FreeGameCardRow>
          {offers.map((offer) => (
            <FreeGameCard
              key={`${offer.store}-${offer.externalId}`}
              offer={offer}
              playboundSupported={offer.matchConfidence === "exact" || offer.matchConfidence === "high"}
            />
          ))}
        </FreeGameCardRow>
      ) : (
        <div className="space-y-6">
          {/* Store filter tabs */}
          <div className="flex gap-2 overflow-x-auto">
            {stores.map((store) => (
              <a
                key={store}
                href={`#free-games-${store}`}
                className="shrink-0 rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground transition-colors hover:bg-secondary/80"
              >
                {storeLabel(store)} ({grouped.get(store)?.length ?? 0})
              </a>
            ))}
          </div>

          {/* Grouped cards */}
          {stores.map((store) => {
            const storeOffers = grouped.get(store) ?? [];
            return (
              <div key={store} id={`free-games-${store}`}>
                <p className="mb-2 text-sm font-semibold text-muted-foreground">
                  {storeLabel(store)}
                </p>
                <FreeGameCardRow>
                  {storeOffers.map((offer) => (
                    <FreeGameCard
                      key={`${offer.store}-${offer.externalId}`}
                      offer={offer}
                      playboundSupported={
                        offer.matchConfidence === "exact" || offer.matchConfidence === "high"
                      }
                    />
                  ))}
                </FreeGameCardRow>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function storeLabel(store: StoreSlug): string {
  const labels: Record<StoreSlug, string> = {
    epic: "Epic Games Store",
    steam: "Steam",
    gog: "GOG",
    prime_gaming: "Amazon Prime Gaming",
  };
  return labels[store] ?? store;
}

/** Loading fallback for Suspense boundary. */
export function FreeGamesSectionFallback() {
  return (
    <section>
      <div className="mb-4">
        <Badge tone="play" className="mb-2">
          <Gift className="size-3" /> Free Games
        </Badge>
        <h2 className="text-xl font-bold tracking-tight">
          🎁 Free Games This Week
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Loading free games…
        </p>
      </div>
      <div className="flex gap-4 overflow-hidden">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="w-52 shrink-0 animate-pulse rounded-xl border border-border bg-card sm:w-56"
          >
            <div className="aspect-[16/9] rounded-t-xl bg-muted" />
            <div className="space-y-2 p-3">
              <div className="h-4 w-3/4 rounded bg-muted" />
              <div className="h-3 w-1/2 rounded bg-muted" />
              <div className="h-8 rounded-lg bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
