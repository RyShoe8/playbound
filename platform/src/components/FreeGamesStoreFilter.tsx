"use client";

import { useState } from "react";
import type { StoreSlug } from "@/lib/freeOffers/types";
import { storeShortName, storeColor } from "@/lib/freeOffers/labels";
import { cn } from "@/lib/utils";

const ALL_FILTER = "all" as const;
type FilterValue = typeof ALL_FILTER | StoreSlug;

/**
 * Client-side store filter tabs for the free games section.
 *
 * Only shown when offers exist from 2+ stores. The filtering happens
 * client-side over pre-rendered cards for instant interaction.
 */
export function FreeGamesStoreFilter({
  stores,
  children,
}: {
  /** Unique stores that have active offers. */
  stores: StoreSlug[];
  /** All offer cards — filtering is done by toggling visibility. */
  children: React.ReactNode;
}) {
  const [active, setActive] = useState<FilterValue>(ALL_FILTER);

  // Don't show filter tabs when there's only one store.
  if (stores.length <= 1) return <>{children}</>;

  return (
    <div>
      {/* ── Filter tabs ─────────────────────────────────────────── */}
      <div className="mb-4 flex gap-1.5 overflow-x-auto">
        <FilterTab
          label="All"
          active={active === ALL_FILTER}
          onClick={() => setActive(ALL_FILTER)}
        />
        {stores.map((store) => (
          <FilterTab
            key={store}
            label={storeShortName(store)}
            active={active === store}
            onClick={() => setActive(store)}
            color={storeColor(store)}
          />
        ))}
      </div>

      {/* ── Cards (each card has data-store for CSS filtering) ── */}
      <div
        className="contents"
        data-active-store={active}
      >
        {children}
      </div>
    </div>
  );
}

function FilterTab({
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
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
      )}
      style={active && color ? { background: color } : undefined}
    >
      {label}
    </button>
  );
}

/**
 * Wrapper for individual cards that enables store-based filtering.
 * Uses CSS to hide/show based on the parent's data-active-store.
 */
export function FreeGameFilterable({
  store,
  children,
}: {
  store: StoreSlug;
  children: React.ReactNode;
}) {
  return (
    <div data-store={store} className="contents [div[data-active-store]:not([data-active-store='all'])_&:not([data-store=''])]:hidden">
      {children}
    </div>
  );
}
