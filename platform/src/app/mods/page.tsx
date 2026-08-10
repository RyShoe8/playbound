import { Puzzle } from "lucide-react";
import { listGames } from "@/lib/catalog";
import { listMods, toModCard } from "@/lib/mods";
import { viewerCanSeeTesting } from "@/lib/requestIncludesTesting";
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
  const includeTesting = await viewerCanSeeTesting();
  const [mods, games] = await Promise.all([
    listMods({ includeTesting, view: "card" }),
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

  /**
   * A mod's own status can be published while its base game is still a
   * draft — nothing enforces the two together. Drop those here rather than
   * downstream: ModsFilters' game selector is built from the mods list's own
   * baseGameSlug values, so an unfiltered list would surface a draft game as
   * a selectable option (and its mod as a dead link to a page that doesn't
   * exist yet for a regular visitor).
   */
  // Narrowed to card fields before crossing into ModsFilters (a client
  // component): anything left on these objects gets serialized into the RSC
  // payload and shipped to every visitor, whether the grid renders it or not.
  const liveMods = mods
    .filter((m) => Boolean(gamesBySlug[m.baseGameSlug]))
    .map(toModCard);

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
            numberOfItems: liveMods.length,
            itemListElement: liveMods.map((m, i) => ({
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

      {liveMods.length === 0 ? (
        <p className="mt-10 text-muted-foreground">No mods published yet.</p>
      ) : (
        <ModsFilters mods={liveMods} gamesBySlug={gamesBySlug} />
      )}
    </div>
  );
}
