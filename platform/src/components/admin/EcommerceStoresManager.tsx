"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type StoreRow = {
  slug: string;
  name: string;
  baseUrl: string;
  matchingEnabled: boolean;
  priceRefreshEnabled: boolean;
  freeOffersEnabled: boolean;
  affiliateDefault: boolean;
  affiliateId: string;
  affiliateParam: string;
  defaultAffiliateParam: string;
  discovery: string;
  feedUrl: string;
  capabilities: {
    livePrice: boolean;
    titleSearch: boolean;
    feedIngest: boolean;
    freeOfferIngest: boolean;
    retailer: string | null;
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
    setError(null);
    const res = await fetch("/api/admin/ecommerce/stores", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug, ...partial }),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) setError(json.error || "Could not save.");
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

  async function upload(slug: string, file: File) {
    setBusy(slug);
    setError(null);
    const body = new FormData();
    body.set("store", slug);
    body.set("file", file);
    const res = await fetch("/api/admin/ecommerce/feeds/ingest", {
      method: "POST",
      body,
    });
    const json = (await res.json()) as { error?: string; found?: number };
    if (!res.ok) setError(json.error || "Feed upload failed.");
    else if (json.found === 0) setError("No products found in that feed.");
    await load();
    router.refresh();
    setBusy(null);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Free offers and paid purchase sources are separate. A store can ingest giveaways
        without being an affiliate. Affiliate IDs are optional and only stamped on Get Game
        links — not on free-offer claim URLs.
      </p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="space-y-3">
        {stores.map((store) => {
          const caps = store.capabilities;
          const paid = Boolean(caps?.retailer);
          return (
            <article key={store.slug} className="space-y-4 rounded-xl border border-border bg-card p-4">
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

              {caps?.freeOfferIngest ? (
                <div className="space-y-1">
                  <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
                    Free offers
                  </p>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={store.freeOffersEnabled}
                      disabled={busy === store.slug}
                      onChange={(e) =>
                        void patch(store.slug, { freeOffersEnabled: e.target.checked })
                      }
                    />
                    Ingest giveaways
                  </label>
                  <p className="text-[11px] text-muted-foreground">
                    Independent of affiliates. Last run{" "}
                    {store.lastFreeOffers
                      ? `${new Date(store.lastFreeOffers.startedAt).toLocaleString()} (${store.lastFreeOffers.status})`
                      : "never"}
                    .
                  </p>
                </div>
              ) : null}

              {paid ? (
                <div className="space-y-3">
                  <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
                    Purchase sources
                  </p>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={store.matchingEnabled}
                        disabled={busy === store.slug || (!caps?.titleSearch && !caps?.feedIngest)}
                        onChange={(e) =>
                          void patch(store.slug, { matchingEnabled: e.target.checked })
                        }
                      />
                      Auto-match
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={store.priceRefreshEnabled}
                        disabled={busy === store.slug || !caps?.livePrice}
                        onChange={(e) =>
                          void patch(store.slug, { priceRefreshEnabled: e.target.checked })
                        }
                      />
                      Refresh prices
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={store.affiliateDefault}
                        disabled={busy === store.slug}
                        onChange={(e) =>
                          void patch(store.slug, { affiliateDefault: e.target.checked })
                        }
                      />
                      Affiliate by default
                    </label>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
                        Affiliate ID
                      </span>
                      <input
                        key={`aff-id-${store.slug}-${store.affiliateId}`}
                        type="text"
                        defaultValue={store.affiliateId}
                        placeholder="optional"
                        className="mt-1 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm"
                        onBlur={(e) => {
                          const next = e.currentTarget.value.trim();
                          if (next !== (store.affiliateId || "")) {
                            void patch(store.slug, { affiliateId: next });
                          }
                        }}
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
                        Query param
                      </span>
                      <input
                        key={`aff-param-${store.slug}-${store.affiliateParam}`}
                        type="text"
                        defaultValue={store.affiliateParam}
                        placeholder={store.defaultAffiliateParam || "e.g. partner"}
                        className="mt-1 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm"
                        onBlur={(e) => {
                          const next = e.currentTarget.value.trim();
                          if (next !== (store.affiliateParam || "")) {
                            void patch(store.slug, { affiliateParam: next });
                          }
                        }}
                      />
                    </label>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Optional. Stamped on Get Game links when the source is marked affiliate.
                    Leave the param blank to use {store.defaultAffiliateParam || "nothing until you set one"}.
                  </p>
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
                            if (next !== (store.feedUrl || "")) {
                              void patch(store.slug, { feedUrl: next });
                            }
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
                      <label className="block text-xs font-bold tracking-wide text-muted-foreground uppercase">
                        Or upload a feed
                      </label>
                      <input
                        type="file"
                        accept=".csv,.tsv,.txt,.json,.xml,.rss,.atom,text/csv,application/json,application/xml,text/xml,text/plain"
                        disabled={busy === store.slug}
                        className="block w-full text-sm file:mr-2 file:rounded-full file:border file:border-border file:bg-secondary file:px-3 file:py-1.5 file:text-xs file:font-bold"
                        onChange={(e) => {
                          const file = e.currentTarget.files?.[0];
                          e.currentTarget.value = "";
                          if (file) void upload(store.slug, file);
                        }}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Optional. Same formats as the URL. Max 8MB. The file is parsed and not kept.
                      </p>
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      {caps?.titleSearch
                        ? "Matched from this store’s public catalog API. You can still paste a product URL on a game."
                        : "No catalog API or feed. Paste a product URL on the game when you have one."}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Promotions only. No purchase sources or affiliate ID on this store.
                </p>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
