import Link from "next/link";
import { Mail } from "lucide-react";
import { gamesFor } from "@/lib/catalog";
import { issuesNewestFirst, issueSlug } from "@/lib/data/weekly";
import { pageMetadata, sizeLabel } from "@/lib/seo";
import { NewsletterForm } from "@/components/NewsletterForm";
import { RecaptchaNotice } from "@/components/RecaptchaNotice";
import { JsonLd, graph, breadcrumbSchema, ORGANIZATION_ID } from "@/components/JsonLd";
import { absoluteUrl } from "@/lib/site";

export const metadata = pageMetadata({
  title: "PlayBound Weekly — Every Pick, Archived",
  description:
    "One high-quality free game every Friday, with the reasoning. Browse every PlayBound Weekly pick — dated, verdicted, and permanently archived.",
  path: "/weekly",
});

export default async function WeeklyIndexPage() {
  const issues = issuesNewestFirst();
  const games = await gamesFor(issues.map((i) => i.gameSlug));
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
              "Archive of every PlayBound Weekly pick — one high-quality free game per week.",
            publisher: { "@id": ORGANIZATION_ID },
          },
          {
            "@type": "ItemList",
            name: "PlayBound Weekly picks",
            numberOfItems: issues.length,
            itemListElement: issues.map((issue, i) => ({
              "@type": "ListItem",
              position: i + 1,
              url: absoluteUrl(`/weekly/${issueSlug(issue)}`),
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
        One free game worth playing, every Friday
      </h1>
      <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
        Every pick has cleared the{" "}
        <Link href="/standards" className="font-semibold text-primary hover:underline">
          PlayBound Bar
        </Link>{" "}
        — genuinely free, finished, maintained, good on its own merits, and impossible
        to shut down. Here is every issue, with the reasoning.
      </p>

      <div className="mt-8 rounded-xl border border-border bg-card p-5">
        <p className="font-bold">Get it in your inbox</p>
        <p className="mt-1 text-sm text-muted-foreground">
          One email every Friday. No spam, unsubscribe any time.
        </p>
        <div className="mt-4">
          <NewsletterForm />
        </div>
        <RecaptchaNotice className="mt-3" />
      </div>

      {/* Tabular archive. Tables extract cleanly; this is the block most
          likely to be quoted as "PlayBound's picks". */}
      <section className="mt-12">
        <h2 className="text-2xl font-bold">Every pick</h2>
        {issues.length === 0 ? (
          <p className="mt-3 text-muted-foreground">
            The first issue lands this Friday.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-card">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Week</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Game</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Genre</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Size</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Verdict</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {issues.map((issue) => {
                  const game = bySlug.get(issue.gameSlug);
                  return (
                    <tr key={issueSlug(issue)}>
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        <time dateTime={issue.publishedAt}>
                          {issue.year} · W{String(issue.week).padStart(2, "0")}
                        </time>
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        <Link
                          href={`/weekly/${issueSlug(issue)}`}
                          className="text-primary hover:underline"
                        >
                          {game?.title ?? issue.gameSlug}
                        </Link>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        {game?.genres.slice(0, 2).join(" · ") ?? "—"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        {game ? sizeLabel(game.sizeMB) : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{issue.headline}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
