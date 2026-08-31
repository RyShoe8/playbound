import { Layers } from "lucide-react";
import { listCollections } from "@/lib/collections";
import { listGames } from "@/lib/catalog";
import { CollectionDirectory } from "@/components/access/CollectionDirectory";
import { pageMetadata } from "@/lib/seo";
import { JsonLd, graph, breadcrumbSchema, ORGANIZATION_ID } from "@/components/JsonLd";
import { absoluteUrl } from "@/lib/site";

/*
 * ISR, matched to the live-activity window — see developers/page.tsx for the
 * reasoning. Admin writes still land immediately via revalidateTag("catalog").
 */
export const revalidate = 900;

export const metadata = pageMetadata({
  title: "Curated Collections of Free Games",
  description:
    "Hand-picked groupings of free games: the best free RTS games, LAN party favourites, games under 500MB, and more. Every title clears the PlayBound Bar.",
  path: "/collections",
});

export default async function CollectionsIndexPage() {
  /*
   * Every collection and every game, unfiltered. CollectionDirectory applies
   * the viewer's discovery mode in the browser; resolving it here would mean a
   * cookie read, which costs the route its prerendering to produce output that
   * is identical for anyone who has not changed the setting.
   */
  const [games, collections] = await Promise.all([listGames(), listCollections()]);
  const referenced = new Set(collections.flatMap((c) => c.gameSlugs));
  const titleBySlug: Record<string, string> = {};
  for (const game of games) {
    if (referenced.has(game.slug)) titleBySlug[game.slug] = game.title;
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <JsonLd
        data={graph(
          {
            "@type": "CollectionPage",
            name: "Curated Collections of Free Games",
            url: absoluteUrl("/collections"),
            publisher: { "@id": ORGANIZATION_ID },
          },
          {
            "@type": "ItemList",
            numberOfItems: collections.length,
            itemListElement: collections.map((c, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: c.title,
              url: absoluteUrl(`/collections/${c.slug}`),
            })),
          },
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Collections", path: "/collections" },
          ])
        )}
      />

      <div className="flex items-center gap-2 text-sm font-semibold text-primary">
        <Layers className="size-4" /> Curated
      </div>
      <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">
        Collections
      </h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
        Hand-picked groupings from the PlayBound catalog. Short lists, because a list
        of ninety games answers nothing.
      </p>

      <CollectionDirectory
        collections={collections.map((c) => ({
          slug: c.slug,
          title: c.title,
          description: c.description,
          gameSlugs: c.gameSlugs,
        }))}
        titleBySlug={titleBySlug}
      />
    </div>
  );
}
