import { Gift } from "lucide-react";
import { Badge } from "@/components/ui/bits";
import { listActiveOffers } from "@/lib/freeOffers/service";
import { FreeGamesSectionClient } from "@/components/FreeGamesSectionClient";

/**
 * Homepage "Free Games This Week" section.
 *
 * Server component — reads active offers from the cached service.
 * Delegates to FreeGamesSectionClient for dynamic device compatibility filtering.
 * Hidden gracefully when no active offers exist.
 */
export async function FreeGamesSection() {
  const offers = await listActiveOffers();
  if (offers.length === 0) return null;

  return <FreeGamesSectionClient offers={offers} />;
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
        {[1, 2, 3, 4].map((i) => (
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
