"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type StoreRow = {
  slug: string;
  name: string;
  baseUrl: string;
  active: boolean;
  matchingEnabled: boolean;
  priceRefreshEnabled: boolean;
  affiliateDefault: boolean;
  discovery: string;
  feedUrl: string;
  capabilities: {
    livePrice: boolean;
    titleSearch: boolean;
    feedIngest: boolean;
    freeOfferIngest: boolean;
    discovery: string;
  } | null;
  lastFeed: { startedAt: string; status: string } | null;
  lastMatch: { startedAt: string; status: string } | null;
  lastFreeOffers: { startedAt: string; status: string } | null;
};

function Badge({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
        on ? "bg-play/15 text-play" : "bg-muted text-muted-foreground"
      }`}
    >
      {label}
    </span>
  );
}

export function EcommerceStoresManager() {
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const router = useRouter();

  async function load() {
    const res = await fetch("/api/admin/ecommerce/stores");
    const json = (await res.json()) as { stores?: StoreRow[]; error?: string };
    if (!res.ok) {
      setError(json.error || "Could not load stores.");
      return;
    }
    setStores(json.stores ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function patch(slug: string, partial: Record<string, unknown>) {
    setBusy(slug);
    await fetch("/api/admin/ecommerce/stores", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug, ...partial }),
    });
    await load();
    router.refresh();
    setBusy(null);
  }

  async function ingest(slug: string) {
    setBusy(slug);
    setError(null);
    const res = await fetch("/api/admin/ecommerce/feeds/ingest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ store: slug }),
    });
    const json = (await res.json()) as { error?: string; found?: number };
    if (!res.ok) setError(json.error || "Feed ingest failed.");
    await load();
    router.refresh();
    setBusy(null);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Stores do not all work the same way. Some expose a catalog API, some publish a product
        feed you paste here, and some have neither — those stay manual: paste a product URL on
        the game. This page cannot invent a new storefront protocol.
      </p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="space-y-3">
        {stores.map((store) => {
          const caps = store.capabilities;
          return (
            <article key={store.slug} className="space-y-3 rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-extrabold">{store.name}</h2>
                  <p className="text-xs text-muted-foreground">{store.baseUrl}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Badge on={Boolean(caps?.titleSearch)} label="API search" />
                  <Badge on={Boolean(caps?.livePrice)} label="Live price" />
                  <Badge on={Boolean(caps?.feedIngest)} label="Feed ingest" />
                  <Badge on={Boolean(caps?.freeOfferIngest)} label="Free offers" />
                  <Badge on={store.discovery === "manual"} label="Manual URL" />
                </div>
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={store.active}
                    disabled={busy === store.slug}
                    onChange={(e) => void patch(store.slug, { active: e.target.checked })}
                  />
                  Active
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={store.matchingEnabled}
                    disabled={busy === store.slug || (!caps?.titleSearch && !caps?.feedIngest)}
                    onChange={(e) => void patch(store.slug, { matchingEnabled: e.target.checked })}
                  />
                  Auto-match
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={store.priceRefreshEnabled}
                    disabled={busy === store.slug || !caps?.livePrice}
                    onChange={(e) => void patch(store.slug, { priceRefreshEnabled: e.target.checked })}
                  />
                  Refresh prices
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={store.affiliateDefault}
                    disabled={busy === store.slug}
                    onChange={(e) => void patch(store.slug, { affiliateDefault: e.target.checked })}
                  />
                  Affiliate by default
                </label>
              </div>
              {caps?.feedIngest ? (
                <div className="space-y-1">
                  <label className="block text-xs font-bold tracking-wide text-muted-foreground uppercase">
                    Product feed URL
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="url"
                      className="min-w-[16rem] flex-1 rounded-lg border border-border bg-secondary px-3 py-2 text-sm"
                      defaultValue={store.feedUrl}
                      placeholder="https://… csv, json, or xml"
                      onBlur={(e) => {
                        const next = e.currentTarget.value.trim();
                        if (next !== (store.feedUrl || "")) void patch(store.slug, { feedUrl: next });
                      }}
                    />
                    <button
                      type="button"
                      disabled={busy === store.slug || !store.feedUrl}
                      onClick={() => void ingest(store.slug)}
                      className="rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold disabled:opacity-50"
                    >
                      Ingest feed
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    CSV, JSON, or merchant XML. Matching uses the last ingested titles.
                    {store.lastFeed
                      ? ` Last ingest ${new Date(store.lastFeed.startedAt).toLocaleString()} (${store.lastFeed.status}).`
                      : ""}
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  {caps?.titleSearch
                    ? "Matched from this store’s public catalog API. You can still paste a product URL on a game."
                    : "No catalog API or feed. Paste a product URL on the game when you have one."}
                </p>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
