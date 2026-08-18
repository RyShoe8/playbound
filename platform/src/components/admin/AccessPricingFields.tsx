"use client";

import { useMemo } from "react";
import type { GamePayload } from "@/lib/gamePayload";
import type { AccessTier, PriceType } from "@/lib/access/types";
import { formatCents, gameRequiresPurchase } from "@/lib/access/resolver";
import { bestPurchase, KNOWN_RETAILERS } from "@/lib/access/offers";
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
}: {
  value: Access | null | undefined;
  catalogGames: CatalogPick[];
  catalogTiers: GameTierMap;
  onChange: (next: Access | null) => void;
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
              hint="Regularly obtainable for this — eligibility, not a weekend sale."
              value={centsToInput(access.qualifyingPriceCents)}
              onChange={(v) => patch({ qualifyingPriceCents: inputToCents(v) })}
            />
            <DollarField
              label="Current price"
              hint={
                (access.offers?.length ?? 0) > 0
                  ? "Lowest active purchase source. Edit sources below."
                  : "Used on cards until purchase sources are added."
              }
              value={centsToInput(access.currentPriceCents)}
              onChange={(v) => patch({ currentPriceCents: inputToCents(v) })}
              readOnly={(access.offers?.length ?? 0) > 0}
            />
            <DollarField
              label="Regular price"
              value={centsToInput(access.regularPriceCents)}
              onChange={(v) => patch({ regularPriceCents: inputToCents(v) })}
            />
          </div>
          <PurchaseSources
            offers={access.offers ?? []}
            onChange={(offers) => patch({ offers })}
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

function isoToDateInput(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "";
}

function dateInputToIso(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const d = new Date(`${trimmed}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function PurchaseSources({
  offers,
  onChange,
}: {
  offers: RetailOffer[];
  onChange: (offers: RetailOffer[]) => void;
}) {
  function patchOffer(index: number, partial: Partial<RetailOffer>) {
    onChange(offers.map((offer, i) => (i === index ? { ...offer, ...partial } : offer)));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
          Purchase sources
        </p>
        <button
          type="button"
          className="text-xs font-semibold text-primary hover:underline"
          onClick={() =>
            onChange([
              ...offers,
              {
                retailer: "GOG",
                url: "",
                priceCents: 0,
                affiliate: true,
                lastCheckedAt: new Date().toISOString(),
                isActive: true,
              },
            ])
          }
        >
          Add source
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Cards and Get Game use the lowest active price here. Affiliate links do not decide whether
        the game is eligible — qualifying price still does.
      </p>
      {offers.length === 0 ? (
        <p className="text-xs text-muted-foreground">No sources yet.</p>
      ) : (
        <ul className="space-y-3">
          {offers.map((offer, index) => (
            <li key={`${offer.retailer}-${index}`} className="space-y-2 rounded-lg border border-border p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
                    Store
                  </span>
                  <input
                    list="pb-retailers"
                    className="mt-1 w-full rounded-lg border border-border bg-secondary px-3 py-2"
                    value={offer.retailer}
                    onChange={(e) => patchOffer(index, { retailer: e.target.value })}
                  />
                </label>
                <DollarField
                  label="Price"
                  value={centsToInput(offer.priceCents)}
                  onChange={(v) => patchOffer(index, { priceCents: inputToCents(v) ?? 0 })}
                />
              </div>
              <label className="block text-sm">
                <span className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
                  URL
                </span>
                <input
                  type="url"
                  className="mt-1 w-full rounded-lg border border-border bg-secondary px-3 py-2"
                  value={offer.url}
                  onChange={(e) => patchOffer(index, { url: e.target.value })}
                  placeholder="https://"
                />
              </label>
              <div className="flex flex-wrap items-center gap-4 text-sm">
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
                <label className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Checked</span>
                  <input
                    type="date"
                    className="rounded-lg border border-border bg-secondary px-2 py-1 text-xs"
                    value={isoToDateInput(offer.lastCheckedAt)}
                    onChange={(e) => patchOffer(index, { lastCheckedAt: dateInputToIso(e.target.value) })}
                  />
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
          ))}
        </ul>
      )}
      <datalist id="pb-retailers">
        {KNOWN_RETAILERS.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
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
  onChange: (v: string) => void;
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
          onChange={(e) => onChange(e.target.value)}
          placeholder="0.00"
          readOnly={readOnly}
          disabled={readOnly}
        />
      </span>
      {hint ? <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span> : null}
    </label>
  );
}
