import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import {
  BookOpen,
  Download,
  Globe,
  Languages,
  MessagesSquare,
  Monitor,
  ScrollText,
  Sparkles,
} from "lucide-react";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import Review from "@/lib/models/Review";
import { ReviewList, type ReviewItem } from "@/components/reviews/ReviewList";
import { canonicalSlugFor, getGame } from "@/lib/catalog";
import { getEditionBySlug, listEditionsForGame, editionTelemetryProps } from "@/lib/editions";
import { resolveInstallAction, resolveSecondaryActions } from "@/lib/editionInstall";
import { INSTALL_METHOD_LABELS, VERIFICATION_DESCRIPTIONS } from "@/lib/editionTypes";
import { viewerIsAdmin } from "@/lib/requestIncludesTesting";
import { pageMetadata, privateMetadata } from "@/lib/seo";
import { GameArt } from "@/components/GameArt";
import { SectionHeader } from "@/components/ui/bits";
import { JsonLd, graph, breadcrumbSchema, faqSchema } from "@/components/JsonLd";
import { TelemetryOnce } from "@/components/TelemetryOnce";
import {
  EditionInstallButton,
  EditionInstallSteps,
} from "@/components/editions/EditionInstallButton";
import {
  EditionPopulationBadge,
  EditionStatusBadge,
  EditionTypeBadge,
  VerificationBadge,
} from "@/components/editions/EditionBadges";
import { EditionCard } from "@/components/editions/EditionCard";
import { getEditionLiveStats } from "@/lib/liveActivity";
import { PlayingNowBadge } from "@/components/ActivityStats";
import { ActivityStatsCard } from "@/components/ActivityStatsCard";

type Params = Promise<{ slug: string; editionSlug: string }>;

/** A failed reviews read must not take the whole edition page down with it. */
async function safeQuery<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    await dbConnect();
    return await fn();
  } catch (err) {
    console.error("Edition page query failed:", err);
    return fallback;
  }
}

export async function generateMetadata({ params }: { params: Params }) {
  const { slug, editionSlug } = await params;
  const includeTesting = await viewerIsAdmin();
  const game = await getGame(slug, { includeTesting });
  if (!game) return privateMetadata("Edition Not Found");

  const edition = await getEditionBySlug(game, editionSlug, { includeHidden: includeTesting });
  if (!edition) return privateMetadata("Edition Not Found");

  // Unlisted editions stay reachable by URL but must not be indexed.
  if (edition.visibility !== "public" || game.status === "testing") {
    return privateMetadata(`${edition.name} · ${game.title}`);
  }

  return pageMetadata({
    title: `${edition.name} — ${game.title}`,
    description:
      edition.shortDescription ||
      `How to install and play ${edition.name}, an edition of ${game.title}.`,
    path: `/games/${game.slug}/editions/${edition.slug}`,
    images: edition.branding.heroImage
      ? [edition.branding.heroImage]
      : game.coverImage
        ? [game.coverImage]
        : undefined,
  });
}

export default async function EditionPage({ params }: { params: Params }) {
  const { slug, editionSlug } = await params;
  const includeTesting = await viewerIsAdmin();
  const game = await getGame(slug, { includeTesting });

  if (!game) {
    // Follow a game rename rather than 404ing every indexed edition URL.
    const canonical = await canonicalSlugFor(slug);
    if (canonical) permanentRedirect(`/games/${canonical}/editions/${editionSlug}`);
    notFound();
  }

  const edition = await getEditionBySlug(game, editionSlug, { includeHidden: includeTesting });
  if (!edition) notFound();

  const action = resolveInstallAction(edition);
  const secondary = resolveSecondaryActions(edition);
  const telemetryProps = editionTelemetryProps(game, edition);
  const liveStats = await getEditionLiveStats(game.slug, edition.slug);

  const session = await getServerSession(authOptions);

  // Reviews written from this edition's page. Game-wide reviews (editionSlug
  // null, which is every review predating editions) stay on the game page.
  const reviews = await safeQuery(
    () =>
      Review.find({ gameSlug: game.slug, editionSlug: edition.slug })
        .sort({ createdAt: -1 })
        .limit(30)
        .lean(),
    [] as ReviewItem[]
  );

  const siblings = (await listEditionsForGame(game)).filter((e) => e.id !== edition.id);
  const screenshots = edition.branding.screenshots?.length
    ? edition.branding.screenshots
    : (game.screenshots ?? []);
  const requirements = edition.requirements ?? game.systemRequirements;

  const communityLinks = [
    { href: edition.links.discord, label: "Discord", icon: MessagesSquare },
    { href: edition.links.website, label: "Website", icon: Globe },
    { href: edition.links.wiki, label: "Wiki", icon: BookOpen },
    { href: edition.links.github, label: "GitHub", icon: ScrollText },
    { href: edition.links.forum, label: "Forum", icon: MessagesSquare },
  ].filter((l): l is { href: string; label: string; icon: typeof Globe } => Boolean(l.href));

  return (
    <div className="space-y-10 pb-12">
      <TelemetryOnce event="edition_view" properties={telemetryProps} />
      <JsonLd
        data={graph(
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Games", path: "/discover" },
            { name: game.title, path: `/games/${game.slug}` },
            { name: edition.name, path: `/games/${game.slug}/editions/${edition.slug}` },
          ]),
          faqSchema(edition.faq ?? [])
        )}
      />

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-border">
        <GameArt game={game} showTitle={false} className="absolute inset-0" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/70 to-black/30" />
        <div className="relative space-y-4 px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <Link
            href={`/games/${game.slug}`}
            className="inline-flex items-center gap-1 text-sm font-semibold text-white/70 hover:text-white hover:underline"
          >
            ← {game.title}
          </Link>
          <h1 className="max-w-3xl text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            {edition.name}
          </h1>
          {edition.serverName && (
            <p className="text-sm font-semibold text-white/70">
              Server: {edition.serverName}
            </p>
          )}
          {edition.shortDescription && (
            <p className="max-w-2xl text-base text-white/85">{edition.shortDescription}</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <EditionTypeBadge edition={edition} />
            <VerificationBadge level={edition.verificationLevel} />
            <EditionStatusBadge edition={edition} />
            {liveStats.playingNow > 0 ? (
              <EditionPopulationBadge edition={edition} population={liveStats.playingNow} />
            ) : (
              <PlayingNowBadge count={liveStats.playingNow} className="border-white/20 bg-black/40 text-white" />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <EditionInstallButton action={action} telemetryProps={telemetryProps} size="lg" />
            {secondary.map((alt) => (
              <EditionInstallButton
                key={alt.method}
                action={alt}
                telemetryProps={telemetryProps}
                size="lg"
                variant="secondary"
              />
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_320px] lg:px-8">
        <div className="min-w-0 space-y-10">
        {/* ── Description ────────────────────────────────────────── */}
        {edition.description && (
          <section>
            <SectionHeader title="About this edition" />
            <div className="mt-3 max-w-prose space-y-3 leading-relaxed text-muted-foreground">
              {edition.description.split("\n\n").map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          </section>
        )}

        {/* ── Features ───────────────────────────────────────────── */}
        {edition.features.length > 0 && (
          <section>
            <SectionHeader title="What makes it different" />
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {edition.features.map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm"
                >
                  <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  {feature}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Gallery ────────────────────────────────────────────── */}
        {screenshots.length > 0 && (
          <section>
            <SectionHeader title="Gallery" />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {screenshots.slice(0, 6).map((src) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={src}
                  src={src}
                  alt={`${edition.name} screenshot`}
                  loading="lazy"
                  className="w-full rounded-xl border border-border object-cover"
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Installation ───────────────────────────────────────── */}
        <section id="install">
          <SectionHeader title="Installation" />
          <div className="mt-3 rounded-xl border border-border bg-card p-4 sm:p-5">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Method — {INSTALL_METHOD_LABELS[edition.installMethod]}
            </p>

            {action.steps?.length ? (
              <div className="mt-4">
                <EditionInstallSteps steps={action.steps} />
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <EditionInstallButton action={action} telemetryProps={telemetryProps} />
              </div>
            )}

            {action.note && <p className="mt-3 text-sm text-muted-foreground">{action.note}</p>}
            {edition.requirements?.notes && (
              <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-400/10 px-3 py-2 text-sm">
                {edition.requirements.notes}
              </p>
            )}
          </div>
        </section>

        {/* ── Requirements ───────────────────────────────────────── */}
        {requirements && (requirements.min || requirements.recommended) && (
          <section>
            <SectionHeader title="System requirements" />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {requirements.min && (
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    <Monitor className="size-3.5" /> Minimum
                  </p>
                  <p className="mt-2 text-sm leading-relaxed">{requirements.min}</p>
                </div>
              )}
              {requirements.recommended && (
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    <Monitor className="size-3.5" /> Recommended
                  </p>
                  <p className="mt-2 text-sm leading-relaxed">{requirements.recommended}</p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── Languages ──────────────────────────────────────────── */}
        {edition.languages.length > 0 && (
          <section>
            <SectionHeader title="Languages" />
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Languages className="size-4" />
              {edition.languages.join(", ")}
            </p>
          </section>
        )}

        {/* ── Patch notes ────────────────────────────────────────── */}
        {edition.patchNotes.length > 0 && (
          <section>
            <SectionHeader title="Patch notes" />
            <div className="mt-3 space-y-3">
              {edition.patchNotes.slice(0, 10).map((note, i) => (
                <div key={`${note.version}-${i}`} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-bold">
                      {note.title || `Version ${note.version}`}
                      {note.title && (
                        <span className="ml-2 text-xs font-semibold text-muted-foreground">
                          v{note.version}
                        </span>
                      )}
                    </p>
                    {note.date && (
                      <span className="text-xs text-muted-foreground">{note.date}</span>
                    )}
                  </div>
                  {note.body && (
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{note.body}</p>
                  )}
                  {note.url && (
                    <Link
                      href={note.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-block text-xs font-semibold text-primary hover:underline"
                    >
                      Full notes →
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Community ──────────────────────────────────────────── */}
        {communityLinks.length > 0 && (
          <section>
            <SectionHeader title="Community" />
            <div className="mt-3 flex flex-wrap gap-2">
              {communityLinks.map(({ href, label, icon: Icon }) => (
                <Link
                  key={`${label}-${href}`}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-secondary px-4 text-sm font-bold hover:bg-secondary/80"
                >
                  <Icon className="size-4" />
                  {label}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── Certification ──────────────────────────────────────── */}
        <section>
          <SectionHeader title="Certification" />
          <div className="mt-3 rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-3">
              <VerificationBadge level={edition.verificationLevel} />
              {edition.verifiedAt && (
                <span className="text-xs text-muted-foreground">
                  Last checked {edition.verifiedAt.slice(0, 10)}
                </span>
              )}
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {VERIFICATION_DESCRIPTIONS[edition.verificationLevel]}
            </p>
            {edition.verificationNote && (
              <p className="mt-2 text-sm leading-relaxed">{edition.verificationNote}</p>
            )}
          </div>
        </section>

        {/* ── Reviews ────────────────────────────────────────────── */}
        <section id="reviews">
          <SectionHeader title={`Reviews of ${edition.name}`} />
          <p className="mt-1 mb-3 text-sm text-muted-foreground">
            These cover this edition specifically.{" "}
            <Link href={`/games/${game.slug}?tab=reviews`} className="text-primary hover:underline">
              All {game.title} reviews
            </Link>
            .
          </p>
          <ReviewList
            gameSlug={game.slug}
            isSignedIn={Boolean(session?.user)}
            items={reviews}
            editionSlug={edition.slug}
            editionName={edition.name}
          />
        </section>

        {/* ── FAQ ────────────────────────────────────────────────── */}
        {edition.faq.length > 0 && (
          <section>
            <SectionHeader title="FAQ" />
            <div className="mt-3 space-y-2">
              {edition.faq.map((item, i) => (
                <details key={i} className="rounded-xl border border-border bg-card p-4">
                  <summary className="cursor-pointer text-sm font-bold">{item.q}</summary>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
                </details>
              ))}
            </div>
          </section>
        )}

        {/* ── Related editions ───────────────────────────────────── */}
        {siblings.length > 0 && (
          <section>
            <SectionHeader
              title="Other ways to play"
              href={`/games/${game.slug}#editions`}
              linkLabel="All editions"
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {siblings.slice(0, 4).map((sibling) => (
                <EditionCard key={sibling.id} game={game} edition={sibling} />
              ))}
            </div>
          </section>
        )}

        <section className="rounded-xl border border-border bg-secondary/30 p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold">
            <Download className="size-4" /> Looking for the base game?
          </p>
          <p className="mt-1 text-muted-foreground">
            <Link href={`/games/${game.slug}`} className="text-primary hover:underline">
              {game.title}
            </Link>{" "}
            has an overview, reviews and discussion covering every edition.
          </p>
        </section>
        </div>

        <aside className="min-w-0 space-y-4">
          <ActivityStatsCard
            playingNow={liveStats.playingNow}
            rows={[{ label: "Players this month", value: liveStats.playersThisMonth }]}
          />
        </aside>
      </div>
    </div>
  );
}
