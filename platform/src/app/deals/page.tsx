import Link from "next/link";
import { ArrowRight, BadgePercent, Gift, Tag } from "lucide-react";
import { listActiveOffers } from "@/lib/freeOffers/service";
import { listDiscountedGames, DEEP_DISCOUNT_MIN_PERCENT } from "@/lib/deals";
import { ActiveOffersGrid } from "@/components/ActiveOffersGrid";
import { DiscountedGameCard } from "@/components/DiscountedGameCard";
import { Badge } from "@/components/ui/bits";
import { JsonLd, graph, breadcrumbSchema } from "@/components/JsonLd";
import { absoluteUrl } from "@/lib/site";

/**
 * /deals — the hub for every current way to pay less.
 *
 * Two halves, two different things. Free offers are store giveaways PlayBound
 * tracks; discounts are catalog games we curate that happen to be cheap today.
 *
 * The free half is deliberately **condensed** and links out to /free-games. That
 * page is the canonical list — it ranks for the giveaway queries, sits at
 * sitemap priority 0.9 with a daily change frequency, and names every store in
 * its metadata. Rendering the whole list twice would put two PlayBound pages in
 * competition for the same search intent to no one's benefit.
 *
 * The discount half hides when empty rather than rendering an empty shell. That
 * is the common case today, not an edge case: the catalog carries roughly
 * eighteen paid games and only counts a discount at DEEP_DISCOUNT_MIN_PERCENT
 * or deeper, so most days genuinely have nothing to show and that should look
 * deliberate rather than broken.
 */

/** How many free offers the condensed section shows before deferring to /free-games. */
const FREE_PREVIEW_COUNT = 8;

export default async function DealsPage() {
  const [activeOffers, discounted] = await Promise.all([
    listActiveOffers(),
    listDiscountedGames(),
  ]);

  const freePreview = activeOffers.slice(0, FREE_PREVIEW_COUNT);
  const hiddenFreeCount = Math.max(0, activeOffers.length - freePreview.length);

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

      {/* ── Discounted catalog games ─────────────────────────────── */}
      {discounted.length > 0 && (
        <section className="space-y-6">
          <div>
            <div className="flex items-center gap-2">
              <Tag className="size-5 text-muted-foreground" />
              <h2 className="text-2xl font-bold tracking-tight">On sale now</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {discounted.length === 1
                ? "One catalog game is currently"
                : `${discounted.length} catalog games are currently`}{" "}
              {DEEP_DISCOUNT_MIN_PERCENT}% off or more. Every one has already cleared the
              PlayBound Bar — the discount is why it is on this page, not why we
              recommend it.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {discounted.map((game) => (
              <DiscountedGameCard key={game.slug} game={game} />
            ))}
          </div>
        </section>
      )}

      {/* ── Free giveaways (condensed; /free-games is canonical) ── */}
      <section
        className={
          discounted.length > 0 ? "space-y-6 border-t border-border pt-10" : "space-y-6"
        }
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Gift className="size-5 text-muted-foreground" />
              <h2 className="text-2xl font-bold tracking-tight">Free right now</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Time-limited giveaways from Epic, Steam, GOG, Prime Gaming and Alienware
              Arena. Claim them before they expire.
            </p>
          </div>
          <Link
            href="/free-games"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline"
          >
            {hiddenFreeCount > 0 ? `All ${activeOffers.length} free games` : "All free games"}
            <ArrowRight className="size-4" />
          </Link>
        </div>

        <ActiveOffersGrid offers={freePreview} />
      </section>

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
