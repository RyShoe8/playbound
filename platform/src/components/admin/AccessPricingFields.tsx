"use client";

import { useMemo, useState } from "react";
import type { GamePayload } from "@/lib/gamePayload";
import type { AccessTier, PriceType } from "@/lib/access/types";
import { formatCents, gameRequiresPurchase } from "@/lib/access/resolver";
import { bestPurchase, KNOWN_RETAILERS } from "@/lib/access/offers";
import { detectRetailer, retailerHasLivePrice } from "@/lib/access/storeUrls";
import { tierFor, type GameTierMap } from "@/lib/access/tierMap";
import type { RetailOffer } from "@/lib/access/types";

type Access = NonNullable<GamePayload["access"]>;
type CatalogPick = { slug: string; title: string; priceType?: PriceType };

function centsToInput(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}

function inputToCents(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number.parseFloat(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function previewTier(access: Access | null | undefined, tiers: GameTierMap): AccessTier {
  if (gameRequiresPurchase(access ?? undefined)) return "VALUE";
  for (const slug of access?.requiresGameSlugs ?? []) {
    if (tierFor(tiers, slug).tier === "VALUE") return "VALUE";
  }
  return "FREE";
}

const TYPES: { value: PriceType; label: string; hint: string }[] = [
  { value: "FREE", label: "Free", hint: "No purchase anywhere in the chain." },
  { value: "PAID", label: "Paid", hint: "The player buys this game." },
  {
    value: "PAID_BASE_GAME_REQUIRED",
    label: "Free but requires paid base game",
    hint: "Engine or port that needs commercial files or a licence.",
  },
];

export function AccessPricingFields({
  value,
  catalogGames,
  catalogTiers,
  onChange,
  gameSlug,
}: {
  value: Access | null | undefined;
  catalogGames: CatalogPick[];
  catalogTiers: GameTierMap;
  onChange: (next: Access | null) => void;
  gameSlug?: string;
}) {
  const access: Access = value ?? {
    priceType: "FREE",
    regularPriceCents: 0,
    currentPriceCents: 0,
    qualifyingPriceCents: 0,
    currency: "USD",
    purchaseRequired: false,
    requiresBaseGameAssets: false,
    requiresOwnedBaseGame: false,
    requiresGameSlugs: [],
    offers: [],
  };
  const tier = previewTier(access, catalogTiers);
  const selectedSlugs = access.requiresGameSlugs ?? [];
  const paidCatalog = useMemo(
    () =>
      catalogGames.filter((g) => {
        if (selectedSlugs.includes(g.slug)) return false;
        if (g.priceType === "PAID") return true;
        // Saved PAID games land in the VALUE map as themselves. Unclassified
        // and free engines stay out of this list on purpose.
        const t = tierFor(catalogTiers, g.slug);
        return t.tier === "VALUE" && t.requires.some((r) => r.slug === g.slug);
      }),
    [catalogGames, catalogTiers, selectedSlugs]
  );
  const cheapestDep = useMemo(() => {
    let best: { title: string; cents: number | null } | null = null;
    for (const slug of access.requiresGameSlugs ?? []) {
      const t = tierFor(catalogTiers, slug);
      const game = catalogGames.find((g) => g.slug === slug);
      if (!best || (t.fromPriceCents != null && (best.cents == null || t.fromPriceCents < best.cents))) {
        best = { title: game?.title ?? slug, cents: t.fromPriceCents };
      }
    }
    return best;
  }, [access.requiresGameSlugs, catalogGames, catalogTiers]);

  function patch(partial: Partial<Access>) {
    const next: Access = { ...access, ...partial };
    if (next.priceType === "FREE" && !next.requiresBaseGameAssets && !next.requiresOwnedBaseGame) {
      next.purchaseRequired = false;
      next.regularPriceCents = 0;
      next.currentPriceCents = 0;
      next.qualifyingPriceCents = 0;
      next.offers = [];
    } else {
      next.purchaseRequired = true;
    }
    const derived = bestPurchase(next);
    if (derived) next.currentPriceCents = derived.priceCents;
    onChange(next);
  }

  const showPrices = access.priceType === "PAID";
  const showDeps =
    access.priceType === "PAID_BASE_GAME_REQUIRED" || (access.requiresGameSlugs?.length ?? 0) > 0;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Games establish access. Everything else inherits it. The effective result is computed —
        do not treat it as a field to edit.
      </p>

      <fieldset className="space-y-2">
        <legend className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
          Acquisition type
        </legend>
        {TYPES.map((opt) => (
          <label key={opt.value} className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="radio"
              name="priceType"
              className="mt-1"
              checked={access.priceType === opt.value}
              onChange={() =>
                patch({
                  priceType: opt.value,
                  requiresBaseGameAssets: opt.value === "PAID_BASE_GAME_REQUIRED",
                  requiresOwnedBaseGame: opt.value === "PAID_BASE_GAME_REQUIRED",
                })
              }
            />
            <span>
              <span className="font-semibold">{opt.label}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{opt.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {showPrices ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <DollarField
              label="Qualifying price"
              hint="Regularly obtainable for this — defaults to the store list price."
              value={centsToInput(access.qualifyingPriceCents)}
              onChange={(v) => patch({ qualifyingPriceCents: inputToCents(v) })}
            />
            <DollarField
              label="Current price"
              hint="Lowest live store price. Fetched from the store, not typed."
              value={centsToInput(access.currentPriceCents)}
              onChange={(v) => patch({ currentPriceCents: inputToCents(v) })}
              readOnly
            />
            <DollarField
              label="Regular price"
              hint="Store list price. Fetched with the source."
              value={centsToInput(access.regularPriceCents)}
              onChange={(v) => patch({ regularPriceCents: inputToCents(v) })}
              readOnly
            />
          </div>
          <PurchaseSources
            offers={access.offers ?? []}
            gameSlug={gameSlug}
            onChange={(offers) => patch({ offers })}
            onLookedUp={(info) => {
              patch({
                offers: info.offers,
                regularPriceCents: info.listPriceCents || info.priceCents,
                qualifyingPriceCents:
                  access.qualifyingPriceCents || info.listPriceCents || info.priceCents,
              });
            }}
            onMatched={(nextAccess) => onChange(nextAccess)}
          />
        </>
      ) : null}

      {access.priceType === "PAID_BASE_GAME_REQUIRED" ? (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(access.requiresBaseGameAssets)}
              onChange={(e) => patch({ requiresBaseGameAssets: e.target.checked })}
            />
            Requires original game files on disk
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(access.requiresOwnedBaseGame)}
              onChange={(e) => patch({ requiresOwnedBaseGame: e.target.checked })}
            />
            Requires owning the original game
          </label>
        </div>
      ) : null}

      {(showDeps || access.priceType !== "PAID") && (
        <div>
          <label className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
            This game requires
          </label>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Pick the commercial catalog title this engine or port needs. Classify that title as
            Paid first — free games are omitted here.
          </p>
          <select
            className="mt-1 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm"
            value=""
            onChange={(e) => {
              const slug = e.target.value;
              if (!slug) return;
              const next = [...(access.requiresGameSlugs ?? [])];
              if (!next.includes(slug)) next.push(slug);
              patch({ requiresGameSlugs: next });
            }}
          >
            <option value="">
              {paidCatalog.length === 0 ? "No paid games in the catalog yet…" : "Add a required game…"}
            </option>
            {paidCatalog.map((g) => {
              const price = tierFor(catalogTiers, g.slug).fromPriceCents;
              return (
                <option key={g.slug} value={g.slug}>
                  {g.title}
                  {price ? ` — ${formatCents(price)}` : ""}
                </option>
              );
            })}
          </select>
          {(access.requiresGameSlugs ?? []).length > 0 ? (
            <ul className="mt-2 space-y-1">
              {(access.requiresGameSlugs ?? []).map((slug) => {
                const game = catalogGames.find((g) => g.slug === slug);
                return (
                  <li
                    key={slug}
                    className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-3 py-1.5 text-sm"
                  >
                    <span>{game?.title ?? slug}</span>
                    <button
                      type="button"
                      className="text-xs font-semibold text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        patch({
                          requiresGameSlugs: (access.requiresGameSlugs ?? []).filter((s) => s !== slug),
                        })
                      }
                    >
                      Remove
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      )}

      <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm">
        <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
          Effective access
        </p>
        <p className="mt-1 font-extrabold">{tier}</p>
        {tier === "VALUE" && cheapestDep ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Requires {cheapestDep.title}
            {cheapestDep.cents != null ? ` — ${formatCents(cheapestDep.cents)}` : ""}.
          </p>
        ) : null}
        {tier === "VALUE" && access.priceType === "PAID" && access.qualifyingPriceCents != null ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Qualifying price {formatCents(access.qualifyingPriceCents)}.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function PurchaseSources({
  offers,
  gameSlug,
  onChange,
  onLookedUp,
  onMatched,
}: {
  offers: RetailOffer[];
  gameSlug?: string;
  onChange: (offers: RetailOffer[]) => void;
  onLookedUp: (info: {
    offers: RetailOffer[];
    priceCents: number;
    listPriceCents: number | null;
  }) => void;
  onMatched: (access: Access) => void;
}) {
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [matching, setMatching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patchOffer(index: number, partial: Partial<RetailOffer>) {
    onChange(offers.map((offer, i) => (i === index ? { ...offer, ...partial } : offer)));
  }

  function setUrl(index: number, url: string) {
    const detected = detectRetailer(url);
    patchOffer(index, detected ? { url, retailer: detected, matchSource: "manual" } : { url, matchSource: "manual" });
  }

  async function fetchPrice(index: number, url: string) {
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed) || busyIndex != null) return;
    setBusyIndex(index);
    setError(null);
    try {
      const res = await fetch("/api/admin/offers/lookup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const json = (await res.json()) as {
        error?: string;
        retailer?: string;
        url?: string;
        priceCents?: number;
        listPriceCents?: number | null;
        lastCheckedAt?: string;
      };
      if (!res.ok) {
        setError(json.error || "Could not look up that store price.");
        return;
      }
      if (json.priceCents == null || json.priceCents <= 0) {
        setError("The store did not return a price.");
        return;
      }
      const next = offers.map((offer, i) =>
        i === index
          ? {
              ...offer,
              retailer: json.retailer || offer.retailer,
              url: json.url || offer.url,
              priceCents: json.priceCents!,
              lastCheckedAt: json.lastCheckedAt ?? new Date().toISOString(),
              isActive: true,
              matchSource: "manual" as const,
            }
          : offer
      );
      onLookedUp({
        offers: next,
        priceCents: json.priceCents,
        listPriceCents: json.listPriceCents ?? json.priceCents,
      });
    } catch {
      setError("Could not look up that store price.");
    } finally {
      setBusyIndex(null);
    }
  }

  const storeOptions: string[] = [...KNOWN_RETAILERS];
  for (const offer of offers) {
    if (offer.retailer && !storeOptions.includes(offer.retailer)) {
      storeOptions.push(offer.retailer);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
          Purchase sources
        </p>
        <span className="flex items-center gap-3">
          {gameSlug ? (
            <button
              type="button"
              className="text-xs font-semibold text-primary hover:underline disabled:opacity-50"
              disabled={matching}
              onClick={() => {
                void (async () => {
                  setMatching(true);
                  setError(null);
                  try {
                    const res = await fetch("/api/admin/ecommerce/match", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ slug: gameSlug }),
                    });
                    const json = (await res.json()) as { error?: string; access?: Access | null };
                    if (!res.ok) {
                      setError(json.error || "Could not match stores.");
                      return;
                    }
                    if (json.access) onMatched(json.access);
                  } catch {
                    setError("Could not match stores.");
                  } finally {
                    setMatching(false);
                  }
                })();
              }}
            >
              {matching ? "Matching…" : "Match stores"}
            </button>
          ) : null}
          <button
            type="button"
            className="text-xs font-semibold text-primary hover:underline"
            onClick={() =>
            onChange([
              ...offers,
              {
                retailer: "",
                url: "",
                priceCents: 0,
                affiliate: true,
                lastCheckedAt: null,
                isActive: true,
                matchSource: "manual",
              },
            ])
          }
        >
          Add source
        </button>
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Paste a product URL for any store — including ones without an API or feed — then fetch
        the price when the store supports it. Match stores fills Steam, GOG, Epic, and feed-backed
        stores automatically. Cards and Get Game use the lowest active price here.
      </p>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {offers.length === 0 ? (
        <p className="text-xs text-muted-foreground">No sources yet.</p>
      ) : (
        <ul className="space-y-3">
          {offers.map((offer, index) => {
            const fetching = busyIndex === index;
            const canFetch = /^https?:\/\//i.test(offer.url.trim());
            return (
              <li key={`${offer.retailer}-${index}`} className="space-y-2 rounded-lg border border-border p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
                      Store
                    </span>
                    <select
                      className="mt-1 w-full rounded-lg border border-border bg-secondary px-3 py-2"
                      value={offer.retailer}
                      onChange={(e) => patchOffer(index, { retailer: e.target.value })}
                    >
                      <option value="">Select store…</option>
                      {storeOptions.map((name) => (
                        <option key={name} value={name}>
                          {name}
                          {retailerHasLivePrice(name) ? "" : " — no live price yet"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <DollarField
                    label="Price"
                    hint={
                      offer.matchSource === "auto"
                        ? `Matched from ${offer.retailer}`
                        : offer.priceCents > 0
                          ? offer.lastCheckedAt
                            ? `Fetched ${new Date(offer.lastCheckedAt).toLocaleString()}`
                            : "From the pasted URL"
                          : "Fetch price before saving"
                    }
                    value={centsToInput(offer.priceCents || null)}
                    readOnly
                  />
                </div>
                <label className="block text-sm">
                  <span className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
                    Product URL
                  </span>
                  <input
                    type="url"
                    className="mt-1 w-full rounded-lg border border-border bg-secondary px-3 py-2"
                    value={offer.url}
                    onChange={(e) => setUrl(index, e.target.value)}
                    onBlur={(e) => void fetchPrice(index, e.currentTarget.value)}
                    placeholder="https://store.steampowered.com/app/…"
                  />
                </label>
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <button
                    type="button"
                    className="text-xs font-semibold text-primary hover:underline disabled:opacity-50"
                    disabled={!canFetch || busyIndex != null}
                    onClick={() => void fetchPrice(index, offer.url)}
                  >
                    {fetching ? "Fetching…" : "Fetch price"}
                  </button>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={offer.affiliate}
                      onChange={(e) => patchOffer(index, { affiliate: e.target.checked })}
                    />
                    Affiliate
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={offer.isActive}
                      onChange={(e) => patchOffer(index, { isActive: e.target.checked })}
                    />
                    Active
                  </label>
                  <button
                    type="button"
                    className="ml-auto text-xs font-semibold text-muted-foreground hover:text-foreground"
                    onClick={() => onChange(offers.filter((_, i) => i !== index))}
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function DollarField({
  label,
  hint,
  value,
  onChange,
  readOnly = false,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{label}</span>
      <span className="mt-1 flex items-center gap-1 rounded-lg border border-border bg-secondary px-3 py-2">
        <span className="text-muted-foreground">$</span>
        <input
          type="text"
          inputMode="decimal"
          className="w-full bg-transparent outline-none disabled:opacity-70"
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder="0.00"
          readOnly={readOnly}
          disabled={readOnly}
        />
      </span>
      {hint ? <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span> : null}
    </label>
  );
}
