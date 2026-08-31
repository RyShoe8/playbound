import { Users } from "lucide-react";
import { listGames } from "@/lib/catalog";
import { DeveloperDirectory } from "@/components/access/DeveloperDirectory";
import { listDevelopers } from "@/lib/developers";
import { pageMetadata } from "@/lib/seo";
import { JsonLd, graph, breadcrumbSchema, ORGANIZATION_ID } from "@/components/JsonLd";
import { absoluteUrl } from "@/lib/site";

/*
 * ISR, matched to the live-activity window.
 *
 * These pages carry player counts from getCatalogLiveStats, which shares a
 * 900s unstable_cache entry. Without a route-level revalidate the rendered
 * HTML would be cached until a catalog or developer edit dropped its tag, and
 * the counts inside it would sit at whatever they were when the page was first
 * built — the inner cache expiring does not re-render the page around it.
 * 900 keeps the page exactly as fresh as the freshest thing on it.
 *
 * Admin edits still land immediately: the writes call revalidateTag("catalog")
 * and revalidateTag("developers"), which drops the route cache too.
 */

export const metadata = pageMetadata({
  title: "The Teams Behind the Free Games",
  description:
    "The volunteer teams and studios who build and maintain the free games in the PlayBound catalog — and what each of them has shipped.",
  path: "/developers",
});

export default async function DevelopersIndexPage() {
  /*
   * The canonical directory: every published game, no viewer's mode applied.
   *
   * Narrowing here would mean reading a cookie, and a cookie read costs the
   * whole route its prerendering — to produce, for everyone who has not
   * touched the toggle, exactly the output below. DeveloperDirectory applies
   * the preference in the browser instead.
   */
  const games = await listGames();
  const slugsByDeveloper = new Map<string, string[]>();
  for (const game of games) {
    const bucket = slugsByDeveloper.get(game.developerSlug) ?? [];
    bucket.push(game.slug);
    slugsByDeveloper.set(game.developerSlug, bucket);
  }

  // Only teams with a game in the catalog — avoids empty profile pages.
  const active = (await listDevelopers())
    .filter((d) => (slugsByDeveloper.get(d.slug)?.length ?? 0) > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <JsonLd
        data={graph(
          {
            "@type": "CollectionPage",
            name: "The Teams Behind the Free Games",
            url: absoluteUrl("/developers"),
            publisher: { "@id": ORGANIZATION_ID },
          },
          {
            "@type": "ItemList",
            numberOfItems: active.length,
            itemListElement: active.map((d, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: d.name,
              url: absoluteUrl(`/developers/${d.slug}`),
            })),
          },
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Developers", path: "/developers" },
          ])
        )}
      />

      <div className="flex items-center gap-2 text-sm font-semibold text-primary">
        <Users className="size-4" /> Makers
      </div>
      <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">
        The teams behind the games
      </h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
        Almost everything in the catalog is built by volunteers who have kept a project
        alive for a decade or more without charging anyone a penny. Here they are.
      </p>

      <DeveloperDirectory
        developers={active.map((dev) => ({
          slug: dev.slug,
          name: dev.name,
          tagline: dev.tagline,
          founded: dev.founded,
          artHue: dev.artHue,
          gameSlugs: slugsByDeveloper.get(dev.slug) ?? [],
        }))}
      />
    </div>
  );
}
