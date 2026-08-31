import type { Metadata } from "next";
import { connection } from "next/server";
import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import FreeOffer from "@/lib/models/FreeOffer";
import StoreMatchSuggestion from "@/lib/models/StoreMatchSuggestion";
import { EcommerceMatchButton } from "@/components/admin/EcommerceMatchButton";
import {
  EcommerceCatalogList,
  type EcommerceGameRow,
  type EcommerceSuggestionRow,
} from "@/components/admin/EcommerceCatalogList";
import { FreeOfferLinkControl } from "@/components/admin/FreeOfferLinkControl";
import { ensureCommerceStores } from "@/lib/commerce/ensureStores";
import { offersFromUnknown } from "@/lib/access/offers";
import Link from "next/link";

export const metadata: Metadata = { title: "eCommerce | Admin" };

export default async function AdminEcommercePage() {
  // Never prerendered — see the layout. Each segment prerenders
  // independently, so the layout's opt-out does not cover this page.
  await connection();
  await dbConnect();
  await ensureCommerceStores();

  const [games, suggestions, unmatchedOffers] = await Promise.all([
    CatalogGame.find({ masterCopy: true })
      .select("slug title access.priceType access.offers masterCopy")
      .sort({ title: 1 })
      .lean(),
    StoreMatchSuggestion.find({ status: "pending" }).sort({ updatedAt: -1 }).lean(),
    FreeOffer.find({
      isActive: true,
      $or: [{ gameSlug: null }, { matchConfidence: "unmatched" }],
    })
      .sort({ updatedAt: -1 })
      .limit(40)
      .lean(),
  ]);

  const suggestionsBySlug = new Map<string, EcommerceSuggestionRow[]>();
  for (const s of suggestions) {
    const slug = String(s.gameSlug);
    const row: EcommerceSuggestionRow = {
      id: String(s._id),
      retailer: String(s.retailer),
      candidates: (
        (s.candidates ?? []) as Array<{ title: string; url: string; priceCents?: number | null }>
      ).map((c) => ({
        title: c.title,
        url: c.url,
        priceCents: c.priceCents ?? null,
      })),
    };
    const list = suggestionsBySlug.get(slug) ?? [];
    list.push(row);
    suggestionsBySlug.set(slug, list);
  }

  const catalog: EcommerceGameRow[] = games.map((g) => {
    const access = (g.access ?? {}) as { priceType?: unknown; offers?: unknown };
    return {
      slug: String(g.slug),
      title: String(g.title),
      priceType: typeof access.priceType === "string" ? access.priceType : null,
      offers: offersFromUnknown(access.offers).map((o) => ({
        retailer: o.retailer,
        url: o.url,
        priceCents: o.priceCents,
        isActive: o.isActive,
        matchSource: o.matchSource,
      })),
      suggestions: suggestionsBySlug.get(String(g.slug)) ?? [],
    };
  });

  const gameOptions = catalog.map((g) => ({ slug: g.slug, title: g.title }));

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">eCommerce</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Master copies list and store purchase listings. Tick Display to show a store on the public game page.
          </p>
        </div>
        <EcommerceMatchButton />
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight">
            Unmatched free offers ({unmatchedOffers.length})
          </h2>
          <Link href="/admin/free-offers" className="text-xs font-semibold text-primary hover:underline">
            All free offers
          </Link>
        </div>
        {unmatchedOffers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Every active offer is linked to a catalog game.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {unmatchedOffers.map((o) => (
              <li key={String(o._id)} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                <span>
                  <span className="font-semibold">{o.unmatchedTitle || "Untitled"}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{o.store}</span>
                </span>
                <FreeOfferLinkControl offerId={String(o._id)} games={gameOptions} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <EcommerceCatalogList games={catalog} />
    </div>
  );
}
