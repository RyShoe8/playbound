import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import {
  BookOpen,
  ChevronDown,
  Download,
  Film,
  Gamepad2,
  Globe,
  Image as ImageIcon,
  Languages,
  MessagesSquare,
  Monitor,
  Newspaper,
  Play,
  ScrollText,
  Server,
  Sparkles,
  Trophy,
  Wrench,
} from "lucide-react";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import Review from "@/lib/models/Review";
import GuidePost from "@/lib/models/GuidePost";
import DiscussionTopic from "@/lib/models/DiscussionTopic";
import LibraryModEntry from "@/lib/models/LibraryModEntry";
import { ReviewList, type ReviewItem } from "@/components/reviews/ReviewList";
import { ContentForm } from "@/components/ContentForm";
import { DiscussionBoard } from "@/components/discussion/DiscussionBoard";
import { ScrollActiveTab } from "@/components/discussion/ScrollActiveTab";
import { visibleCategories } from "@/lib/discussion/categories";
import { editionScopedUgcFilter } from "@/lib/ugcTarget";
import { canonicalSlugFor, getGame } from "@/lib/catalog";
import { getEditionBySlug, listEditionsForGame, editionTelemetryProps } from "@/lib/editions";
import { resolveInstallAction, resolveSecondaryActions } from "@/lib/editionInstall";
import { INSTALL_METHOD_LABELS, VERIFICATION_DESCRIPTIONS } from "@/lib/editionTypes";
import type { Edition } from "@/lib/editionTypes";
import type { Game } from "@/lib/data/types";
import { viewerCanSeeTesting } from "@/lib/requestIncludesTesting";
import { pageMetadata, privateMetadata } from "@/lib/seo";
import { withOutboundUtm } from "@/lib/utm";
import { GameArt } from "@/components/GameArt";
import { SectionHeader } from "@/components/ui/bits";
import { Badge, EmptyHint } from "@/components/ui/bits";
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
import { getEditionLiveStats, type EntityLiveStats } from "@/lib/liveActivity";
import { PlayingNowBadge } from "@/components/ActivityStats";
import { ActivityStatsCard } from "@/components/ActivityStatsCard";
import { ModCard } from "@/components/ModCard";
import { LauncherInstallButton } from "@/components/LauncherInstallButton";
import { launcherPlayModUrl } from "@/lib/launcher";
import { modsForEdition } from "@/lib/mods";
import { cn } from "@/lib/utils";
import { GameHardwareCompatibility } from "@/components/hardware/GameHardwareCompatibility";

type Params = Promise<{ slug: string; editionSlug: string }>;

const tabs = [
  "overview",
  "install",
  "mods",
  "guides",
  "achievements",
  "news",
  "discussion",
  "reviews",
  "media",
] as const;
type Tab = (typeof tabs)[number];

const PARAM_TABS = tabs;

/** Servers deep-link with edition gameType filter when the browser supports it. */
function serversHref(gameSlug: string, editionSlug: string) {
  return `/servers?game=${encodeURIComponent(gameSlug)}&edition=${encodeURIComponent(editionSlug)}`;
}

/** A failed UGC read must not take the whole edition page down with it. */
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
  const includeTesting = await viewerCanSeeTesting();
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

export default async function EditionPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<{
    tab?: string;
    category?: string;
    sort?: string;
    filter?: string;
    q?: string;
  }>;
}) {
  const { slug, editionSlug } = await params;
  const sp = await searchParams;
  const { tab: rawTab } = sp;
  const includeTesting = await viewerCanSeeTesting();
  const game = await getGame(slug, { includeTesting });

  if (!game) {
    // Follow a game rename rather than 404ing every indexed edition URL.
    const canonical = await canonicalSlugFor(slug);
    if (canonical) {
      const qs = new URLSearchParams(
        Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]
      ).toString();
      permanentRedirect(`/games/${canonical}/editions/${editionSlug}${qs ? `?${qs}` : ""}`);
    }
    notFound();
  }

  const edition = await getEditionBySlug(game, editionSlug, { includeHidden: includeTesting });
  if (!edition) notFound();

  const tab: Tab = tabs.includes(rawTab as Tab) ? (rawTab as Tab) : "overview";
  const action = resolveInstallAction(edition);
  const secondary = resolveSecondaryActions(edition);
  const telemetryProps = editionTelemetryProps(game, edition);
  const liveStats = await getEditionLiveStats(game.slug, edition.slug);
  const session = await getServerSession(authOptions);
  const pageBase = `/games/${game.slug}/editions/${edition.slug}`;

  const ugcScope = editionScopedUgcFilter(edition.slug);

  const [discussionCount, reviewCount] = await Promise.all([
    safeQuery(
      () =>
        DiscussionTopic.countDocuments({
          gameSlug: game.slug,
          ...ugcScope,
          status: { $ne: "removed" },
        }),
      0
    ),
    safeQuery(
      () => Review.countDocuments({ gameSlug: game.slug, ...ugcScope }),
      0
    ),
  ]);

  const siblings = (await listEditionsForGame(game)).filter((e) => e.id !== edition.id);
  const screenshots = edition.branding.screenshots?.length
    ? edition.branding.screenshots
    : (game.screenshots ?? []);
  const requirements = edition.requirements ?? game.systemRequirements;
  const heroImage = edition.branding.heroImage;

  const communityLinks = [
    { href: edition.links.discord, label: "Discord", icon: MessagesSquare },
    { href: edition.links.website, label: "Website", icon: Globe },
    { href: edition.links.wiki, label: "Wiki", icon: BookOpen },
    { href: edition.links.github, label: "GitHub", icon: ScrollText },
    { href: edition.links.forum, label: "Forum", icon: MessagesSquare },
  ].filter((l): l is { href: string; label: string; icon: typeof Globe } => Boolean(l.href));

  return (
    <div>
      <TelemetryOnce event="edition_view" properties={telemetryProps} />
      <JsonLd
        data={graph(
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Games", path: "/discover" },
            { name: game.title, path: `/games/${game.slug}` },
            { name: edition.name, path: pageBase },
          ]),
          faqSchema(edition.faq ?? [])
        )}
      />

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-border">
        {heroImage ? (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${heroImage})` }}
            aria-hidden
          />
        ) : (
          <GameArt game={game} showTitle={false} className="absolute inset-0" />
        )}
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
            <p className="text-sm font-semibold text-white/70">Server: {edition.serverName}</p>
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
              <PlayingNowBadge
                count={liveStats.playingNow}
                className="border-white/20 bg-black/40 text-white"
              />
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

      {/* ── Sticky tab nav ───────────────────────────────────────── */}
      <nav className="no-scrollbar sticky top-0 z-20 flex gap-1 overflow-x-auto border-b border-border bg-background/90 px-4 backdrop-blur-md sm:px-6 lg:px-8">
        <ScrollActiveTab activeKey={tab} />
        <Link
          href={pageBase}
          data-tab="overview"
          className={cn(
            "border-b-2 px-3 py-3 text-sm font-semibold whitespace-nowrap capitalize transition-colors",
            tab === "overview"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          overview
        </Link>

        <Link
          href={`${pageBase}?tab=install`}
          data-tab="install"
          className={cn(
            "border-b-2 px-3 py-3 text-sm font-semibold whitespace-nowrap capitalize transition-colors",
            tab === "install"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          install
        </Link>

        <Link
          href={serversHref(game.slug, edition.slug)}
          data-tab="servers"
          className="border-b-2 border-transparent px-3 py-3 text-sm font-semibold whitespace-nowrap capitalize text-muted-foreground transition-colors hover:text-foreground"
        >
          servers
        </Link>

        {PARAM_TABS.filter((t) => t !== "overview" && t !== "install").map((t) => {
          const count =
            t === "discussion" ? discussionCount : t === "reviews" ? reviewCount : null;
          return (
            <Link
              key={t}
              href={`${pageBase}?tab=${t}`}
              data-tab={t}
              className={cn(
                "border-b-2 px-3 py-3 text-sm font-semibold whitespace-nowrap capitalize transition-colors",
                tab === t
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t}
              {count != null && count > 0 ? (
                <span className="ml-1 text-xs font-normal text-muted-foreground">{count}</span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-8 sm:px-6 lg:px-8">
        {tab === "overview" && (
          <OverviewTab
            game={game}
            edition={edition}
            liveStats={liveStats}
            screenshots={screenshots}
            requirements={requirements}
            communityLinks={communityLinks}
            siblings={siblings}
          />
        )}

        {tab === "install" && (
          <InstallTab
            edition={edition}
            action={action}
            telemetryProps={telemetryProps}
          />
        )}

        {tab === "mods" && (
          <ModsTab
            game={game}
            edition={edition}
            includeTesting={includeTesting}
          />
        )}

        {tab === "guides" && (
          <GuidesTab
            gameSlug={game.slug}
            editionSlug={edition.slug}
            editionName={edition.name}
            isSignedIn={Boolean(session?.user)}
            items={await safeQuery(
              () =>
                GuidePost.find({ gameSlug: game.slug, ...ugcScope })
                  .sort({ createdAt: -1 })
                  .limit(30)
                  .lean(),
              []
            )}
          />
        )}

        {tab === "achievements" && (
          <div>
            <EmptyHint icon={Trophy}>
              Achievements for this edition are coming soon.
            </EmptyHint>
          </div>
        )}

        {tab === "news" && <NewsTab edition={edition} />}

        {tab === "discussion" && (
          <DiscussionTabSection
            game={game}
            edition={edition}
            isSignedIn={Boolean(session?.user)}
            query={{
              category: sp.category,
              sort: sp.sort,
              filter: sp.filter,
              q: sp.q,
            }}
          />
        )}

        {tab === "reviews" && (
          <section>
            <p className="mb-3 text-sm text-muted-foreground">
              These cover this edition specifically.{" "}
              <Link
                href={`/games/${game.slug}?tab=reviews`}
                className="text-primary hover:underline"
              >
                All {game.title} reviews
              </Link>
              .
            </p>
            <ReviewList
              gameSlug={game.slug}
              isSignedIn={Boolean(session?.user)}
              items={await safeQuery(
                () =>
                  Review.find({ gameSlug: game.slug, ...ugcScope })
                    .sort({ createdAt: -1 })
                    .limit(30)
                    .lean(),
                [] as ReviewItem[]
              )}
              editionSlug={edition.slug}
              editionName={edition.name}
            />
          </section>
        )}

        {tab === "media" && <MediaTab edition={edition} game={game} screenshots={screenshots} />}
      </div>
    </div>
  );
}

/* ────────────────────────── Tabs ────────────────────────── */

function OverviewTab({
  game,
  edition,
  liveStats,
  screenshots,
  requirements,
  communityLinks,
  siblings,
}: {
  game: Game;
  edition: Edition;
  liveStats: EntityLiveStats;
  screenshots: string[];
  requirements: Edition["requirements"] | Game["systemRequirements"];
  communityLinks: { href: string; label: string; icon: typeof Globe }[];
  siblings: Edition[];
}) {
  return (
    <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-10">
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

        <section>
          <GameHardwareCompatibility gameSlug={game.slug} editionSlug={edition.slug} />
        </section>

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

        {edition.languages.length > 0 && (
          <section>
            <SectionHeader title="Languages" />
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Languages className="size-4" />
              {edition.languages.join(", ")}
            </p>
          </section>
        )}

        {communityLinks.length > 0 && (
          <section>
            <SectionHeader title="Community" />
            <div className="mt-3 flex flex-wrap gap-2">
              {communityLinks.map(({ href, label, icon: Icon }) => (
                <Link
                  key={`${label}-${href}`}
                  href={withOutboundUtm(href, {
                    campaign: "edition_page",
                    content: edition.slug,
                  })}
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
          rows={[
            { label: "Players this month", value: liveStats.playersThisMonth },
            { label: "Live servers", value: liveStats.serverCount },
          ]}
        />
        <div className="rounded-xl border border-border bg-card p-4 text-sm">
          <Link
            href={serversHref(game.slug, edition.slug)}
            className="inline-flex items-center gap-2 font-semibold text-primary hover:underline"
          >
            <Server className="size-4" />
            Browse {edition.name} servers
          </Link>
          <p className="mt-1 text-muted-foreground">
            {liveStats.serverCount > 0
              ? `${liveStats.serverCount} server${liveStats.serverCount === 1 ? "" : "s"} · ${liveStats.playingNow} playing now`
              : "Open the server browser for this game."}
          </p>
        </div>
      </aside>
    </div>
  );
}

function InstallTab({
  edition,
  action,
  telemetryProps,
}: {
  edition: Edition;
  action: ReturnType<typeof resolveInstallAction>;
  telemetryProps: ReturnType<typeof editionTelemetryProps>;
}) {
  return (
    <section id="install" className="mx-auto max-w-3xl">
      <SectionHeader title="Installation" />
      <div className="mt-3 rounded-xl border border-border bg-card p-4 sm:p-5">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Method — {INSTALL_METHOD_LABELS[edition.installMethod]}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <EditionInstallButton action={action} telemetryProps={telemetryProps} size="lg" />
        </div>

        {action.steps?.length ? (
          <div className="mt-4">
            <p className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              How to get playing
            </p>
            <EditionInstallSteps steps={action.steps} />
          </div>
        ) : null}

        {action.note && <p className="mt-3 text-sm text-muted-foreground">{action.note}</p>}
        {edition.requirements?.notes && (
          <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-400/10 px-3 py-2 text-sm">
            {edition.requirements.notes}
          </p>
        )}
      </div>
    </section>
  );
}

async function ModsTab({
  game,
  edition,
  includeTesting,
}: {
  game: Game;
  edition: Edition;
  includeTesting: boolean;
}) {
  const mods = await modsForEdition(game.slug, edition.slug, { includeTesting });

  let installedModSlugs = new Set<string>();
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.id) {
      await dbConnect();
      const rows = await LibraryModEntry.find({
        userId: session.user.id,
        installed: true,
        baseGameSlug: game.slug,
      })
        .select("modSlug")
        .lean();
      installedModSlugs = new Set(rows.map((r) => String(r.modSlug)));
    }
  } catch (err) {
    console.error("Edition mods tab library load failed:", err);
  }

  if (mods.length === 0) {
    return (
      <div>
        <EmptyHint icon={Wrench}>No edition-specific mods yet</EmptyHint>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold">Mods for {edition.name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Mods tagged specifically for this edition.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {mods.map((mod) => {
          const isExternal = mod.downloadKind === "external";
          const showPlay = installedModSlugs.has(mod.slug) && !isExternal;
          return (
            <ModCard
              key={mod.slug}
              mod={mod}
              baseGame={{
                slug: game.slug,
                title: game.title,
                coverImage: game.coverImage,
              }}
              meta={[
                isExternal
                  ? "Opens in your browser via the launcher"
                  : `Installs to ${mod.installRelativePath || "(game root)"}`,
                mod.sizeMB ? `~${mod.sizeMB} MB` : null,
                showPlay ? "Installed" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              actions={
                <>
                  {showPlay ? (
                    <a
                      href={launcherPlayModUrl(mod.slug)}
                      className="inline-flex items-center gap-1 rounded-full bg-play px-3 py-1.5 text-xs font-bold text-play-foreground hover:brightness-110"
                    >
                      <Play className="size-3 fill-current" /> Play {game.title}
                    </a>
                  ) : (
                    <LauncherInstallButton
                      slug={mod.slug}
                      kind="install-mod"
                      label={isExternal ? "Open with launcher" : "Install mod"}
                      className="border-transparent bg-play px-3 py-1.5 text-xs text-play-foreground"
                    />
                  )}
                  <Link
                    href={`/mods/${mod.slug}`}
                    className="rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold"
                  >
                    Details
                  </Link>
                </>
              }
            />
          );
        })}
      </div>
    </div>
  );
}

function NewsTab({ edition }: { edition: Edition }) {
  const notes = edition.patchNotes ?? [];
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold">News & patch notes</h2>
      {notes.length > 0 ? (
        <div className="space-y-3">
          {notes.map((note, i) => (
            <div
              key={`${note.version}-${i}`}
              className="rounded-xl border border-border bg-card p-5"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge tone="brand">
                  <Newspaper className="size-3" /> Patch
                </Badge>
                {note.date && <span>{note.date}</span>}
                <span className="font-semibold">v{note.version}</span>
              </div>
              <h3 className="mt-2 font-bold">{note.title || `Version ${note.version}`}</h3>
              {note.body && (
                <p className="mt-1 line-clamp-4 whitespace-pre-line text-sm text-muted-foreground">
                  {note.body}
                </p>
              )}
              {note.url && (
                <Link
                  href={withOutboundUtm(note.url, {
                    campaign: "edition_page",
                    content: edition.slug,
                  })}
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
      ) : (
        <EmptyHint icon={Newspaper}>No patch notes for {edition.name} yet.</EmptyHint>
      )}
    </div>
  );
}

interface PostDoc {
  _id: string;
  username: string;
  title: string;
  body: string;
  createdAt: string | Date;
}

async function DiscussionTabSection({
  game,
  edition,
  isSignedIn,
  query,
}: {
  game: Game;
  edition: Edition;
  isSignedIn: boolean;
  query: { category?: string; sort?: string; filter?: string; q?: string };
}) {
  const categories = visibleCategories(game);
  const filter = query.filter ?? "all";
  const sort = query.sort ?? "activity";
  const category = query.category;
  const q = query.q?.trim() ?? "";

  const mongoQuery: Record<string, unknown> = {
    gameSlug: game.slug,
    ...editionScopedUgcFilter(edition.slug),
    status: { $ne: "removed" },
  };
  if (category && category !== "all") mongoQuery.category = category;
  if (filter === "unanswered") {
    mongoQuery.replyCount = 0;
    mongoQuery.isSolved = false;
  } else if (filter === "solved") {
    mongoQuery.isSolved = true;
  } else if (filter === "pinned") {
    mongoQuery.isPinned = true;
  }
  if (q) mongoQuery.$text = { $search: q };

  let sortSpec: Record<string, 1 | -1> = { isPinned: -1, lastReplyAt: -1, createdAt: -1 };
  if (sort === "newest") sortSpec = { isPinned: -1, createdAt: -1 };
  else if (sort === "replies") sortSpec = { isPinned: -1, replyCount: -1, lastReplyAt: -1 };

  const all = await safeQuery(
    () => DiscussionTopic.find(mongoQuery).sort(sortSpec).limit(40).lean(),
    []
  );
  const pinned = all.filter((t) => t.isPinned);
  const topics = all.filter((t) => !t.isPinned || filter === "pinned");

  const mapTopic = (t: (typeof all)[number]) => ({
    _id: String(t._id),
    slug: t.slug,
    title: t.title,
    category: t.category,
    replyCount: t.replyCount,
    viewCount: t.viewCount,
    isPinned: Boolean(t.isPinned),
    isSolved: Boolean(t.isSolved),
    status: t.status,
    lastReplyAt: t.lastReplyAt,
    createdAt: t.createdAt,
    authorUsername: t.authorUsername,
    lastReplyUsername: t.lastReplyUsername,
  });

  return (
    <DiscussionBoard
      gameSlug={game.slug}
      editionSlug={edition.slug}
      gameTitle={edition.name}
      isSignedIn={isSignedIn}
      categories={categories}
      topics={topics.map(mapTopic)}
      pinned={filter === "pinned" ? [] : pinned.map(mapTopic)}
      communityLinks={game.communityLinks}
      query={query}
    />
  );
}

function GuidesTab({
  gameSlug,
  editionSlug,
  editionName,
  isSignedIn,
  items,
}: {
  gameSlug: string;
  editionSlug: string;
  editionName: string;
  isSignedIn: boolean;
  items: PostDoc[];
}) {
  return (
    <div className="space-y-6">
      <TelemetryOnce event="guide_viewed" properties={{ gameSlug }} />
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Guides for {editionName}</h2>
        <ContentForm
          kind="guide"
          gameSlug={gameSlug}
          editionSlug={editionSlug}
          editionName={editionName}
          isSignedIn={isSignedIn}
        />
      </div>
      {items.length > 0 ? (
        <div className="space-y-3">
          {items.map((g) => (
            <div key={String(g._id)} className="rounded-xl border border-border bg-card p-4">
              <p className="font-semibold">{g.title}</p>
              <p className="mt-1.5 line-clamp-4 whitespace-pre-line text-sm text-muted-foreground">
                {g.body}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {g.username} · {new Date(g.createdAt).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <EmptyHint>No guides yet — be the first to write one.</EmptyHint>
      )}
    </div>
  );
}

function MediaTab({
  edition,
  game,
  screenshots,
}: {
  edition: Edition;
  game: Game;
  screenshots: string[];
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Media</h2>
        <span className="text-xs text-muted-foreground">
          {screenshots.length > 0 && `${screenshots.length} ${screenshots.length === 1 ? "screenshot" : "screenshots"}`}
        </span>
      </div>

      {screenshots.length > 0 ? (
        <details open className="group rounded-xl border border-border bg-card/50 overflow-hidden">
          <summary className="flex cursor-pointer select-none items-center justify-between px-4 py-3 bg-secondary/30 transition-colors hover:bg-secondary/50 font-semibold text-sm">
            <span className="flex items-center gap-2">
              <ImageIcon className="size-4 text-primary" />
              <span>Screenshots</span>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground font-normal">
                {screenshots.length}
              </span>
            </span>
            <ChevronDown className="size-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <div className="p-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {screenshots.map((src) => (
              <a
                key={src}
                href={src}
                target="_blank"
                rel="noreferrer"
                className="relative aspect-video overflow-hidden rounded-lg border border-border bg-secondary transition-transform hover:scale-[1.01]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`${edition.name} screenshot`}
                  className="h-full w-full object-cover"
                />
              </a>
            ))}
          </div>
        </details>
      ) : (
        <div className="space-y-3">
          <EmptyHint icon={Gamepad2}>
            No screenshots for {edition.name} yet.
            {game.coverImage ? " Showing cover art below." : ""}
          </EmptyHint>
          {game.coverImage ? (
            <div className="relative aspect-video overflow-hidden rounded-lg border border-border">
              <GameArt game={game} showTitle={false} className="absolute inset-0" />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
