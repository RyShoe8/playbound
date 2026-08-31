import Link from "next/link";
import { notFound } from "next/navigation";
import { getCollection } from "@/lib/collections";
import { gamesFor } from "@/lib/catalog";
import { CollectionGamesList } from "@/components/CollectionGamesList";
import { Badge } from "@/components/ui/bits";
import { pageMetadata } from "@/lib/seo";
import {
  JsonLd,
  graph,
  collectionPageSchema,
  faqSchema,
  breadcrumbSchema,
} from "@/components/JsonLd";

/*
 * ISR, matched to the live-activity window — see developers/page.tsx for the
 * reasoning. Admin writes still land immediately via revalidateTag("catalog").
 */
export const revalidate = 900;

/*
 * Required for ISR on a dynamic segment. Without a generateStaticParams
 * export at all, Next renders the route per request and serves it
 * `private, no-store` — `revalidate` above does nothing on its own. Returning
 * an empty array is the documented way to say "generate every path at
 * runtime, then cache it" (see generate-static-params.md: "You must return an
 * empty array from generateStaticParams ... in order to revalidate (ISR)
 * paths at runtime").
 *
 * Empty rather than the real slugs on purpose: listing them means reading the
 * catalog during the build, and the catalog changes far more often than we
 * deploy. dynamicParams defaults to true, so the first request for any slug
 * renders it and every request after that is served from the cache.
 */
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const collection = await getCollection(slug);
  if (!collection) return { title: "Collection Not Found" };

  const games = await gamesFor(collection.gameSlugs);
  const names = games.slice(0, 4).map((g) => g.title).join(", ");

  return pageMetadata({
    title: collection.title,
    description: `${games.length} free games hand-picked by PlayBound${names ? `, including ${names}` : ""}. ${collection.description}`,
    path: `/collections/${collection.slug}`,
  });
}

export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const collection = await getCollection(slug);
  if (!collection) notFound();

  const allGames = await gamesFor(collection.gameSlugs);
  if (allGames.length === 0) notFound();

  /*
   * Discovery mode is no longer resolved here.
   *
   * It reached exactly one thing on this page — which game the FAQ calls the
   * top pick — while the grid (CollectionGamesList), the CollectionPage schema
   * and the "N games" line all already used the unfiltered list. Resolving it
   * meant reading a cookie, and that one read opted the whole route out of
   * prerendering.
   *
   * The FAQ now names the same game the schema does, which is also the
   * consistency this page was missing: a FREE viewer could be told the top
   * pick was one game while the structured data on the same URL said another.
   * CollectionGamesList still applies the viewer's mode to the grid.
   */

  const faq = [
    {
      q: `What is the best ${collection.title.toLowerCase().replace(/^best /, "")}?`,
      a: allGames[0]
        ? `PlayBound's top pick is ${allGames[0].title} — ${allGames[0].tagline} It runs on ${allGames[0].platforms.join(", ")}.`
        : collection.description,
    },
    {
      q: `Do these games clear the PlayBound Bar?`,
      a: "Yes. Every game in this collection has been tested, played, and assessed against PlayBound's published criteria — worth playing, worth what it costs, and respectful of the player's time.",
    },
  ];

  return (
    <div className="space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <JsonLd
        data={graph(
          collectionPageSchema(collection, allGames),
          faqSchema(faq),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Collections", path: "/collections" },
            { name: collection.title, path: `/collections/${collection.slug}` },
          ])
        )}
      />

      <section className="rounded-2xl border border-border bg-gradient-to-br from-primary/15 via-card to-card p-6 sm:p-8">
        <Badge tone="brand">PlayBound Curated</Badge>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight">{collection.title}</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">{collection.description}</p>
        <p className="mt-4 text-sm text-muted-foreground">
          {allGames.length} games · every one clears{" "}
          <Link href="/standards" className="font-semibold text-primary hover:underline">
            the PlayBound Bar
          </Link>
        </p>
      </section>

      <CollectionGamesList games={allGames} />

      <section>
        <h2 className="text-xl font-bold">Questions</h2>
        <div className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
          {faq.map((item) => (
            <div key={item.q} className="p-4">
              <h3 className="font-semibold">{item.q}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {item.a}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
