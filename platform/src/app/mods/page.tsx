import { Puzzle } from "lucide-react";
import { listGames } from "@/lib/catalog";
import { listMods } from "@/lib/mods";
import { pageMetadata } from "@/lib/seo";
import { JsonLd, graph, breadcrumbSchema, ORGANIZATION_ID } from "@/components/JsonLd";
import { ModsCatalog } from "@/components/ModsCatalog";
import { absoluteUrl } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Free Game Mods & Add-ons",
  description:
    "Every mod, total conversion and add-on pack for games in the PlayBound catalog — grouped by game, all free, one-click installable.",
  path: "/mods",
});

export default async function ModsIndexPage() {
  const [mods, games] = await Promise.all([listMods(), listGames()]);
  const gameBySlug = new Map(games.map((g) => [g.slug, g]));

  const grouped = new Map<string, typeof mods>();
  for (const mod of mods) {
    const list = grouped.get(mod.baseGameSlug) ?? [];
    list.push(mod);
    grouped.set(mod.baseGameSlug, list);
  }
  const sections = [...grouped.entries()]
    .sort((a, b) => {
      const nameA = gameBySlug.get(a[0])?.title ?? a[0];
      const nameB = gameBySlug.get(b[0])?.title ?? b[0];
      return nameA.localeCompare(nameB);
    })
    .map(([gameSlug, list]) => ({ gameSlug, mods: list }));

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
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
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

      <div className="flex items-center gap-2 text-sm font-semibold text-primary">
        <Puzzle className="size-4" /> Mods &amp; add-ons
      </div>
      <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">
        Free mods and add-ons
      </h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
        {mods.length} free add-on{mods.length === 1 ? "" : "s"} for games in the
        PlayBound catalog — total conversions, map packs, AI opponents and content
        libraries. All free, all installable through the launcher.
      </p>

      {sections.length === 0 ? (
        <p className="mt-10 text-muted-foreground">No mods published yet.</p>
      ) : (
        <ModsCatalog sections={sections} gamesBySlug={gamesBySlug} />
      )}
    </div>
  );
}
