import { notFound } from "next/navigation";
import { Globe, MapPin, Newspaper } from "lucide-react";
import { getDeveloper } from "@/lib/developers";
import { gamesByDeveloper } from "@/lib/catalog";
import { DiscoverableCountTile } from "@/components/access/DiscoverableCountTile";
import { fetchGithubReleases } from "@/lib/github";
import { CompatibleCardRow } from "@/components/CompatibleCardRow";
import { getCatalogLiveStats, playingNowBySlug } from "@/lib/liveActivity";
import { Avatar, Badge, SectionHeader, StatTile } from "@/components/ui/bits";
import { withOutboundUtm } from "@/lib/utm";
import { pageMetadata } from "@/lib/seo";
import { absoluteUrl } from "@/lib/site";
import { JsonLd, graph, itemListSchema, breadcrumbSchema } from "@/components/JsonLd";

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
  const dev = await getDeveloper(slug);
  if (!dev) return { title: "Developer Not Found", robots: { index: false, follow: false } };

  /*
   * Built through pageMetadata rather than returned bare, so this page states
   * its own canonical and description instead of inheriting the site defaults.
   *
   * This used to be load-bearing in a stronger sense: the root layout declared
   * `canonical: "/"`, which every page without its own adopted, and the whole
   * developer section was telling crawlers the homepage was its canonical
   * version. That declaration is gone, so a missing canonical now means no tag
   * rather than a wrong one — but setting it here is still correct.
   */
  const games = await gamesByDeveloper(dev.slug);
  const titles = games.slice(0, 3).map((g) => g.title);
  const madeBy = titles.length
    ? ` Free games from ${dev.name} in the PlayBound catalog: ${titles.join(", ")}.`
    : "";

  return pageMetadata({
    title: `${dev.name} — Free Games & Downloads`,
    description: `${dev.tagline || dev.about || `${dev.name} builds free games.`}${madeBy}`,
    path: `/developers/${dev.slug}`,
    /*
     * This page renders a games list and nothing else, so a developer with no
     * published games is a name, a tagline and empty space. There are far more
     * developer records than games — mod authors and the developers of
     * unpublished drafts included — and indexing that many near-empty pages
     * spends crawl budget and drags sitewide quality signals for no traffic.
     * They stay reachable and followable; they just do not compete in search.
     * If this page ever lists a developer's mods too, revisit the condition.
     */
    noIndex: games.length === 0,
  });
}

export default async function DeveloperPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const dev = await getDeveloper(slug);
  if (!dev) notFound();

  /*
   * Every game by this developer, unfiltered.
   *
   * Discovery mode used to be applied here, which meant reading a cookie —
   * and a cookie read opts the whole route out of prerendering, so this page
   * was re-rendered from scratch for every visitor and never cached at the
   * edge. The filter was also redundant: CompatibleCardRow already applies
   * the viewer's mode client-side, so it ran twice and only the second one
   * was load-bearing.
   *
   * Rendering the canonical set also settles which repo the Releases section
   * follows. That used to be picked from the post-filter list, so a FREE-mode
   * viewer could be shown a different developer's release feed than everyone
   * else on the same URL.
   */
  const [devGames, liveStats] = await Promise.all([
    gamesByDeveloper(dev.slug),
    getCatalogLiveStats(),
  ]);
  const repo = devGames.find((g) => g.githubRepo)?.githubRepo;
  const releases = repo ? await fetchGithubReleases(repo, 3) : [];

  return (
    <div className="space-y-10 px-4 py-6 sm:px-6 lg:px-8">
      {/*
        The developer as an entity in its own right, linked to the games it
        made. Without this the page was a list of VideoGames with nothing
        saying who they belong to, which is the one fact the page exists for.
      */}
      <JsonLd
        data={graph(
          {
            "@type": "Organization",
            "@id": absoluteUrl(`/developers/${dev.slug}`) + "#developer",
            name: dev.name,
            url: absoluteUrl(`/developers/${dev.slug}`),
            ...(dev.tagline || dev.about ? { description: dev.tagline || dev.about } : {}),
            ...(dev.website ? { sameAs: [dev.website] } : {}),
          },
          devGames.length
            ? itemListSchema(
                `Games by ${dev.name}`,
                `Games from ${dev.name} in the PlayBound catalog.`,
                `/developers/${dev.slug}`,
                devGames
              )
            : null,
          breadcrumbSchema([
            { name: "Developers", path: "/developers" },
            { name: dev.name, path: `/developers/${dev.slug}` },
          ])
        )}
      />
      <section
        className="relative overflow-hidden rounded-2xl border border-border p-6 sm:p-8"
        style={{ background: `linear-gradient(135deg, oklch(0.3 0.09 ${dev.artHue} / 60%), var(--card) 65%)` }}
      >
        <div className="flex flex-wrap items-center gap-5">
          <Avatar name={dev.name} hue={dev.artHue} size="xl" />
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-extrabold tracking-tight">{dev.name}</h1>
            <p className="mt-1 text-muted-foreground">{dev.tagline}</p>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPin className="size-3" /> {dev.location}
              </span>
              <span>Founded {dev.founded}</span>
              <a
                href={withOutboundUtm(dev.website, {
                  campaign: "developer",
                  content: dev.slug,
                })}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 hover:text-foreground hover:underline"
              >
                <Globe className="size-3" /> Website
              </a>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <DiscoverableCountTile label="Games" slugs={devGames.map((g) => g.slug)} />
        <StatTile label="Founded" value={String(dev.founded)} />
        <StatTile label="Location" value={dev.location} />
      </div>

      <section>
        <h2 className="text-lg font-bold">About</h2>
        <p className="mt-2 max-w-3xl leading-relaxed text-muted-foreground">{dev.about}</p>
      </section>

      <section>
        <SectionHeader title="Games" subtitle={`Everything by ${dev.name} on PlayBound`} />
        <CompatibleCardRow games={devGames} playingNowBySlug={playingNowBySlug(liveStats)} />
      </section>

      {releases.length > 0 && (
        <section>
          <SectionHeader title="Latest Releases" subtitle="Pulled live from GitHub" />
          <div className="grid gap-3 lg:grid-cols-3">
            {releases.map((r) => (
              <a
                key={r.tagName}
                href={withOutboundUtm(r.url, {
                  campaign: "developer",
                  content: dev.slug,
                })}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
              >
                <Badge tone="brand">
                  <Newspaper className="size-3" /> {new Date(r.publishedAt).toLocaleDateString()}
                </Badge>
                <h3 className="mt-2 font-bold">{r.name}</h3>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
