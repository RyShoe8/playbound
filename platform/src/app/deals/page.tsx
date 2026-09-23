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
 * Two halves, two different things. Free offers are store giveaways PlayBound
 * tracks; discounts are catalog games we curate that happen to be cheap today.
 * Both are listed in full, and `DealsBrowser` lets a reader narrow to one kind
 * or one store without leaving the page.
 *
 * Either section hides when its filtered result is empty rather than rendering
 * an empty shell under a heading. For discounts that is the common case, not an
 * edge case: the catalog carries roughly eighteen paid games and only counts a
 * discount at DEEP_DISCOUNT_MIN_PERCENT or deeper, so most days genuinely have
 * nothing to show and that should look deliberate rather than broken.
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
   */
  const discountSchema =
    discounted.length > 0
      ? {
          "@type": "ItemList",
          name: "Discounted games on PlayBound",
          description:
            "PlayBound catalog games currently selling below their usual price.",
          url: absoluteUrl("/deals"),
          numberOfItems: discounted.length,
          itemListElement: discounted.map((game, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: game.title,
            item: {
              "@type": "Product",
              name: game.title,
              url: absoluteUrl(`/games/${game.slug}`),
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
          Everything worth playing that costs little or nothing right now — live store
          giveaways alongside catalog games selling below their usual price.
        </p>
      </header>

      <DealsBrowser
        offers={activeOffers}
        discounted={discounted}
        minPercentOff={DEEP_DISCOUNT_MIN_PERCENT}
      />

      {/* ── Standing explanation of what belongs here ───────────── */}
      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-bold tracking-tight">How PlayBound picks deals</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          A low price is not a reason to play something. Every discounted game listed
          here is already in the PlayBound catalog, which means it cleared the same bar
          as everything else we recommend — it just happens to be cheap this week. We
          only list a discount at {DEEP_DISCOUNT_MIN_PERCENT}% or deeper, because a game
          at ten percent off is a price change rather than a deal, and a section full of
          those is one nobody bothers reading. Expect it to be empty often. The free
          giveaways are a different thing: those are tracked from the stores themselves,
          so a giveaway appearing here is a statement about availability, not an
          endorsement.
        </p>
        <p className="mt-3 text-sm">
          <Link href="/standards" className="font-bold text-primary hover:underline">
            Read the PlayBound Bar
          </Link>
        </p>
      </section>
    </div>
  );
}
