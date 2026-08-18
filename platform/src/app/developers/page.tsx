import Link from "next/link";
import { Users } from "lucide-react";
import { listDiscoverableGames } from "@/lib/access/discover";
import { listDevelopers } from "@/lib/developers";
import { pageMetadata } from "@/lib/seo";
import { Avatar } from "@/components/ui/bits";
import { JsonLd, graph, breadcrumbSchema, ORGANIZATION_ID } from "@/components/JsonLd";
import { absoluteUrl } from "@/lib/site";

export const metadata = pageMetadata({
  title: "The Teams Behind the Free Games",
  description:
    "The volunteer teams and studios who build and maintain the free games in the PlayBound catalog — and what each of them has shipped.",
  path: "/developers",
});

export default async function DevelopersIndexPage() {
  const games = await listDiscoverableGames();
  const countBySlug = new Map<string, number>();
  for (const game of games) {
    countBySlug.set(game.developerSlug, (countBySlug.get(game.developerSlug) ?? 0) + 1);
  }

  // Only show teams with a game in the catalog — avoids empty profile pages.
  const active = (await listDevelopers())
    .filter((d) => (countBySlug.get(d.slug) ?? 0) > 0)
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

      <ul className="mt-10 grid gap-3 sm:grid-cols-2">
        {active.map((dev) => (
          <li key={dev.slug}>
            <Link
              href={`/developers/${dev.slug}`}
              className="flex h-full items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
            >
              <Avatar name={dev.name} hue={dev.artHue} size="lg" />
              <div className="min-w-0">
                <p className="font-bold">{dev.name}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{dev.tagline}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {countBySlug.get(dev.slug)}{" "}
                  {countBySlug.get(dev.slug) === 1 ? "game" : "games"} · since{" "}
                  {dev.founded}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
