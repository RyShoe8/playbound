import Link from "next/link";
import { Check, ShieldCheck } from "lucide-react";
import { listGames } from "@/lib/catalog";
import { QUALITY_BAR, SITE_NAME } from "@/lib/site";
import { pageMetadata } from "@/lib/seo";
import { JsonLd, graph, breadcrumbSchema, faqSchema, ORGANIZATION_ID } from "@/components/JsonLd";
import { absoluteUrl } from "@/lib/site";

export const metadata = pageMetadata({
  title: "The PlayBound Bar — Our Standard",
  description:
    "Four criteria every game must clear to make the PlayBound catalog: worth the cost, ready to play, tested by PlayBound, and That One Thing.",
  path: "/standards",
});

const FAQ = [
  {
    q: "What does PlayBound mean by 'worth the cost'?",
    a: "The game is free, or it gives you far more than its price suggests. A deep discount, years of mods and total conversions, or a lively multiplayer community can add lasting value. There is no fixed price ceiling. Optional cosmetics and expansions are fine, but paid competitive advantages, disguised trials, and paywalled core content fail the bar. Price alone never makes a game good enough to recommend.",
  },
  {
    q: "Why does PlayBound have so few games?",
    a: "Because the catalog is the recommendation. Adding a mediocre game to reach a bigger number would weaken the only thing that makes the list useful. Every title is here because an editor installed it, played it, and it cleared all four criteria — comprehensiveness is not a goal.",
  },
  {
    q: "Do you actually play the games before listing them?",
    a: "Yes. We install it, launch it, and play it ourselves. We have spent hours building definitive editions and making multiplayer work because a store-page claim is not the same as a game we can confidently put in front of you. If we cannot get a real session going, it does not ship.",
  },
  {
    q: "Does every game need multiplayer?",
    a: "No. We love great single-player games. But good multiplayer is a major reason we choose a game: a lasting community, a memorable co-op night, or a competitive scene you can actually join makes a game more valuable. When we recommend multiplayer, we test how it works rather than relying on a store badge.",
  },
  {
    q: "How often is the standard re-checked?",
    a: "Each game carries a last-verified date shown on its page. If a game stops meeting the bar, that is recorded rather than hidden.",
  },
  {
    q: "What is 'That One Thing'?",
    a: "It is the hook we would excitedly tell a friend about: a mechanic, story, art style, soundtrack, control scheme, community, or a special way the game brings people together. Every catalog game needs a specific answer. If we cannot name one, fair pricing alone is not enough.",
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
    <div className="px-4 py-12 sm:px-6 lg:px-8">
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
      <p className="mt-4 max-w-3xl text-lg leading-relaxed text-muted-foreground">
        A great game should reward the time and money you put into it. That might mean
        a brilliant solo experience, years of mods and total conversions, or a
        multiplayer community that makes you want to come back. We look for the
        games that deliver, then make it easier to play their best versions.
      </p>
      <p className="mt-4 max-w-3xl leading-relaxed text-muted-foreground">
        So {SITE_NAME} is deliberately small. Every game is tested and played
        before it is added. A title earns a place here only if it clears all four
        criteria below — and we publish them so you can check our judgement
        against a stated standard rather than taking it on trust.
      </p>

      <ol className="mt-10 grid gap-5 sm:grid-cols-2">
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

      <section className="mt-12 overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/15 via-card to-card p-6 sm:p-8">
        <p className="text-xs font-extrabold tracking-[0.18em] text-primary uppercase">The value rule</p>
        <h2 className="mt-2 text-2xl font-extrabold tracking-tight">Small price. Ridiculous value.</h2>
        <div className="mt-3 max-w-3xl space-y-3 leading-relaxed text-muted-foreground">
          <p>
            We focus on games that return far more than they ask for: genuinely good free games,
            and affordable paid games whose depth, discounts, mods, editions, or multiplayer
            communities make them easy to keep playing.
          </p>
          <p>
            A deep sale can open the door, but the game still has to be good. Mods and total
            conversions can turn one purchase into whole new experiences; a thriving co-op or
            competitive scene can make every session different. We weigh what you get against
            what you pay, without a fixed price ceiling.
          </p>
          <p>
            None of this is a claim that developers should work for less. Good developers deserve
            to be paid. We simply know who we are building for: players who want a deep library,
            great multiplayer nights, and far more game than their budget should normally buy.
          </p>
        </div>
      </section>

      <section className="mt-12 rounded-xl border-l-4 border-primary bg-card p-6">
        <h2 className="text-xl font-bold">What this rules out</h2>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          Plenty of well-known free games fail this standard, and that is the point.
          A game that sells competitive advantages or locks its core experience behind later payments fails criterion one. A promising early-access
          project that is not enjoyable yet fails criterion two. A game we could not
          get running, or that falls over in a normal session, fails criterion
          three. Games without a memorable hook fail criterion four — fair pricing
          alone is not a recommendation; there has to be one thing worth telling a friend about.
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
