import Link from "next/link";
import { Mail } from "lucide-react";
import { gamesFor } from "@/lib/catalog";
import { listWeeklyIssues } from "@/lib/weekly";
import { pageMetadata, sizeLabel } from "@/lib/seo";
import { NewsletterForm } from "@/components/NewsletterForm";
import { RecaptchaNotice } from "@/components/RecaptchaNotice";
import { JsonLd, graph, breadcrumbSchema, ORGANIZATION_ID } from "@/components/JsonLd";
import { absoluteUrl } from "@/lib/site";

/*
 * ISR, matched to the live-activity window — see developers/page.tsx for the
 * reasoning. Admin writes still land immediately via revalidateTag("catalog").
 */
export const revalidate = 900;

export const metadata = pageMetadata({
  title: "PlayBound Weekly — Every Pick, Archived",
  description:
    "One high-value game every Wednesday. Browse every free or affordable PlayBound Weekly pick — dated and permanently archived.",
  path: "/weekly",
});

export default async function WeeklyIndexPage() {
  /*
   * The complete archive. Discovery mode is not applied here.
   *
   * Weekly is a publication, and this is its back catalogue — filtering it
   * removed whole past issues from the archive index rather than hiding a
   * card, which is not what a browsing preference should do to editorial. The
   * section's own description ("one high-value free or affordable game per
   * week") says outright that some picks are paid, so dropping those in FREE
   * mode contradicted the thing it was describing.
   *
   * It also cost the route its prerendering: resolving the mode means reading
   * a cookie, and that one read makes the whole page render per request.
   */
  const visibleIssues = await listWeeklyIssues();
  const games = await gamesFor(visibleIssues.map((i) => i.gameSlug));
  const bySlug = new Map(games.map((g) => [g.slug, g]));

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <JsonLd
        data={graph(
          {
            "@type": "CollectionPage",
            name: "PlayBound Weekly",
            url: absoluteUrl("/weekly"),
            description:
              "Archive of every PlayBound Weekly pick — one high-value free or affordable game per week.",
            publisher: { "@id": ORGANIZATION_ID },
          },
          {
            "@type": "ItemList",
            name: "PlayBound Weekly picks",
            numberOfItems: visibleIssues.length,
            itemListElement: visibleIssues.map((issue, i) => ({
              "@type": "ListItem",
              position: i + 1,
              url: absoluteUrl(`/weekly/${issue.slug}`),
              name: `Week ${issue.week}, ${issue.year}: ${bySlug.get(issue.gameSlug)?.title ?? issue.gameSlug}`,
            })),
          },
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Weekly", path: "/weekly" },
          ])
        )}
      />

      <div className="flex items-center gap-2 text-sm font-semibold text-primary">
        <Mail className="size-4" /> The PlayBound Weekly
      </div>
      <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">
        One budget-friendly game worth playing, every Wednesday
      </h1>
      <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
        Every pick has cleared the{" "}
        <Link href="/standards" className="font-semibold text-primary hover:underline">
          PlayBound Bar
        </Link>{" "}
        — worth the cost, ready to play, tested by PlayBound, and built around That One Thing. Every pick is
        tested and played before it is added.
        Here is every issue.
      </p>

      <div className="mt-8 rounded-xl border border-border bg-card p-5">
        <p className="font-bold">Get it in your inbox</p>
        <p className="mt-1 text-sm text-muted-foreground">
          One email every Wednesday. No spam, unsubscribe any time.
        </p>
        <div className="mt-4">
          <NewsletterForm />
        </div>
        <RecaptchaNotice className="mt-3" />
      </div>

      {visibleIssues.length === 0 ? (
        <p className="mt-10 text-sm text-muted-foreground">The first issue lands this Wednesday.</p>
      ) : (
        <div className="mt-10 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="border-b border-border bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Week</th>
                <th className="px-4 py-3 font-semibold">Game</th>
                <th className="px-4 py-3 font-semibold">Date</th>
              </tr>
            </thead>
            <tbody>
              {visibleIssues.map((issue) => {
                const game = bySlug.get(issue.gameSlug);
                return (
                  <tr key={issue.slug} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-semibold">
                      <Link href={`/weekly/${issue.slug}`} className="hover:text-primary">
                        {issue.year} W{issue.week}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/weekly/${issue.slug}`} className="font-semibold hover:text-primary">
                        {game?.title ?? issue.gameSlug}
                      </Link>
                      {game?.tagline && (
                        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{game.tagline}</p>
                      )}
                      {game && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {game.genres.join(" · ")} · {sizeLabel(game.sizeMB)}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{issue.publishedAt}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
