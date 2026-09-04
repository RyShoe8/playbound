import { notFound } from "next/navigation";
import Link from "next/link";
import { getGame } from "@/lib/catalog";
import { pageMetadata, privateMetadata, gameTitle } from "@/lib/seo";
import { viewerCanSeeTesting } from "@/lib/requestIncludesTesting";
import { JsonLd, breadcrumbSchema, gameId } from "@/components/JsonLd";
import {
  CONTROL_SCHEME_BLURBS,
  CONTROL_SCHEME_LABELS,
  documentedSchemes,
  groupBindings,
  hasControls,
} from "@/lib/controls/types";
import { SITE_URL } from "@/lib/site";

/**
 * Default controls, as a real URL rather than a ?tab=.
 *
 * The game hub's tabs are deliberately not indexable — its canonical collapses
 * every ?tab= variant into one page — so a controls tab there would be
 * invisible to search. "<game> controls" and "<game> keybinds" are searches
 * people make before they install, currently answered by a wiki somewhere
 * else, which is exactly the case PROMOTED_ROUTES exists for.
 *
 * The bindings are a real <table> with a <caption> per scheme: it is the
 * honest markup for tabular data, it is what a screen reader needs, and it is
 * what a crawler can actually read.
 */

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const includeTesting = await viewerCanSeeTesting();
  const game = await getGame(slug, { includeTesting });
  if (!game) return privateMetadata("Controls Not Found");
  if (game.status === "testing") return privateMetadata(gameTitle(game));

  const schemes = documentedSchemes(game.controls)
    .filter((s) => s.bindings.length > 0)
    .map((s) => CONTROL_SCHEME_LABELS[s.scheme].toLowerCase());

  const list =
    schemes.length > 1
      ? `${schemes.slice(0, -1).join(", ")} and ${schemes[schemes.length - 1]}`
      : schemes[0] || "keyboard";

  return pageMetadata({
    title: `${game.title} Controls & Keybinds`,
    description: `Default ${list} controls for ${game.title} — every key, button and binding, with the source they came from.`,
    path: `/games/${game.slug}/controls`,
    images: game.coverImage ? [game.coverImage] : undefined,
  });
}

export default async function GameControlsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const includeTesting = await viewerCanSeeTesting();
  const game = await getGame(slug, { includeTesting });
  if (!game) notFound();

  const schemes = documentedSchemes(game.controls);
  /*
   * A page with nothing on it is worse than no page: it is a thin result that
   * makes the site look padded. Until a game has bindings, this 404s and the
   * game hub does not link to it.
   */
  if (!hasControls(game.controls)) notFound();

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <JsonLd
        data={breadcrumbSchema([
          { name: "Games", path: "/games" },
          { name: game.title, path: `/games/${game.slug}` },
          { name: "Controls", path: `/games/${game.slug}/controls` },
        ])}
      />
      {/* Ties the page to the game's own entity rather than standing alone. */}
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          "@id": `${SITE_URL}/games/${game.slug}/controls#webpage`,
          url: `${SITE_URL}/games/${game.slug}/controls`,
          name: `${game.title} controls and keybinds`,
          about: { "@id": gameId(game.slug) },
          isPartOf: { "@id": `${SITE_URL}/#website` },
        }}
      />

      <header className="space-y-3">
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <Link href="/games" className="hover:underline">
            Games
          </Link>
          <span aria-hidden="true"> / </span>
          <Link href={`/games/${game.slug}`} className="hover:underline">
            {game.title}
          </Link>
          <span aria-hidden="true"> / </span>
          <span aria-current="page">Controls</span>
        </nav>
        <h1 className="text-3xl font-black tracking-tight">{game.title} controls</h1>
        <p className="max-w-2xl text-muted-foreground">
          Default bindings for every input method {game.title} supports. These are the
          game&apos;s own defaults — anything you have remapped will differ.
        </p>
        {game.controls?.notes ? (
          <p className="max-w-2xl rounded-lg border border-border bg-muted/40 p-3 text-sm">
            {game.controls.notes}
          </p>
        ) : null}
      </header>

      {schemes.map((block) => {
        const groups = groupBindings(block.bindings);
        return (
          <section key={block.scheme} className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-xl font-bold">{CONTROL_SCHEME_LABELS[block.scheme]}</h2>
              <p className="text-sm text-muted-foreground">
                {block.supported
                  ? CONTROL_SCHEME_BLURBS[block.scheme]
                  : `${game.title} does not support this input method.`}
              </p>
            </div>

            {block.notes ? (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                {block.notes}
              </p>
            ) : null}

            {groups.map(({ group, bindings }) => (
              <div key={group} className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <caption className="pb-2 text-left font-semibold">
                    {group} — {CONTROL_SCHEME_LABELS[block.scheme]}
                  </caption>
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th scope="col" className="py-2 pr-4 font-semibold">
                        Action
                      </th>
                      <th scope="col" className="py-2 font-semibold">
                        Default input
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {bindings.map((b) => (
                      <tr key={`${b.action}-${b.input}`} className="border-b border-border/50">
                        <th scope="row" className="py-2 pr-4 text-left font-normal">
                          {b.action}
                          {b.note ? (
                            <span className="block text-xs text-muted-foreground">{b.note}</span>
                          ) : null}
                        </th>
                        <td className="py-2">
                          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
                            {b.input}
                          </kbd>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

            {block.sourceUrl ? (
              <p className="text-xs text-muted-foreground">
                Source:{" "}
                <a
                  href={block.sourceUrl}
                  rel="nofollow noopener noreferrer"
                  target="_blank"
                  className="underline"
                >
                  {block.sourceLabel || "official documentation"}
                </a>
                {block.verified ? " · verified against the game by PlayBound" : null}
              </p>
            ) : block.verified ? (
              <p className="text-xs text-muted-foreground">Verified against the game by PlayBound.</p>
            ) : null}
          </section>
        );
      })}

      <p className="text-sm">
        <Link href={`/games/${game.slug}`} className="underline">
          Back to {game.title}
        </Link>
      </p>
    </div>
  );
}
