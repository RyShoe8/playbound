import Link from "next/link";
import { Mail, Sparkles, Gift, Rocket } from "lucide-react";
import { gamesFor } from "@/lib/catalog";
import { listWeeklyIssues } from "@/lib/weekly";
import { pageMetadata } from "@/lib/seo";
import { NewsletterForm } from "@/components/NewsletterForm";
import { RecaptchaNotice } from "@/components/RecaptchaNotice";
import { JsonLd, graph, breadcrumbSchema, ORGANIZATION_ID } from "@/components/JsonLd";
import { absoluteUrl } from "@/lib/site";

/*
 * ISR, matched to the live-activity window — see developers/page.tsx for the
 * reasoning. Admin writes still land immediately via revalidateTag("catalog").
 */

export const metadata = pageMetadata({
  title: "PlayBound Weekly — Games, Free Finds & Updates",
  description:
    "Your weekly PlayBound newsletter: new games to discover, awesome free games to play, and the latest PlayBound updates.",
  path: "/weekly",
});

export default async function WeeklyIndexPage() {
  // Keep every published issue in the archive, independent of discovery filters.
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
              "The PlayBound weekly newsletter: new games, awesome free games, and PlayBound updates.",
            publisher: { "@id": ORGANIZATION_ID },
          },
          {
            "@type": "ItemList",
            name: "PlayBound Weekly newsletter archive",
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
        Your next great game. Your weekly PlayBound update.
      </h1>
      <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
        New games to discover, awesome free games worth your time, and the latest
        from PlayBound — together in one weekly newsletter.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          { icon: Sparkles, title: "New games", text: "Fresh arrivals, new editions, and multiplayer discoveries to put on your radar.", href: "/discover", action: "Discover games" },
          { icon: Gift, title: "Awesome free games", text: "Standout free-to-play games and limited-time giveaways worth checking out.", href: "/deals", action: "Find free games" },
          { icon: Rocket, title: "PlayBound updates", text: "Launcher improvements, new features, community news, and upcoming Game Nights.", href: "/events", action: "See Game Nights" },
        ].map(({ icon: Icon, title, text, href, action }) => (
          <section key={title} className="rounded-xl border border-border bg-card p-5">
            <Icon className="size-6 text-primary" aria-hidden="true" />
            <h2 className="mt-3 text-lg font-bold">{title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
            <Link href={href} className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline">{action} →</Link>
          </section>
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-border bg-card p-5">
        <p className="font-bold">Get PlayBound Weekly in your inbox</p>
        <p className="mt-1 text-sm text-muted-foreground">
          One weekly email with new games, free finds, and PlayBound news. No spam. Unsubscribe any time.
        </p>
        <div className="mt-4">
          <NewsletterForm />
        </div>
        <RecaptchaNotice className="mt-3" />
      </div>

      <section className="mt-10" aria-labelledby="weekly-archive">
        <h2 id="weekly-archive" className="text-2xl font-bold">Previous issues</h2>
        <p className="mt-2 text-sm text-muted-foreground">Catch up on past editions, including our original featured-game picks.</p>
        {visibleIssues.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">Our next issue is on its way. Subscribe to get it in your inbox.</p>
        ) : (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {visibleIssues.map((issue) => (
              <Link key={issue.slug} href={`/weekly/${issue.slug}`} className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary">
                <p className="text-xs font-semibold text-primary">{issue.year} · Week {issue.week}</p>
                <h3 className="mt-2 font-bold">PlayBound Weekly</h3>
                <p className="mt-1 text-sm text-muted-foreground">Featured game: {bySlug.get(issue.gameSlug)?.title ?? issue.gameSlug}</p>
                <p className="mt-3 text-xs text-muted-foreground">{issue.publishedAt} · Read issue →</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
