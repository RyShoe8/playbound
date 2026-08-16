import Link from "next/link";
import { Check, ShieldCheck } from "lucide-react";
import { listGames } from "@/lib/catalog";
import { QUALITY_BAR, SITE_NAME } from "@/lib/site";
import { pageMetadata } from "@/lib/seo";
import { JsonLd, graph, breadcrumbSchema, faqSchema, ORGANIZATION_ID } from "@/components/JsonLd";
import { absoluteUrl } from "@/lib/site";

export const metadata = pageMetadata({
  title: "The PlayBound Bar — Our Standard for Free Games",
  description:
    "Four criteria every game must clear to make the PlayBound catalog: genuinely free, finished enough to enjoy, plays reliably, and high quality or showing good potential. Every game is tested and played before it is added.",
  path: "/standards",
});

const FAQ = [
  {
    q: "What does PlayBound mean by 'genuinely free'?",
    a: "No trial period, no paywalled campaign, no pay-to-win purchases, and no cosmetic treadmill designed to extract money over time. If any part of the game a reasonable player would consider core is behind a payment, it does not qualify. Free-to-play games funded by monetisation pressure are excluded even when technically free to download.",
  },
  {
    q: "Why does PlayBound have so few games?",
    a: "Because the catalog is the recommendation. Adding a mediocre game to reach a bigger number would weaken the only thing that makes the list useful. Every title is here because an editor installed it, played it, and it cleared all four criteria — comprehensiveness is not a goal.",
  },
  {
    q: "Do you actually play the games before listing them?",
    a: "Yes. Every game is tested and played before it is added to the platform. Criterion three — plays reliably — means we launched it ourselves, not that we copied a store page. If we cannot get a real session going, it does not ship.",
  },
  {
    q: "How often is the standard re-checked?",
    a: "Each game carries a last-verified date shown on its page. If a game stops meeting the bar, that is recorded rather than hidden.",
  },
  {
    q: "What does 'high quality or shows good potential' mean?",
    a: "There are tens of thousands of free games. Most are not worth your evening. Criterion four is catalog selectivity: the game is already excellent, or it is clearly becoming something worth your time. Volume is not a goal, and we do not list games we have not played.",
  },
  {
    q: "Does a game have to be open-source to be listed?",
    a: "No. Open source is a nice-to-have when present — permanence and community forks are genuine advantages — but it is not a PlayBound Bar criterion. A game earns a place by clearing the four published standards, whether or not its source is public.",
  },
  {
    q: "Who decides?",
    a: "PlayBound's editors. The criteria are published here precisely so the judgement can be checked against a stated standard rather than taken on trust. Each game page shows which criteria it met and when that was last verified.",
  },
];

export default async function StandardsPage() {
  const games = await listGames();
  const verified = games.filter((g) => g.qualityBar).length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <JsonLd
        data={graph(
          {
            "@type": "AboutPage",
            name: "The PlayBound Bar",
            url: absoluteUrl("/standards"),
            description:
              "The four published criteria every game must clear to be listed on PlayBound.",
            publisher: { "@id": ORGANIZATION_ID },
          },
          faqSchema(FAQ),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "The PlayBound Bar", path: "/standards" },
          ])
        )}
      />

      <div className="flex items-center gap-2 text-sm font-semibold text-primary">
        <ShieldCheck className="size-4" /> Our standard
      </div>
      <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">
        The PlayBound Bar
      </h1>
      <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
        Free games are not scarce. There are tens of thousands of them, and most are
        not worth your evening. What is scarce is a trustworthy answer to which ones
        are actually good.
      </p>
      <p className="mt-4 leading-relaxed text-muted-foreground">
        So {SITE_NAME} is deliberately small. Every game is tested and played
        before it is added. A title earns a place here only if it clears all four
        criteria below — and we publish them so you can check our judgement
        against a stated standard rather than taking it on trust.
      </p>

      <ol className="mt-10 space-y-5">
        {QUALITY_BAR.map((criterion, i) => (
          <li
            key={criterion.key}
            className="rounded-xl border border-border bg-card p-5"
          >
            <div className="flex items-start gap-4">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                {i + 1}
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-bold">{criterion.title}</h2>
                <p className="mt-1.5 leading-relaxed text-muted-foreground">
                  {criterion.description}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <section className="mt-12 rounded-xl border-l-4 border-primary bg-card p-6">
        <h2 className="text-xl font-bold">What this rules out</h2>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          Plenty of well-known free games fail this standard, and that is the point.
          A game funded by a battle pass fails criterion one. A promising early-access
          project that is not enjoyable yet fails criterion two. A game we could not
          get running, or that falls over in a normal session, fails criterion
          three. Low-quality shovelware and free-game noise fail criterion four —
          we have to play it, and it has to be good or clearly becoming good.
        </p>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          {verified > 0 ? (
            <>
              {verified} {verified === 1 ? "game has" : "games have"} been assessed
              against the bar so far, each with a visible verdict and verification
              date on its page.
            </>
          ) : (
            <>Every game page carries its verdict and a verification date.</>
          )}
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-bold">Questions</h2>
        <div className="mt-4 divide-y divide-border rounded-xl border border-border bg-card">
          {FAQ.map((item) => (
            <div key={item.q} className="p-5">
              <h3 className="font-semibold">{item.q}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {item.a}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-12 flex flex-wrap gap-3">
        <Link
          href="/discover"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Check className="size-4" /> See the games that cleared it
        </Link>
        <Link
          href="/weekly"
          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-bold transition-colors hover:border-primary/40"
        >
          Read the Weekly
        </Link>
      </div>
    </div>
  );
}
