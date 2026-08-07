import { Puzzle } from "lucide-react";
import { listGames } from "@/lib/catalog";
import { listMods } from "@/lib/mods";
import { viewerIsAdmin } from "@/lib/requestIncludesTesting";
import { pageMetadata } from "@/lib/seo";
import { JsonLd, graph, breadcrumbSchema, ORGANIZATION_ID } from "@/components/JsonLd";
import { ModsFilters } from "@/components/ModsFilters";

import { absoluteUrl } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Free Game Mods & Add-ons",
  description:
    "Every mod, total conversion and add-on pack for games in the PlayBound catalog — searchable by game, all free, one-click installable.",
  path: "/mods",
});

export default async function ModsIndexPage() {
  const includeTesting = await viewerIsAdmin();
  const [mods, games] = await Promise.all([
    listMods({ includeTesting }),
    listGames({ includeTesting }),
  ]);
  // Mods are no longer grouped into per-game sections here — the list is flat
  // and filtered client-side, so only the slug→game lookup is still needed.
  const gamesBySlug: Record<
    string,
    | {
        slug: string;
        title: string;
        coverImage?: string;
        platforms: string[];
        browserPlayable: boolean;
        steamDeck: boolean;
      }
    | undefined
  > = {};
  for (const g of games) {
    gamesBySlug[g.slug] = {
      slug: g.slug,
      title: g.title,
      coverImage: g.coverImage,
      platforms: g.platforms,
      browserPlayable: g.browserPlayable,
      steamDeck: g.steamDeck,
    };
  }

  return (
    <div className="space-y-4 px-4 py-6 sm:px-6 lg:px-8">
      <JsonLd
        data={graph(
          {
            "@type": "CollectionPage",
            name: "Free Game Mods & Add-ons",
            url: absoluteUrl("/mods"),
            publisher: { "@id": ORGANIZATION_ID },
          },
          {
            "@type": "ItemList",
            numberOfItems: mods.length,
            itemListElement: mods.map((m, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: m.title,
              url: absoluteUrl(`/mods/${m.slug}`),
            })),
          },
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Mods", path: "/mods" },
          ])
        )}
      />

      {/* Header matches the games index: title, one line of context, then
          straight into the filter toolbar. */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight">
            <Puzzle className="size-6 text-primary" /> Mods
          </h1>
          <p className="mt-1 text-muted-foreground">
            Free add-ons for games in the PlayBound catalog — total conversions, map
            packs, AI opponents and content libraries.
          </p>
        </div>
      </div>

      {mods.length === 0 ? (
        <p className="mt-10 text-muted-foreground">No mods published yet.</p>
      ) : (
        <ModsFilters mods={mods} gamesBySlug={gamesBySlug} />
      )}
    </div>
  );
}
