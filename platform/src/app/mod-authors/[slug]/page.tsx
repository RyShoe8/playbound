import { notFound } from "next/navigation";
import Link from "next/link";
import { Globe, MapPin, Package } from "lucide-react";
import { getModAuthor, modsByAuthor, HOST_LABELS } from "@/lib/modAuthors";
import { modAuthors } from "@/lib/data/modAuthors";
import { pageMetadata } from "@/lib/seo";
import { withOutboundUtm } from "@/lib/utm";
import { Badge, SectionHeader } from "@/components/ui/bits";
import { JsonLd, graph, breadcrumbSchema } from "@/components/JsonLd";

/*
 * A mod author is not a studio, and this page is deliberately not the
 * developer page.
 *
 * /developers/[slug] leads with tagline, founded year and location because a
 * studio has those. A modder usually does not, and the ones we credit here
 * were verified from GitHub, Luanti, Codeberg, GitLab or the OpenTTD BaNaNaS
 * API — which give a name, a profile and sometimes a bio, and nothing more.
 * Rather than pad that into a studio template with invented facts, this page
 * shows what is true: who they are, where they publish, and what they made.
 *
 * No route-level `revalidate`: this project runs with cacheComponents, which
 * rejects that segment config outright. Freshness comes from the mods list's
 * own cache and the revalidateTag("mods") that catalog writes already fire.
 */
export function generateStaticParams() {
  /*
   * From the static registry, not the catalog.
   *
   * Cache Components requires this to return at least one result, and a
   * version that asked the database for "authors who have a published mod"
   * returned nothing whenever the database was unreachable — which failed the
   * build rather than degrading. The registry is the right source anyway: it
   * is the list of authors, it needs no connection, and an author whose mods
   * are all unpublished still gets noIndex from generateMetadata below.
   */
  return modAuthors.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const author = getModAuthor(slug);
  if (!author) return { title: "Mod Author Not Found", robots: { index: false, follow: false } };

  const mods = await modsByAuthor(slug);
  const titles = mods.slice(0, 3).map((m) => m.title);
  const made = titles.length ? ` Mods on PlayBound: ${titles.join(", ")}.` : "";

  return pageMetadata({
    title: `${author.name} — Mods & Downloads`,
    description: `${author.bio || `${author.name} makes mods for games in the PlayBound catalog.`}${made}`,
    path: `/mod-authors/${author.slug}`,
    // Same reasoning as the developer pages: an author with nothing published
    // is a name and empty space, and there is no value in indexing that.
    noIndex: mods.length === 0,
  });
}

export default async function ModAuthorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const author = getModAuthor(slug);
  if (!author) notFound();

  const mods = await modsByAuthor(slug);
  const profileHref = author.profileUrl
    ? withOutboundUtm(author.profileUrl, { campaign: "mod_author_profile" })
    : null;
  const siteHref = author.website
    ? withOutboundUtm(author.website, { campaign: "mod_author_site" })
    : null;

  return (
    <div className="space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <JsonLd
        data={graph([
          breadcrumbSchema([
            { name: "Mod authors", path: "/mod-authors" },
            { name: author.name, path: `/mod-authors/${author.slug}` },
          ]),
        ])}
      />

      <header className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="play">Mod author</Badge>
          <span className="text-xs font-semibold text-muted-foreground">
            {HOST_LABELS[author.host]}
          </span>
        </div>

        <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">{author.name}</h1>

        {/* The handle is only worth showing when it is not just the name again. */}
        {author.handle.toLowerCase() !== author.name.toLowerCase() && (
          <p className="mt-1 font-mono text-sm text-muted-foreground">{author.handle}</p>
        )}

        {author.bio && (
          <p className="mt-3 max-w-3xl leading-relaxed text-muted-foreground">{author.bio}</p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
          {profileHref ? (
            <a
              href={profileHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline"
            >
              <Package className="size-4" /> {HOST_LABELS[author.host]} profile
            </a>
          ) : (
            // A team credited by name on ModDB with no account behind it.
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <Package className="size-4" /> Credited on {HOST_LABELS[author.host]}
            </span>
          )}
          {siteHref && (
            <a
              href={siteHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline"
            >
              <Globe className="size-4" /> Website
            </a>
          )}
          {author.location && (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <MapPin className="size-3" /> {author.location}
            </span>
          )}
        </div>
      </header>

      <section>
        <SectionHeader
          title={`Mods by ${author.name}`}
          subtitle={
            mods.length
              ? `${mods.length} ${mods.length === 1 ? "mod" : "mods"} in the PlayBound catalog`
              : undefined
          }
        />
        {mods.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Nothing published under this author yet.
          </p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {mods.map((mod) => (
              <li key={mod.slug}>
                <Link
                  href={`/mods/${mod.slug}`}
                  className="block h-full rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/60"
                >
                  <p className="font-bold">{mod.title}</p>
                  {mod.tagline && (
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {mod.tagline}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    for {mod.baseGameSlug}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
