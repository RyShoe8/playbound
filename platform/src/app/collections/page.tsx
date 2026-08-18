import Link from "next/link";
import { Layers } from "lucide-react";
import { listCollections } from "@/lib/collections";
import { listDiscoverableGames, filterDiscoverableCollections } from "@/lib/access/discover";
import { pageMetadata } from "@/lib/seo";
import { JsonLd, graph, breadcrumbSchema, ORGANIZATION_ID } from "@/components/JsonLd";
import { absoluteUrl } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Curated Collections of Free Games",
  description:
    "Hand-picked groupings of free games: the best free RTS games, LAN party favourites, games under 500MB, and more. Every title clears the PlayBound Bar.",
  path: "/collections",
});

export default async function CollectionsIndexPage() {
  const [games, collections] = await Promise.all([
    listDiscoverableGames(),
    listCollections().then(filterDiscoverableCollections),
  ]);
  const bySlug = new Map(games.map((g) => [g.slug, g]));

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

      <ul className="mt-10 grid gap-4">
        {collections.map((collection) => {
          const titles = collection.gameSlugs
            .map((s) => bySlug.get(s)?.title)
            .filter(Boolean)
            .slice(0, 5);
          return (
            <li key={collection.slug}>
              <Link
                href={`/collections/${collection.slug}`}
                className="block rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-lg font-bold">{collection.title}</h2>
                  <span className="text-xs font-semibold text-muted-foreground">
                    {collection.gameSlugs.length} games
                  </span>
                </div>
                <p className="mt-2 leading-relaxed text-muted-foreground">
                  {collection.description}
                </p>
                {titles.length > 0 && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">Includes: </span>
                    {titles.join(", ")}
                  </p>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
