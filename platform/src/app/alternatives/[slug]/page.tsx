import Link from "next/link";
import { notFound } from "next/navigation";
import { Award, Check } from "lucide-react";
import { gamesFor } from "@/lib/catalog";
import { alternativePages, alternativesBySlug } from "@/lib/data/alternatives";
import { pageMetadata, sizeLabel } from "@/lib/seo";
import { GameArt } from "@/components/GameArt";
import { PlayCta } from "@/components/GameCard";
import { Badge } from "@/components/ui/bits";
import {
  JsonLd,
  graph,
  itemListSchema,
  faqSchema,
  breadcrumbSchema,
  ORGANIZATION_ID,
} from "@/components/JsonLd";
import { absoluteUrl } from "@/lib/site";

export function generateStaticParams() {
  return alternativePages.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = alternativesBySlug.get(slug);
  if (!page) return { title: "Not Found" };

  return pageMetadata({
    /*
     * page.title already opens with "Free Alternatives to …", so the old
     * "(Free & Open Source)" suffix repeated the word Free and spent 21 of the
     * ~48 characters available before the layout's " · PlayBound" suffix.
     *
     * Two of these name a second game ("… Supreme Commander & Total
     * Annihilation") and still overflow on their own. Those drop the trailing
     * "& …" for the search result only — the full title stays as the h1 and in
     * the article schema, so nothing visible on the page changes.
     */
    title:
      page.title.length + " · PlayBound".length > 60
        ? page.title.split(" & ")[0]!
        : page.title,
    description: page.verdict,
    path: `/alternatives/${page.slug}`,
  });
}

export default async function AlternativesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = alternativesBySlug.get(slug);
  if (!page) notFound();

  const games = await gamesFor(page.picks.map((p) => p.slug));
  const bySlug = new Map(games.map((g) => [g.slug, g]));
  const ordered = page.picks
    .map((pick) => ({ pick, game: bySlug.get(pick.slug) }))
    .filter((x) => x.game);
  const top = ordered.find((x) => x.pick.slug === page.topPick) ?? ordered[0];

  const faq = [
    {
      q: `What is the best free alternative to ${page.commercialGame}?`,
      a: page.verdict,
    },
    {
      q: `Are these ${page.commercialGame} alternatives really free?`,
      a: "Yes. Every game listed here is free with no trial, no paywalled content and no pay-to-win purchases. Each has been tested and played, then assessed against PlayBound's four published criteria — including high quality or showing good potential.",
    },
    {
      q: `Do I need to pay for multiplayer in these ${page.commercialGame} alternatives?`,
      a: "No. None of these games charge for multiplayer. Public servers are community-run and free to join, and there is no subscription of any kind.",
    },
    ...ordered.slice(0, 3).map(({ pick, game }) => ({
      q: `How is ${game!.title} different from ${page.commercialGame}?`,
      a: pick.differences,
    })),
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <JsonLd
        data={graph(
          {
            "@type": "Article",
            headline: page.title,
            description: page.verdict,
            url: absoluteUrl(`/alternatives/${page.slug}`),
            author: { "@id": ORGANIZATION_ID },
            publisher: { "@id": ORGANIZATION_ID },
            about: { "@type": "VideoGame", name: page.commercialGame },
            isAccessibleForFree: true,
          },
          itemListSchema(
            page.title,
            page.verdict,
            `/alternatives/${page.slug}`,
            ordered.map((x) => x.game!)
          ),
          faqSchema(faq),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Alternatives", path: "/alternatives" },
            { name: page.commercialGame, path: `/alternatives/${page.slug}` },
          ])
        )}
      />

      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-primary">
        <Award className="size-4" /> Free alternatives
      </div>
      <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">
        {page.title}
      </h1>

      {/* Verdict block leads. Self-contained and quotable verbatim. */}
      <div className="mt-6 rounded-xl border-l-4 border-primary bg-card p-6">
        <h2 className="text-xs font-semibold tracking-wide text-primary uppercase">
          Short answer
        </h2>
        <p className="mt-2 text-lg leading-relaxed font-medium">{page.verdict}</p>
      </div>

      <p className="mt-6 leading-relaxed text-muted-foreground">{page.intro}</p>

      {top?.game && (
        <section className="mt-10">
          <h2 className="text-2xl font-bold">Our pick: {top.game.title}</h2>
          <div className="mt-4 overflow-hidden rounded-xl border border-border">
            <div className="relative h-40">
              <GameArt game={top.game} showTitle={false} className="absolute inset-0" />
              <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent" />
            </div>
            <div className="bg-card p-5">
              <div className="flex flex-wrap items-center gap-2">
                {top.game.genres.map((g) => (
                  <Badge key={g} tone="outline">
                    {g}
                  </Badge>
                ))}
                <Badge tone="outline">{sizeLabel(top.game.sizeMB)}</Badge>
                <Badge tone="outline">{top.game.license}</Badge>
              </div>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                {top.pick.pitch}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground">
                  How it differs from {page.commercialGame}:{" "}
                </span>
                {top.pick.differences}
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <PlayCta game={top.game} />
                <Link
                  href={`/games/${top.game.slug}`}
                  className="inline-flex items-center rounded-lg border border-border px-4 py-2 text-sm font-bold transition-colors hover:border-primary/40"
                >
                  Full details
                </Link>
                <Link
                  href={`/games/${top.game.slug}?tab=install`}
                  className="inline-flex items-center rounded-lg border border-border px-4 py-2 text-sm font-bold transition-colors hover:border-primary/40"
                >
                  How to install
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Comparison table — extracts cleanly, unlike prose. */}
      <section className="mt-12">
        <h2 className="text-2xl font-bold">
          All free {page.commercialGame} alternatives compared
        </h2>
        <div className="mt-4 overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-card">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Game</th>
                <th scope="col" className="px-4 py-3 font-semibold">Genre</th>
                <th scope="col" className="px-4 py-3 font-semibold">Size</th>
                <th scope="col" className="px-4 py-3 font-semibold">Licence</th>
                <th scope="col" className="px-4 py-3 font-semibold">Platforms</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ordered.map(({ game }) => (
                <tr key={game!.slug}>
                  <td className="px-4 py-3 font-semibold">
                    <Link
                      href={`/games/${game!.slug}`}
                      className="text-primary hover:underline"
                    >
                      {game!.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {game!.genres.slice(0, 2).join(" · ")}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {sizeLabel(game!.sizeMB)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {game!.license}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {game!.platforms.join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-12 space-y-6">
        {ordered.map(({ pick, game }) => (
          <div key={game!.slug} className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-lg font-bold">
              <Link href={`/games/${game!.slug}`} className="hover:text-primary">
                {game!.title}
              </Link>
            </h3>
            <p className="mt-2 leading-relaxed text-muted-foreground">{pick.pitch}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">The difference: </span>
              {pick.differences}
            </p>
            {game!.qualityBar?.verdict && (
              <p className="mt-3 flex gap-2 border-t border-border pt-3 text-sm text-muted-foreground">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                {game!.qualityBar.verdict}
              </p>
            )}
          </div>
        ))}
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-bold">Questions</h2>
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

      <p className="mt-10 border-t border-border pt-6 text-sm text-muted-foreground">
        Every game here has been assessed against{" "}
        <Link href="/standards" className="font-semibold text-primary hover:underline">
          the PlayBound Bar
        </Link>{" "}
        — four published criteria for whether a free game is actually worth your time.
        Every title is tested and played before it is added.
      </p>
    </div>
  );
}
