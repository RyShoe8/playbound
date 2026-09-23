"use client";

import { useMemo, useState } from "react";
import { Gift, Tag } from "lucide-react";
import type { FreeOfferRecord } from "@/lib/freeOffers/types";
import { storeShortName, storeColor } from "@/lib/freeOffers/labels";
import type { DiscountedGame } from "@/lib/dealsShared";
import { ActiveOffersGrid } from "@/components/ActiveOffersGrid";
import { DiscountedGameCard } from "@/components/DiscountedGameCard";
import { EmptyHint } from "@/components/ui/bits";
import { cn } from "@/lib/utils";

/**
 * The filter bar and both result sections for /deals.
 *
 * A client component because the filtering is instant and the data is already
 * on the page — refetching or navigating to change a chip would be slower and
 * worse. The server component above it keeps the fetching, the JSON-LD and the
 * standing editorial copy.
 *
 * Two independent filters, deliberately:
 *   - **Kind** narrows to free giveaways or discounts. It hides the other
 *     section outright rather than emptying it, because an empty section under
 *     a heading reads as "nothing here" when the truth is "you filtered it out".
 *   - **Store** narrows both at once, on the shared `storeKey` vocabulary that
 *     lib/deals.ts normalises retailer names onto.
 *
 * Note this does not replace the device-compatibility filter. That still lives
 * in ActiveOffersGrid and composes underneath: this decides which offers are
 * eligible, and that decides which of them run on the viewer's machine.
 */

type Kind = "all" | "free" | "discounted";
const ALL_STORES = "all" as const;

type StoreOption = { key: string; label: string; color?: string };

export function DealsBrowser({
  offers,
  discounted,
  minPercentOff,
}: {
  offers: FreeOfferRecord[];
  discounted: DiscountedGame[];
  minPercentOff: number;
}) {
  const [kind, setKind] = useState<Kind>("all");
  const [store, setStore] = useState<string>(ALL_STORES);

  /*
   * Options come from what is actually on the page, not from the full store
   * vocabulary. Offering a filter that can only ever return nothing is a worse
   * experience than not offering it.
   */
  const storeOptions = useMemo<StoreOption[]>(() => {
    const seen = new Map<string, StoreOption>();
    for (const o of offers) {
      if (!seen.has(o.store)) {
        seen.set(o.store, {
          key: o.store,
          label: storeShortName(o.store),
          color: storeColor(o.store),
        });
      }
    }
    for (const g of discounted) {
      if (g.storeKey && !seen.has(g.storeKey)) {
        seen.set(g.storeKey, { key: g.storeKey, label: g.storeName ?? g.storeKey });
      }
    }
    return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [offers, discounted]);

  const visibleOffers = useMemo(
    () => (store === ALL_STORES ? offers : offers.filter((o) => o.store === store)),
    [offers, store]
  );
  const visibleDiscounted = useMemo(
    () => (store === ALL_STORES ? discounted : discounted.filter((g) => g.storeKey === store)),
    [discounted, store]
  );

  const showFree = kind !== "discounted";
  const showDiscounted = kind !== "free";
  const nothingAtAll =
    (!showFree || visibleOffers.length === 0) &&
    (!showDiscounted || visibleDiscounted.length === 0);

  return (
    <div className="space-y-8">
      {/* ── Filters ─────────────────────────────────────────────── */}
      <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <FilterRow label="Show">
          <Chip label="All deals" active={kind === "all"} onClick={() => setKind("all")} />
          <Chip
            label={`Free (${offers.length})`}
            active={kind === "free"}
            onClick={() => setKind("free")}
          />
          <Chip
            label={`${minPercentOff}% off or more (${discounted.length})`}
            active={kind === "discounted"}
            onClick={() => setKind("discounted")}
          />
        </FilterRow>

        {storeOptions.length > 1 && (
          <FilterRow label="Store">
            <Chip
              label="All stores"
              active={store === ALL_STORES}
              onClick={() => setStore(ALL_STORES)}
            />
            {storeOptions.map((opt) => (
              <Chip
                key={opt.key}
                label={opt.label}
                active={store === opt.key}
                color={opt.color}
                onClick={() => setStore(opt.key)}
              />
            ))}
          </FilterRow>
        )}
      </div>

      {nothingAtAll && (
        <EmptyHint icon={Gift}>
          <p className="font-semibold">Nothing matches those filters</p>
          <p className="text-xs">
            Try &ldquo;All deals&rdquo; and &ldquo;All stores&rdquo; to see everything currently
            available.
          </p>
        </EmptyHint>
      )}

      {/* ── Discounts ───────────────────────────────────────────── */}
      {showDiscounted && visibleDiscounted.length > 0 && (
        <section className="space-y-4">
          <div>
            <div className="flex items-center gap-2">
              <Tag className="size-5 text-muted-foreground" />
              <h2 className="text-2xl font-bold tracking-tight">On sale now</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {visibleDiscounted.length === 1 ? "One catalog game" : `${visibleDiscounted.length} catalog games`}{" "}
              at {minPercentOff}% off or more. Every one has already cleared the PlayBound
              Bar — the discount is why it is on this page, not why we recommend it.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {visibleDiscounted.map((game, i) => (
              <DiscountedGameCard
                key={game.slug || `${game.storeKey || "deal"}-${game.title}-${game.currentPriceCents}-${i}`}
                game={game}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Free giveaways ──────────────────────────────────────── */}
      {showFree && visibleOffers.length > 0 && (
        <section className="space-y-4">
          <div>
            <div className="flex items-center gap-2">
              <Gift className="size-5 text-muted-foreground" />
              <h2 className="text-2xl font-bold tracking-tight">Free right now</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {visibleOffers.length === 1 ? "One time-limited giveaway" : `${visibleOffers.length} time-limited giveaways`}{" "}
              you can claim before they expire.
            </p>
          </div>
          <ActiveOffersGrid offers={visibleOffers} />
        </section>
      )}
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-12 shrink-0 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({
  label,
  active,
  onClick,
  color,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
      )}
      // A store's own colour only reads as "selected" when it is the active
      // chip; unselected chips stay neutral so the row does not become a
      // rainbow the eye cannot parse.
      style={active && color ? { background: color, color: "#fff" } : undefined}
    >
      {label}
    </button>
  );
}
