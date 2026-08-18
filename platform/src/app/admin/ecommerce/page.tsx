import type { Metadata } from "next";
import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import FreeOffer from "@/lib/models/FreeOffer";
import StoreMatchSuggestion from "@/lib/models/StoreMatchSuggestion";
import { EcommerceMatchButton } from "@/components/admin/EcommerceMatchButton";
import { EcommerceSuggestionActions } from "@/components/admin/EcommerceSuggestionActions";
import { FreeOfferLinkControl } from "@/components/admin/FreeOfferLinkControl";
import { ensureCommerceStores } from "@/lib/commerce/ensureStores";
import Link from "next/link";

export const metadata: Metadata = { title: "eCommerce | Admin" };

export default async function AdminEcommercePage() {
  await dbConnect();
  await ensureCommerceStores();

  const [missingPaid, suggestions, unmatchedOffers, games] = await Promise.all([
    CatalogGame.find({
      "access.priceType": "PAID",
      $or: [{ "access.offers": { $exists: false } }, { "access.offers": { $size: 0 } }],
    })
      .select("slug title")
      .sort({ title: 1 })
      .limit(50)
      .lean(),
    StoreMatchSuggestion.find({ status: "pending" }).sort({ updatedAt: -1 }).limit(40).lean(),
    FreeOffer.find({
      isActive: true,
      $or: [{ gameSlug: null }, { matchConfidence: "unmatched" }],
    })
      .sort({ updatedAt: -1 })
      .limit(40)
      .lean(),
    CatalogGame.find().select("slug title").sort({ title: 1 }).limit(400).lean(),
  ]);

  const gameOptions = games.map((g) => ({ slug: String(g.slug), title: String(g.title) }));

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">eCommerce</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Stores, live prices, product feeds, and free promotions in one place. Unique catalog
            matches write themselves; everything else waits here.
          </p>
        </div>
        <EcommerceMatchButton />
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-bold tracking-tight">
          Paid games with no purchase sources ({missingPaid.length})
        </h2>
        {missingPaid.length === 0 ? (
          <p className="text-sm text-muted-foreground">Every paid game has at least one source.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {missingPaid.map((g) => (
              <li key={String(g.slug)} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                <Link href={`/admin/games/${g.slug}/edit`} className="font-semibold hover:underline">
                  {g.title}
                </Link>
                <EcommerceMatchButton slug={String(g.slug)} label="Match" />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold tracking-tight">Ambiguous matches ({suggestions.length})</h2>
        {suggestions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing waiting for a pick.</p>
        ) : (
          <ul className="space-y-3">
            {suggestions.map((s) => (
              <li key={String(s._id)} className="rounded-xl border border-border bg-card p-4">
                <p className="text-sm font-bold">
                  {s.gameTitle}{" "}
                  <span className="font-medium text-muted-foreground">· {s.retailer}</span>
                </p>
                <EcommerceSuggestionActions
                  id={String(s._id)}
                  candidates={(
                    (s.candidates ?? []) as Array<{
                      title: string;
                      url: string;
                      priceCents?: number | null;
                    }>
                  ).map((c) => ({
                    title: c.title,
                    url: c.url,
                    priceCents: c.priceCents ?? null,
                  }))}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight">Unmatched free offers ({unmatchedOffers.length})</h2>
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
    </div>
  );
}
