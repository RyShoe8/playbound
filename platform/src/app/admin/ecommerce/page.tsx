import type { Metadata } from "next";
import { connection } from "next/server";
import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import StoreMatchSuggestion from "@/lib/models/StoreMatchSuggestion";
import { EcommerceMatchButton } from "@/components/admin/EcommerceMatchButton";
import {
  EcommerceCatalogList,
  type EcommerceGameRow,
  type EcommerceSuggestionRow,
} from "@/components/admin/EcommerceCatalogList";
import { ensureCommerceStores } from "@/lib/commerce/ensureStores";
import { offersFromUnknown } from "@/lib/access/offers";
import { purchaseClicksByGame } from "@/lib/commerce/purchaseClicks";
import { adtractionReport } from "@/lib/commerce/adtraction/report";
import { AdtractionReporting } from "@/components/admin/AdtractionReporting";

export const metadata: Metadata = { title: "eCommerce | Admin" };

export default async function AdminEcommercePage() {
  // Never prerendered — see the layout. Each segment prerenders
  // independently, so the layout's opt-out does not cover this page.
  await connection();
  await dbConnect();
  await ensureCommerceStores();

  const [games, suggestions] = await Promise.all([
    CatalogGame.find({ masterCopy: true })
      .select("slug title access.priceType access.offers masterCopy")
      .sort({ title: 1 })
      .lean(),
    StoreMatchSuggestion.find({ status: "pending" }).sort({ updatedAt: -1 }).lean(),
  ]);

  const slugs = games.map((game) => String(game.slug));
  const [purchaseClicks, report] = await Promise.all([purchaseClicksByGame(slugs), adtractionReport(slugs)]);

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
      purchaseClicks: purchaseClicks === null ? null : purchaseClicks.get(String(g.slug)) ?? 0,
      affiliateSales: report.byGame?.[String(g.slug)] ?? null,
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

      <AdtractionReporting report={report} />
      <EcommerceCatalogList games={catalog} />
    </div>
  );
}
