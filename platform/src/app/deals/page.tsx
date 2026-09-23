import Link from "next/link";
import { BadgePercent } from "lucide-react";
import { listActiveOffers } from "@/lib/freeOffers/service";
import { listDiscountedGames, DEEP_DISCOUNT_MIN_PERCENT } from "@/lib/deals";
import { DealsBrowser } from "@/components/DealsBrowser";
import { Badge } from "@/components/ui/bits";
import { JsonLd, graph, breadcrumbSchema } from "@/components/JsonLd";
import { absoluteUrl } from "@/lib/site";

/**
 * /deals — every current way to pay less, in one filterable place.
 *
 * Two halves, both sourced from the stores directly, neither gated by
 * PlayBound's own catalog. Free offers are store giveaways PlayBound tracks;
 * discounts are titles found on-sale at ≥75% off directly on GOG, Steam, Epic
 * and GamersGate — see `src/lib/storeDiscounts/`. This used to read PlayBound's
 * own ~18 paid catalog games, which made "On sale now" empty almost every
 * day; scanning the stores themselves is what fixed that, the same way the
 * free half already worked. A `slug`/`matchedGameSlug` on a discount is a rare
 * bonus when one happens to exist in our catalog, never a requirement.
 *
 * Either section hides when its filtered result is empty rather than rendering
 * an empty shell under a heading. Even store-wide, a real 75%+ discount is not
 * guaranteed on any given day — that should still look deliberate, not broken.
 *
 * On the overlap with /free-games: that page is still the canonical list for the
 * giveaway search intent and keeps the higher sitemap priority. This page lists
 * the same offers because it is the navigation destination and a deals hub that
 * truncated its own contents would be the wrong trade — but the structured data
 * below deliberately stays with the discounts only, so the two pages do not
 * compete for the same rich results.
 */

export default async function DealsPage() {
  const [activeOffers, discounted] = await Promise.all([
    listActiveOffers(),
    listDiscountedGames(),
  ]);

  /*
   * Only the discounted games get ItemList markup. The free offers already have
   * it on /free-games, and that page is their canonical home — emitting the same
   * offers as structured data here would compete with it.
   *
   * `item.url` prefers the store's own product page over a PlayBound game page.
   * Most discounts have no PlayBound catalog match (`game.slug` is usually
   * null) — building this from `/games/${game.slug}` the way the old,
   * catalog-only version of this page did would have produced `/games/null`
   * for nearly every row.
   */
  const discountSchema =
    discounted.length > 0
      ? {
          "@type": "ItemList",
          name: "Discounted games found by PlayBound",
          description:
            "Games currently on sale at 75% off or deeper, found directly on GOG, Steam, Epic and GamersGate.",
          url: absoluteUrl("/deals"),
          numberOfItems: discounted.length,
          itemListElement: discounted.map((game, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: game.title,
            item: {
              "@type": "Product",
              name: game.title,
              url: game.storeUrl || (game.slug ? absoluteUrl(`/games/${game.slug}`) : absoluteUrl("/deals")),
              offers: {
                "@type": "Offer",
                price: (game.currentPriceCents / 100).toFixed(2),
                priceCurrency: game.currency,
                availability: "https://schema.org/InStock",
                ...(game.storeUrl ? { url: game.storeUrl } : {}),
                ...(game.storeName
                  ? { seller: { "@type": "Organization", name: game.storeName } }
                  : {}),
              },
            },
          })),
        }
      : null;

  return (
    <div className="mx-auto max-w-7xl space-y-12 px-4 py-8 sm:px-6 lg:px-8">
      <JsonLd
        data={graph(
          // graph() drops null entries itself, so no spread dance is needed.
          discountSchema,
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Game Deals", path: "/deals" },
          ])
        )}
      />

      <header className="max-w-3xl space-y-3">
        <Badge tone="play" className="w-fit">
          <BadgePercent className="size-3.5" /> Free and heavily discounted
        </Badge>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Game Deals</h1>
        <p className="text-base text-muted-foreground sm:text-lg">
          A deal finder and a free-game finder, sourced directly from the stores — live
          giveaways alongside titles currently on sale at 75% off or deeper on GOG,
          Steam, Epic and GamersGate.
        </p>
      </header>

      <DealsBrowser
        offers={activeOffers}
        discounted={discounted}
        minPercentOff={DEEP_DISCOUNT_MIN_PERCENT}
      />

      {/* ── Standing explanation of what belongs here ───────────── */}
      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-bold tracking-tight">What this page is</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          This is a deal finder, not a recommendation list. Both halves are found
          directly on the stores, not from PlayBound&apos;s own catalog — a title
          showing up here is not a claim that we have played it, tested it, or would
          otherwise recommend it, the way a game on the rest of the site is. We only
          list a discount at {DEEP_DISCOUNT_MIN_PERCENT}% or deeper, because a game at
          ten percent off is a price change rather than a deal, and a section full of
          those is one nobody bothers reading — so expect it to be thinner some days
          than others. The free giveaways are the same idea: tracked from the stores
          themselves, so a giveaway appearing here is a statement about availability,
          not an endorsement.
        </p>
        <p className="mt-3 text-sm">
          <Link href="/standards" className="font-bold text-primary hover:underline">
            See what PlayBound does recommend
          </Link>
        </p>
      </section>
    </div>
  );
}
