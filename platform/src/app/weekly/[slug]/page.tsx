import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail } from "lucide-react";
import { getGame } from "@/lib/catalog";
import { getDeveloper } from "@/lib/developers";
import { getWeeklyIssue, listWeeklyIssues } from "@/lib/weekly";
import { pageMetadata, sizeLabel } from "@/lib/seo";
import { GameArt } from "@/components/GameArt";
import { PlayCta } from "@/components/GameCard";
import { QualityBarPanel } from "@/components/QualityBarPanel";
import {
  JsonLd,
  graph,
  articleSchema,
  videoGameSchema,
  breadcrumbSchema,
} from "@/components/JsonLd";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const issue = await getWeeklyIssue(slug);
  if (!issue) return { title: "Issue Not Found" };
  const game = await getGame(issue.gameSlug);

  return pageMetadata({
    title: `${game?.title ?? issue.gameSlug} — PlayBound Weekly W${issue.week}`,
    description: game?.tagline ?? `PlayBound Weekly pick for week ${issue.week}, ${issue.year}.`,
    path: `/weekly/${slug}`,
    type: "article",
    publishedTime: issue.publishedAt,
    images: game?.coverImage ? [game.coverImage] : undefined,
  });
}

export default async function WeeklyIssuePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const issue = await getWeeklyIssue(slug);
  if (!issue) notFound();

  const game = await getGame(issue.gameSlug);
  if (!game) notFound();

  const developer = await getDeveloper(game.developerSlug);
  const all = await listWeeklyIssues();
  const index = all.findIndex((i) => i.slug === slug);
  const newer = index > 0 ? all[index - 1] : undefined;
  const older = index >= 0 && index < all.length - 1 ? all[index + 1] : undefined;

  const published = new Date(issue.publishedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div>
      <JsonLd
        data={graph(
          articleSchema({
            headline: game.title,
            description: game.tagline,
            path: `/weekly/${slug}`,
            datePublished: issue.publishedAt,
            image: game.coverImage,
          }),
          videoGameSchema(game, developer),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Weekly", path: "/weekly" },
            { name: `Week ${issue.week}, ${issue.year}`, path: `/weekly/${slug}` },
          ])
        )}
      />

      <section className="relative overflow-hidden border-b border-border">
        <GameArt game={game} showTitle={false} className="absolute inset-0" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-background/30" />
        <div className="relative mx-auto max-w-3xl px-4 pt-20 pb-8 sm:px-6 lg:px-8">
          <Link
            href="/weekly"
            className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> All issues
          </Link>
          <div className="mt-6 flex items-center gap-2 text-sm font-semibold text-primary">
            <Mail className="size-4" />
            PlayBound Weekly · Week {issue.week}, {issue.year}
          </div>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">{game.title}</h1>
          <p className="mt-2 text-lg text-muted-foreground">{game.tagline}</p>
          <p className="mt-4 text-sm text-muted-foreground">
            Published <time dateTime={issue.publishedAt}>{published}</time> ·{" "}
            {game.genres.join(" · ")} · {sizeLabel(game.sizeMB)} · {game.license}
          </p>
          <div className="mt-6">
            <PlayCta game={game} size="lg" />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-3xl space-y-10 px-4 py-10 sm:px-6 lg:px-8">
        <article className="space-y-5 leading-relaxed text-muted-foreground">
          {game.description.split("\n\n").map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </article>

        {game.qualityBar && <QualityBarPanel bar={game.qualityBar} gameTitle={game.title} />}

        <section className="rounded-xl border border-border bg-card p-5">
          <p className="font-bold">Want to play it?</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Full details, system requirements and install instructions.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href={`/games/${game.slug}`}
              className="inline-flex items-center rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
            >
              {game.title} details
            </Link>
            <Link
              href={`/games/${game.slug}?tab=install`}
              className="inline-flex items-center rounded-lg border border-border px-4 py-2.5 text-sm font-bold transition-colors hover:border-primary/40"
            >
              How to install it
            </Link>
          </div>
        </section>

        {(newer || older) && (
          <nav className="flex flex-wrap justify-between gap-4 border-t border-border pt-6 text-sm">
            {older ? (
              <Link href={`/weekly/${older.slug}`} className="font-semibold text-primary hover:underline">
                ← Week {older.week}, {older.year}
              </Link>
            ) : (
              <span />
            )}
            {newer && (
              <Link href={`/weekly/${newer.slug}`} className="font-semibold text-primary hover:underline">
                Week {newer.week}, {newer.year} →
              </Link>
            )}
          </nav>
        )}
      </div>
    </div>
  );
}
