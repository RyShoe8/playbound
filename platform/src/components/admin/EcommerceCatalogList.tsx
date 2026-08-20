"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { EcommerceMatchButton } from "@/components/admin/EcommerceMatchButton";
import { EcommerceSuggestionActions } from "@/components/admin/EcommerceSuggestionActions";
import { formatCents } from "@/lib/access/resolver";

export type EcommerceOfferRow = {
  retailer: string;
  url: string;
  priceCents: number;
  isActive: boolean;
  matchSource: "auto" | "manual";
};

export type EcommerceSuggestionRow = {
  id: string;
  retailer: string;
  candidates: Array<{ title: string; url: string; priceCents: number | null }>;
};

export type EcommerceGameRow = {
  slug: string;
  title: string;
  priceType: string | null;
  offers: EcommerceOfferRow[];
  suggestions: EcommerceSuggestionRow[];
};

function formatPrice(cents: number): string {
  return formatCents(cents);
}

export function EcommerceCatalogList({ games }: { games: EcommerceGameRow[] }) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState(games);
  const [busyUrl, setBusyUrl] = useState<string | null>(null);

  useEffect(() => {
    setRows(games);
  }, [games]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (g) => g.title.toLowerCase().includes(q) || g.slug.toLowerCase().includes(q)
    );
  }, [query, rows]);

  async function toggleDisplay(slug: string, url: string, isActive: boolean) {
    const key = `${slug}|${url}`;
    setBusyUrl(key);
    setRows((prev) =>
      prev.map((g) =>
        g.slug === slug
          ? { ...g, offers: g.offers.map((o) => (o.url === url ? { ...o, isActive } : o)) }
          : g
      )
    );
    try {
      const res = await fetch("/api/admin/ecommerce/offers", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, url, isActive }),
      });
      if (!res.ok) {
        setRows((prev) =>
          prev.map((g) =>
            g.slug === slug
              ? {
                  ...g,
                  offers: g.offers.map((o) => (o.url === url ? { ...o, isActive: !isActive } : o)),
                }
              : g
          )
        );
      }
    } catch {
      setRows((prev) =>
        prev.map((g) =>
          g.slug === slug
            ? {
                ...g,
                offers: g.offers.map((o) => (o.url === url ? { ...o, isActive: !isActive } : o)),
              }
            : g
        )
      );
    } finally {
      setBusyUrl(null);
    }
  }

  async function removeOffer(slug: string, url: string) {
    const key = `${slug}|${url}`;
    const previous = rows;
    setBusyUrl(key);
    setRows((prev) =>
      prev.map((g) =>
        g.slug === slug
          ? { ...g, offers: g.offers.filter((o) => o.url !== url) }
          : g
      )
    );
    try {
      const res = await fetch("/api/admin/ecommerce/offers", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, url }),
      });
      if (!res.ok) {
        setRows(previous);
      }
    } catch {
      setRows(previous);
    } finally {
      setBusyUrl(null);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Master Copies ({filtered.length})</h2>
          <p className="text-sm text-muted-foreground">
            Master copies and store purchase listings. Display controls which stores appear on the game
            page; Match fills Steam, GOG, Epic, and feed-backed stores.
          </p>
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by title…"
          className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm sm:w-72"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No games match that filter.</p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((game) => {
            const paidEmpty = game.priceType === "PAID" && game.offers.length === 0;
            return (
              <li key={game.slug} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/admin/games/${game.slug}/edit`}
                      className="font-bold hover:underline"
                    >
                      {game.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {game.slug}
                      {game.priceType ? ` · ${game.priceType}` : ""}
                      {paidEmpty ? " · no purchase sources" : ""}
                    </p>
                  </div>
                  <EcommerceMatchButton slug={game.slug} label="Match" />
                </div>

                {game.offers.length === 0 ? (
                  <p className="mt-3 text-xs text-muted-foreground">No store listings yet.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-border border-t border-border">
                    {game.offers.map((offer) => {
                      const busy = busyUrl === `${game.slug}|${offer.url}`;
                      return (
                        <li
                          key={offer.url}
                          className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm"
                        >
                          <span className="min-w-[8rem] font-semibold">{offer.retailer}</span>
                          <span className="tabular-nums">{formatPrice(offer.priceCents)}</span>
                          <span className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
                            {offer.matchSource}
                          </span>
                          <a
                            href={offer.url}
                            target="_blank"
                            rel="noreferrer"
                            className="truncate text-xs text-primary hover:underline sm:max-w-xs"
                          >
                            {offer.url.replace(/^https?:\/\//, "")}
                          </a>
                          <div className="ml-auto flex items-center gap-3">
                            <label className="flex items-center gap-2 text-xs font-semibold">
                              <input
                                type="checkbox"
                                checked={offer.isActive}
                                disabled={busy}
                                onChange={(e) =>
                                  void toggleDisplay(game.slug, offer.url, e.target.checked)
                                }
                              />
                              Display
                            </label>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void removeOffer(game.slug, offer.url)}
                              className="text-xs font-semibold text-muted-foreground hover:text-destructive disabled:opacity-50"
                            >
                              Remove
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {game.suggestions.length > 0 ? (
                  <div className="mt-3 space-y-2 rounded-lg border border-dashed border-border bg-secondary/40 p-3">
                    <p className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
                      Pending matches
                    </p>
                    {game.suggestions.map((s) => (
                      <div key={s.id}>
                        <p className="text-xs font-semibold">{s.retailer}</p>
                        <EcommerceSuggestionActions id={s.id} candidates={s.candidates} />
                      </div>
                    ))}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
