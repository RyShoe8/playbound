import Link from "next/link";
import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { Gamepad2, Newspaper, Play, Star, Trophy, Wrench } from "lucide-react";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import Review from "@/lib/models/Review";
import GuidePost from "@/lib/models/GuidePost";
import DiscussionTopic from "@/lib/models/DiscussionTopic";
import LibraryEntry from "@/lib/models/LibraryEntry";
import LibraryModEntry from "@/lib/models/LibraryModEntry";
import { fetchGithubReleases } from "@/lib/github";
import {
  collectionsFeaturing,
  listGames,
  getGame,
  canonicalSlugFor,
} from "@/lib/catalog";
import { getDeveloper } from "@/lib/developers";
import { platformFromUserAgent, visiblePlatformsFor } from "@/lib/libraryPlatform";
import { listPublicEditionsForGame } from "@/lib/editions";
import type { Edition } from "@/lib/editionTypes";
import { EditionsSection } from "@/components/editions/EditionsSection";
import type { Game, Developer } from "@/lib/data/types";
import { GameArt } from "@/components/GameArt";
import { LaunchBadge, PlayCta } from "@/components/GameCard";
import { CompatibleMoreLikeThis } from "@/components/CompatibleGameCardGrid";
import { AdaptiveAddToLibraryButton } from "@/components/AdaptiveAddToLibraryButton";
import { GameIncompatibilityBanner } from "@/components/GameIncompatibilityBanner";
import { ContentForm } from "@/components/ContentForm";
import { ReviewList } from "@/components/reviews/ReviewList";
import { DiscussionBoard } from "@/components/discussion/DiscussionBoard";
import { CommunityCard } from "@/components/discussion/CommunityCard";
import { ScrollActiveTab } from "@/components/discussion/ScrollActiveTab";
import { visibleCategories } from "@/lib/discussion/categories";
import { getDiscordPresence } from "@/lib/discordPresence";
import { getGameLiveStats, type EntityLiveStats } from "@/lib/liveActivity";
import { PlayingNowBadge } from "@/components/ActivityStats";
import { ActivityStatsCard } from "@/components/ActivityStatsCard";
import { GameFriendsWidget } from "@/components/friends/GameFriendsWidget";
import { Avatar, Badge, EmptyHint } from "@/components/ui/bits";
import { cn } from "@/lib/utils";
import { modsForGame } from "@/lib/mods";
import { LauncherInstallButton } from "@/components/LauncherInstallButton";
import { QualityBarPanel } from "@/components/QualityBarPanel";
import { GameInstallContent } from "@/components/GameInstallContent";
import { ModCard } from "@/components/ModCard";
import { launcherPlayModUrl } from "@/lib/launcher";
import {
  JsonLd,
  graph,
  videoGameSchema,
  qualityReviewSchema,
  faqSchema,
  breadcrumbSchema,
  howToSchema,
} from "@/components/JsonLd";
import { TelemetryOnce } from "@/components/TelemetryOnce";
import { pageMetadata, privateMetadata, gameDescription, gameTitle } from "@/lib/seo";
import { viewerIsAdmin } from "@/lib/requestIncludesTesting";
import { comparisonsFeaturing } from "@/lib/data/comparisons";
import { alternativePages } from "@/lib/data/alternatives";
import { issueForGame, type WeeklyIssue } from "@/lib/weekly";
import { classifyMediaUrl } from "@/lib/mediaEmbed";
import { HlsVideo } from "@/components/HlsVideo";
import { deriveInstallSteps, deriveFaq } from "@/lib/enrich";

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

/**
 * High-intent sections promoted out of `?tab=` into real indexable URLs.
 * Servers deep-link into the global browser with the game pre-selected.
 * Install stays on the hub as ?tab=install (legacy /install redirects there).
 */
const PROMOTED_ROUTES = [
  { key: "servers", label: "servers", href: (slug: string) => `/servers?game=${encodeURIComponent(slug)}` },
] as const;

/** Tabs that remain as query params — low search value, app-like content. */
const PARAM_TABS = tabs;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const includeTesting = await viewerIsAdmin();
  const game = await getGame(slug, { includeTesting });
  if (!game) return privateMetadata("Game Not Found");
  if (game.status === "testing") return privateMetadata(gameTitle(game));

  // The canonical collapses all nine ?tab= variants into one indexable URL.
  return pageMetadata({
    title: gameTitle(game),
    description: gameDescription(game),
    path: `/games/${game.slug}`,
    images: game.coverImage ? [game.coverImage] : undefined,
  });
}

async function safeQuery<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    await dbConnect();
    return await fn();
  } catch (err) {
    console.error("DB query failed:", err);
    return fallback;
  }
}

export default async function GamePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    tab?: string;
    category?: string;
    sort?: string;
    filter?: string;
    q?: string;
  }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const { tab: rawTab } = sp;
  const includeTesting = await viewerIsAdmin();
  const game = await getGame(slug, { includeTesting });
  if (!game) {
    // The game may have been renamed; send its old URL to the current one so
    // indexed links and shared pages keep working instead of 404ing.
    const canonical = await canonicalSlugFor(slug);
    if (canonical) {
      const qs = new URLSearchParams(
        Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]
      ).toString();
      permanentRedirect(`/games/${canonical}${qs ? `?${qs}` : ""}`);
    }
    notFound();
  }

  const tab: Tab = tabs.includes(rawTab as Tab) ? (rawTab as Tab) : "overview";
  const session = await getServerSession(authOptions);
  const developer = await getDeveloper(game.developerSlug);
  const allGames = await listGames({ includeTesting });
  const similar = allGames
    .filter((g) => g.slug !== game.slug && g.genres.some((genre) => game.genres.includes(genre)))
    .slice(0, 20);

  const discussionCount = await safeQuery(
    () =>
      DiscussionTopic.countDocuments({
        gameSlug: game.slug,
        status: { $ne: "removed" },
      }),
    0
  );
  const reviewCount = await safeQuery(
    () => Review.countDocuments({ gameSlug: game.slug }),
    0
  );
  const discordPresence = await getDiscordPresence(
    game.communityLinks?.playboundDiscord?.guildId
  );
  const liveStats = await getGameLiveStats(game.slug);

  let initiallyInLibrary = false;
  if (session?.user) {
    try {
      await dbConnect();
      // Scoped to this device: a phone install must not show as "in library"
      // on desktop, where the game is not actually installed.
      const viewerPlatform = platformFromUserAgent((await headers()).get("user-agent"));
      const visible = visiblePlatformsFor(viewerPlatform);
      const entry = await LibraryEntry.findOne({
        userId: session.user.id,
        gameSlug: game.slug,
        installed: true,
        $or: [
          { platform: { $in: visible } },
          // Legacy entries have no platform and are desktop by definition.
          ...(viewerPlatform === "desktop"
            ? [{ platform: { $exists: false } }, { platform: null }]
            : []),
        ],
      }).lean();
      initiallyInLibrary = Boolean(entry);
    } catch {
      /* ignore */
    }
  }

  // Real review data only — aggregateRating is never synthesised.
  const reviewDocs = await safeQuery(
    () => Review.find({ gameSlug: game.slug }).select("rating").lean(),
    [] as { rating?: number }[]
  );
  const rated = reviewDocs.filter((r) => typeof r.rating === "number");
  const aggregateRating = rated.length
    ? {
        ratingValue:
          Math.round((rated.reduce((sum, r) => sum + (r.rating ?? 0), 0) / rated.length) * 10) / 10,
        reviewCount: rated.length,
      }
    : undefined;

  const weeklyIssue = await issueForGame(game.slug);
  // Always non-empty: a game with none stored yields its virtual Official
  // edition, so nothing downstream needs a "no editions" branch.
  const editions = await listPublicEditionsForGame(game);

  return (
    <div>
      <TelemetryOnce
        event="game_viewed"
        properties={{ gameSlug: game.slug, gameTitle: game.title }}
      />
      <JsonLd
        data={graph(
          videoGameSchema(game, developer, { aggregateRating }),
          qualityReviewSchema(game),
          faqSchema(game.faq ?? []),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Games", path: "/discover" },
            { name: game.title, path: `/games/${game.slug}` },
          ])
        )}
      />

      {game.status === "testing" && (
        <div className="border-b border-amber-500/40 bg-amber-400/10 px-4 py-2 text-center text-sm font-semibold text-amber-700 dark:text-amber-300 sm:px-6 lg:px-8">
          Testing — admin only
        </div>
      )}

      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-border">
        <GameArt game={game} showTitle={false} className="absolute inset-0" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/20" />
        <div className="relative px-4 pt-24 pb-6 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <LaunchBadge game={game} />
                {game.genres.map((g) => (
                  <Badge key={g} tone="outline">
                    {g}
                  </Badge>
                ))}
              </div>
              <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">{game.title}</h1>
              <p className="mt-2 text-muted-foreground sm:text-lg">{game.tagline}</p>
              <div className="mt-3">
                <PlayingNowBadge count={liveStats.playingNow} className="border-white/15 bg-black/40 text-white" />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <PlayCta game={game} size="lg" />
              <AdaptiveAddToLibraryButton
                game={game}
                initiallyInLibrary={initiallyInLibrary}
                signedIn={Boolean(session?.user)}
                size="lg"
              />
            </div>
          </div>
        </div>
      </section>

      <GameIncompatibilityBanner
        game={game}
        initiallyInLibrary={initiallyInLibrary}
        signedIn={Boolean(session?.user)}
      />

      {/* ── Tabs ───────────────────────────────────────────────── */}
      <nav className="no-scrollbar sticky top-14 z-20 flex gap-1 overflow-x-auto border-b border-border bg-background/90 px-4 backdrop-blur-md sm:px-6 lg:px-8">
        <ScrollActiveTab activeKey={tab} />
        <Link
          href={`/games/${game.slug}`}
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
          href={`/games/${game.slug}?tab=install`}
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

        {/* Real URLs — these can rank. */}
        {PROMOTED_ROUTES.map((r) => (
          <Link
            key={r.key}
            href={r.href(game.slug)}
            data-tab={r.key}
            className="border-b-2 border-transparent px-3 py-3 text-sm font-semibold whitespace-nowrap capitalize text-muted-foreground transition-colors hover:text-foreground"
          >
            {r.label}
          </Link>
        ))}

        {PARAM_TABS.filter((t) => t !== "overview" && t !== "install").map((t) => {
          const count =
            t === "discussion"
              ? discussionCount
              : t === "reviews"
                ? reviewCount
                : null;
          return (
            <Link
              key={t}
              href={`/games/${game.slug}?tab=${t}`}
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
            developer={developer}
            featuring={await collectionsFeaturing(game.slug)}
            similar={similar}
            weeklyIssue={weeklyIssue}
            discordPresence={discordPresence}
            editions={editions}
            liveStats={liveStats}
          />
        )}
        {tab === "install" && (
          <>
            <JsonLd
              data={graph(
                howToSchema(
                  game,
                  game.installSteps?.length ? game.installSteps : deriveInstallSteps(game)
                ),
                faqSchema(game.faq?.length ? game.faq : deriveFaq(game))
              )}
            />
            <GameInstallContent game={game} />
          </>
        )}
        {tab === "mods" && <ModsTab game={game} />}
        {tab === "guides" && (
          <GuidesTab
            gameSlug={game.slug}
            isSignedIn={Boolean(session?.user)}
            items={await safeQuery(() => GuidePost.find({ gameSlug: game.slug }).sort({ createdAt: -1 }).limit(30).lean(), [])}
          />
        )}
        {tab === "achievements" && <AchievementsTab />}
        {tab === "news" && (
          <NewsTab
            game={game}
            releases={game.githubRepo ? await fetchGithubReleases(game.githubRepo) : []}
          />
        )}
        {tab === "discussion" && (
          <DiscussionTabSection
            game={game}
            isSignedIn={Boolean(session?.user)}
            query={{
              category: sp.category,
              sort: sp.sort,
              filter: sp.filter,
              q: sp.q,
            }}
            presence={discordPresence}
          />
        )}
        {tab === "reviews" && (
          <ReviewList
            gameSlug={game.slug}
            isSignedIn={Boolean(session?.user)}
            items={await safeQuery(() => Review.find({ gameSlug: game.slug }).sort({ createdAt: -1 }).limit(30).lean(), [])}
            // The game tab shows reviews of every edition together, so each
            // one is labelled with what it actually covers.
            showEditionLabels
            editionNamesBySlug={new Map(editions.map((e) => [e.slug, e.name]))}
          />
        )}
        {tab === "media" && <MediaTab game={game} />}
      </div>
    </div>
  );
}

/* ────────────────────────── Tabs ────────────────────────── */

function OverviewTab({
  game,
  developer,
  featuring,
  similar,
  weeklyIssue,
  discordPresence,
  editions,
  liveStats,
}: {
  game: Game;
  developer: Developer | undefined;
  featuring: Awaited<ReturnType<typeof collectionsFeaturing>>;
  similar: Game[];
  weeklyIssue?: WeeklyIssue;
  discordPresence?: { online?: number; members?: number } | null;
  editions: Edition[];
  liveStats: EntityLiveStats;
}) {
  if (!game) return null;

  const issue = weeklyIssue;
  const relatedComparisons = comparisonsFeaturing(game.slug);
  const relatedAlternatives = alternativePages.filter((p) =>
    p.picks.some((pick) => pick.slug === game.slug)
  );

  const installTotal = liveStats.installsAllTime ?? 0;

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-10">
        {/* Quality assessment leads the page — it is the reason to trust
            everything below it, and the block most likely to be cited. */}
        {game.qualityBar && (
          <QualityBarPanel bar={game.qualityBar} gameTitle={game.title} />
        )}

        {/* Editions sit high on the page: when a game has several, which one
            to install is the reader's first decision, ahead of the blurb.
            Renders nothing for games with only the generated Official one. */}
        <EditionsSection game={game} editions={editions} />

        <section>
          <h2 className="text-lg font-bold">About {game.title}</h2>
          {game.longDescription ? (
            <div className="mt-2 space-y-4 leading-relaxed text-muted-foreground">
              {game.longDescription.split("\n\n").map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          ) : (
            <p className="mt-2 leading-relaxed text-muted-foreground">{game.description}</p>
          )}
        </section>

        {game.whyWePickedIt && (
          <section className="rounded-xl border-l-4 border-primary bg-card p-5">
            <h2 className="text-lg font-bold">Why we picked it</h2>
            <p className="mt-2 leading-relaxed text-muted-foreground">{game.whyWePickedIt}</p>
            {issue && (
              <p className="mt-3 text-sm">
                <Link
                  href={`/weekly/${issue.slug}`}
                  className="font-semibold text-primary hover:underline"
                >
                  Featured in PlayBound Weekly, week {issue.week} of {issue.year} →
                </Link>
              </p>
            )}
          </section>
        )}

        {(game.bestFor?.length || game.notFor?.length) && (
          <section>
            <h2 className="text-lg font-bold">Who it&apos;s for</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {game.bestFor?.length ? (
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-xs font-semibold tracking-wide text-primary uppercase">
                    Great if you want
                  </p>
                  <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                    {game.bestFor.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span aria-hidden className="text-primary">
                          +
                        </span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {game.notFor?.length ? (
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Look elsewhere if
                  </p>
                  <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                    {game.notFor.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span aria-hidden>−</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </section>
        )}

        <section>
          <h2 className="text-lg font-bold">Features</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {game.features.map((f) => (
              <div key={f} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
                <Gamepad2 className="size-4 text-primary" /> {f}
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-bold">System Requirements</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Minimum</p>
              <p className="mt-1.5 text-sm">{game.systemRequirements.min}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Recommended</p>
              <p className="mt-1.5 text-sm">{game.systemRequirements.recommended}</p>
            </div>
          </div>
        </section>

        {/* Question-shaped headings that mirror real queries. Paired with
            FAQPage schema, this is the highest-yield block for AI citation. */}
        {game.faq?.length ? (
          <section>
            <h2 className="text-lg font-bold">
              Frequently asked questions about {game.title}
            </h2>
            <div className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
              {game.faq.map((item) => (
                <div key={item.q} className="p-4">
                  <h3 className="font-semibold">{item.q}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {item.a}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {(relatedComparisons.length > 0 || relatedAlternatives.length > 0) && (
          <section>
            <h2 className="text-lg font-bold">Compare and decide</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {relatedComparisons.map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`/compare/${c.slug}`}
                    className="block rounded-lg border border-border bg-card px-3 py-2.5 text-sm font-semibold transition-colors hover:border-primary/40"
                  >
                    {c.title} →
                  </Link>
                </li>
              ))}
              {relatedAlternatives.map((p) => (
                <li key={p.slug}>
                  <Link
                    href={`/alternatives/${p.slug}`}
                    className="block rounded-lg border border-border bg-card px-3 py-2.5 text-sm font-semibold transition-colors hover:border-primary/40"
                  >
                    {p.title} →
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {similar.length > 0 && (
          <section>
            <h2 className="mb-4 text-lg font-bold">More Like This</h2>
            <CompatibleMoreLikeThis games={similar} />
          </section>
        )}
      </div>

      <aside className="min-w-0 space-y-4">
        <ActivityStatsCard
          playingNow={liveStats.playingNow}
          rows={[
            { label: "Players this month", value: liveStats.playersThisMonth },
            ...(liveStats.multiplayerPlayers > 0
              ? [{ label: "On multiplayer servers", value: liveStats.multiplayerPlayers }]
              : []),
            ...(liveStats.serverCount > 0
              ? [{ label: "Live servers", value: liveStats.serverCount }]
              : []),
            ...(installTotal > 0 ? [{ label: "Installs", value: installTotal }] : []),
            ...(liveStats.installsThisMonth > 0
              ? [{ label: "Installs this month", value: liveStats.installsThisMonth }]
              : []),
          ]}
        />
        <div className="hidden lg:block">
          <GameFriendsWidget gameSlug={game.slug} />
        </div>
        {developer && (
          <Link
            href={`/developers/${developer.slug}`}
            className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
          >
            <Avatar name={developer.name} hue={developer.artHue} size="lg" />
            <div className="min-w-0">
              <p className="truncate font-bold">{developer.name}</p>
              <p className="text-xs break-words text-muted-foreground">{developer.tagline}</p>
            </div>
          </Link>
        )}
        <div className="space-y-3 rounded-xl border border-border bg-card p-4 text-sm">
          {[
            ["Released", String(game.releaseYear)],
            ["License", game.license],
            ["Platforms", game.platforms.join(", ")],
            ["Download size", game.sizeMB >= 1000 ? `${(game.sizeMB / 1000).toFixed(1)} GB` : `${game.sizeMB} MB`],
            ["Launch", game.launchMethods.map((m) => (m === "install" ? "Install" : m === "server" ? "Dedicated Servers" : "Browser")).join(" · ")],
            ["Steam Deck", game.steamDeck ? "Compatible" : "Untested"],
          ].map(([k, v]) => (
            <div key={k} className="flex items-start justify-between gap-4">
              <span className="text-muted-foreground">{k}</span>
              <span className="text-right font-medium">{v}</span>
            </div>
          ))}
          <a href={game.website} target="_blank" rel="noreferrer" className="block pt-1 text-sm font-semibold text-primary hover:underline">
            Official website →
          </a>
        </div>
        <CommunityCard
          gameSlug={game.slug}
          gameTitle={game.title}
          communityLinks={game.communityLinks}
          presence={discordPresence}
        />
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Tags</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {game.tags.map((t) => (
              <Badge key={t} tone="neutral">
                {t}
              </Badge>
            ))}
          </div>
        </div>
        {featuring.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Featured in</p>
            <div className="mt-2 space-y-1.5">
              {featuring.map((c) => (
                <Link key={c.slug} href={`/collections/${c.slug}`} className="block text-sm font-medium hover:text-primary hover:underline">
                  {c.title}
                </Link>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

async function ModsTab({ game }: { game: Game }) {
  const includeTesting = await viewerIsAdmin();
  const mods = await modsForGame(game.slug, { includeTesting });

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
    console.error("Mods tab library load failed:", err);
  }

  if (mods.length === 0) {
    return (
      <div>
        <EmptyHint icon={Wrench}>
          {game.features.some((f) => f.toLowerCase().includes("mod"))
            ? `No PlayBound-listed mods for ${game.title} yet — check back soon or the official community hub.`
            : `${game.title} doesn't have documented mods on PlayBound yet.`}
        </EmptyHint>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold">Mods for {game.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Install packageable mods with the PlayBound Launcher, or open hub pages for browse-only content.
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

function AchievementsTab() {
  return (
    <div>
      <EmptyHint icon={Trophy}>Platform-wide achievements are planned but not tracked yet.</EmptyHint>
    </div>
  );
}

function NewsTab({
  game,
  releases,
}: {
  game: Game;
  releases: Awaited<ReturnType<typeof fetchGithubReleases>>;
}) {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold">Releases</h2>
      {releases.length > 0 ? (
        <div className="space-y-3">
          {releases.map((r) => (
            <a
              key={r.tagName}
              href={r.url}
              target="_blank"
              rel="noreferrer"
              className="block rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
            >
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge tone="brand">
                  <Newspaper className="size-3" /> GitHub Release
                </Badge>
                {r.publishedAt && new Date(r.publishedAt).toLocaleDateString()}
              </div>
              <h3 className="mt-2 font-bold">{r.name}</h3>
              {r.body && <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm text-muted-foreground">{r.body}</p>}
            </a>
          ))}
        </div>
      ) : (
        <EmptyHint icon={Newspaper}>
          No release notes available from GitHub for {game.title}.{" "}
          <a href={game.website} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">
            Check the official site
          </a>{" "}
          for updates.
        </EmptyHint>
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
  rating?: number;
}

async function DiscussionTabSection({
  game,
  isSignedIn,
  query,
  presence,
}: {
  game: Game;
  isSignedIn: boolean;
  query: { category?: string; sort?: string; filter?: string; q?: string };
  presence?: { online?: number; members?: number } | null;
}) {
  const categories = visibleCategories(game);
  const filter = query.filter ?? "all";
  const sort = query.sort ?? "activity";
  const category = query.category;
  const q = query.q?.trim() ?? "";

  const mongoQuery: Record<string, unknown> = {
    gameSlug: game.slug,
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
      gameTitle={game.title}
      isSignedIn={isSignedIn}
      categories={categories}
      topics={topics.map(mapTopic)}
      pinned={filter === "pinned" ? [] : pinned.map(mapTopic)}
      communityLinks={game.communityLinks}
      query={query}
      presence={presence}
    />
  );
}

function GuidesTab({ gameSlug, isSignedIn, items }: { gameSlug: string; isSignedIn: boolean; items: PostDoc[] }) {
  return (
    <div className="space-y-6">
      <TelemetryOnce
        event="guide_viewed"
        properties={{ gameSlug }}
      />
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Guides</h2>
        <ContentForm kind="guide" gameSlug={gameSlug} isSignedIn={isSignedIn} />
      </div>
      {items.length > 0 ? (
        <div className="space-y-3">
          {items.map((g) => (
            <div key={String(g._id)} className="rounded-xl border border-border bg-card p-4">
              <p className="font-semibold">{g.title}</p>
              <p className="mt-1.5 line-clamp-4 whitespace-pre-line text-sm text-muted-foreground">{g.body}</p>
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

function MediaTab({ game }: { game: Game }) {
  const shots = game.screenshots?.filter(Boolean) ?? [];
  const vids = (game.videos ?? []).map(classifyMediaUrl);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold">Media</h2>
      {vids.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">Videos</h3>
          <div className="grid grid-cols-1 gap-3">
            {vids.map((v) => (
              <div
                key={v.src}
                className="relative aspect-video overflow-hidden rounded-lg border border-border bg-black"
              >
                {v.kind === "youtube" || v.kind === "vimeo" ? (
                  <iframe
                    src={v.embedUrl}
                    title={`${game.title} video`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="h-full w-full"
                  />
                ) : v.kind === "hls" ? (
                  <HlsVideo
                    src={v.src}
                    title={`${game.title} video`}
                    poster={game.coverImage || undefined}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <video
                    src={v.src}
                    controls
                    preload="metadata"
                    className="h-full w-full object-contain"
                    poster={game.coverImage || undefined}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {shots.length > 0 ? (
        <>
          {vids.length > 0 && (
            <h3 className="text-sm font-semibold text-muted-foreground">Screenshots</h3>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {shots.map((src) => (
              <a
                key={src}
                href={src}
                target="_blank"
                rel="noreferrer"
                className="relative aspect-video overflow-hidden rounded-lg border border-border bg-secondary"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`${game.title} screenshot`} className="h-full w-full object-cover" />
              </a>
            ))}
          </div>
        </>
      ) : (
        <div className="space-y-3">
          <EmptyHint icon={Gamepad2}>
            No screenshots uploaded for {game.title} yet.
            {game.coverImage ? " Showing cover art below." : ""}
          </EmptyHint>
          {game.coverImage ? (
            <div className="relative aspect-video overflow-hidden rounded-lg border border-border">
              <GameArt game={game} showTitle={false} className="absolute inset-0" />
            </div>
          ) : null}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        More screenshots and trailers live on{" "}
        <a href={game.website} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">
          the official {game.title} site
        </a>
        .
      </p>
    </div>
  );
}
