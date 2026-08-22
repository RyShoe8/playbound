import { Suspense } from "react";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { ChevronDown, Film, Gamepad2, Image as ImageIcon, Newspaper, Play, Sparkles, Trophy, Wrench } from "lucide-react";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import Review from "@/lib/models/Review";
import GuidePost from "@/lib/models/GuidePost";
import DiscussionTopic from "@/lib/models/DiscussionTopic";
import LibraryModEntry from "@/lib/models/LibraryModEntry";
import { fetchGithubReleases } from "@/lib/github";
import { getGame, canonicalSlugFor } from "@/lib/catalog";
import { listUnlockedByMaster } from "@/lib/masterCopy";
import { getDeveloper } from "@/lib/developers";
import { listPublicEditionsForGame, hasChoosableEditions } from "@/lib/editions";
import type { Edition } from "@/lib/editionTypes";
import { hasServerBrowser } from "@/lib/servers/registry";
import { EditionsSection } from "@/components/editions/EditionsSection";
import type { Game, Developer } from "@/lib/data/types";
import { GameArt } from "@/components/GameArt";
import { LaunchBadge } from "@/components/GameCard";
import { CompatibleGearList } from "@/components/gear/CompatibleGearList";
import { GameHardwareCompatibility } from "@/components/hardware/GameHardwareCompatibility";
import { ContentForm } from "@/components/ContentForm";
import { ReviewList } from "@/components/reviews/ReviewList";
import { DiscussionBoard } from "@/components/discussion/DiscussionBoard";
import { GameUpcomingEvents } from "@/components/events/GameUpcomingEvents";
import { ScrollActiveTab } from "@/components/discussion/ScrollActiveTab";
import { visibleCategories } from "@/lib/discussion/categories";
import { gameScopedUgcFilter } from "@/lib/ugcTarget";
import { getDiscordPresence } from "@/lib/discordPresence";
import { withOutboundUtm } from "@/lib/utm";
import { GameFriendsWidget } from "@/components/friends/GameFriendsWidget";
import { Avatar, Badge, EmptyHint } from "@/components/ui/bits";
import { cn } from "@/lib/utils";
import { modsForGame } from "@/lib/mods";
import { LauncherInstallButton } from "@/components/LauncherInstallButton";
import { QualityBarPanel } from "@/components/QualityBarPanel";
import { GameCommerce } from "@/components/GameCommerce";
import { MasterCopyUnlocks } from "@/components/MasterCopyUnlocks";
import { getStoreAffiliateMap } from "@/lib/commerce/affiliates";
import { FreeOfferBanner } from "@/components/FreeOfferBanner";
import { offersForGame } from "@/lib/freeOffers/service";
import { GameInstallContent } from "@/components/GameInstallContent";
import { InstallHealthNotice } from "@/components/InstallHealthNotice";
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
import { canAccessTesting, viewerCanSeeTesting } from "@/lib/requestIncludesTesting";
import { comparisonsFeaturing } from "@/lib/data/comparisons";
import { alternativePages } from "@/lib/data/alternatives";
import { classifyMediaUrl } from "@/lib/mediaEmbed";
import { HlsVideo } from "@/components/HlsVideo";
import { deriveInstallSteps, deriveFaq } from "@/lib/enrich";
import {
  GameActivityAside,
  GameActivityAsideFallback,
  GameCommunityAside,
  GameEditionsBlock,
  GameFeaturingAside,
  GameHeroActions,
  GameHeroActionsFallback,
  GameHeroInLibraryBadge,
  GameHeroPlayingNow,
  GameHeroPlayingNowFallback,
  GameIncompatibilityBannerAsync,
  GameSimilarBlock,
  GameSimilarFallback,
  GameTabCount,
  GameWhyIssueLink,
} from "./GamePageIslands";

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
  const includeTesting = await viewerCanSeeTesting();
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

  // One session read for testing-catalog access + signed-in UI.
  const session = await getServerSession(authOptions);
  const includeTesting = canAccessTesting(session?.user);
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
  // Critical path only: developer + editions for hero chooser and static schema.
  const [developer, editions, gameMods, gameOffers] = await Promise.all([
    getDeveloper(game.developerSlug),
    listPublicEditionsForGame(game),
    // Awaited here so the Mods tab can be hidden when a game has none. The tab
    // filter below used to call modsForGame() without awaiting and read .length
    // off the Promise, which is undefined — so the comparison never matched and
    // the tab showed on every game regardless. listMods is cached per request,
    // so ModsTab re-reading this costs nothing.
    modsForGame(game.slug, { includeTesting }),
    offersForGame(game.slug),
  ]);
  const choosable = hasChoosableEditions(editions);
  const signedIn = Boolean(session?.user);

  const activeOffer = gameOffers.find((o) => o.isActive) || null;
  const historicalOffers = gameOffers.filter((o) => !o.isActive);

  return (
    <div>
      <TelemetryOnce
        event="game_viewed"
        properties={{ gameSlug: game.slug, gameTitle: game.title }}
      />
      <JsonLd
        data={graph(
          videoGameSchema(game, developer),
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
          Testing
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
                <Suspense fallback={null}>
                  <GameHeroInLibraryBadge slug={game.slug} />
                </Suspense>
                {game.genres.map((g) => (
                  <Badge key={g} tone="outline">
                    {g}
                  </Badge>
                ))}
              </div>
              <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">{game.title}</h1>
              <p className="mt-2 text-muted-foreground sm:text-lg">{game.tagline}</p>
              <div className="mt-3">
                <Suspense fallback={<GameHeroPlayingNowFallback />}>
                  <GameHeroPlayingNow slug={game.slug} />
                </Suspense>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Suspense fallback={<GameHeroActionsFallback game={game} choosable={choosable} />}>
                <GameHeroActions game={game} choosable={choosable} />
              </Suspense>
            </div>
          </div>

          {(activeOffer || historicalOffers.length > 0) && (
            <div className="mt-6">
              <FreeOfferBanner activeOffer={activeOffer} historicalOffers={historicalOffers} />
            </div>
          )}
        </div>
      </section>

      <Suspense fallback={null}>
        <GameIncompatibilityBannerAsync game={game} />
      </Suspense>

      {/* ── Tabs ───────────────────────────────────────────────── */}
      <nav className="no-scrollbar sticky top-0 z-20 flex gap-1 overflow-x-auto border-b border-border bg-background/90 px-4 backdrop-blur-md sm:px-6 lg:px-8">
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
        {PROMOTED_ROUTES.filter((r) => {
          if (r.key === "servers" && !hasServerBrowser(game.slug)) return false;
          return true;
        }).map((r) => (
          <Link
            key={r.key}
            href={r.href(game.slug)}
            data-tab={r.key}
            className="border-b-2 border-transparent px-3 py-3 text-sm font-semibold whitespace-nowrap capitalize text-muted-foreground transition-colors hover:text-foreground"
          >
            {r.label}
          </Link>
        ))}

        {PARAM_TABS.filter((t) => t !== "overview" && t !== "install")
          .filter((t) => {
            if (t === "mods" && gameMods.length === 0) return false;
            return true;
          })
          .map((t) => (
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
            {(t === "discussion" || t === "reviews") && (
              <Suspense fallback={null}>
                <GameTabCount gameSlug={game.slug} kind={t} />
              </Suspense>
            )}
          </Link>
        ))}
      </nav>

      <div className="px-4 py-8 sm:px-6 lg:px-8">
        {tab === "overview" && (
          <OverviewTab
            game={game}
            developer={developer}
            editions={editions}
            includeTesting={includeTesting}
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
            {/* Above the instructions on purpose: if the download is currently
                dead, that is the first thing a reader needs, not the last. */}
            <div className="mb-4">
              <InstallHealthNotice game={game} />
            </div>
            <GameInstallContent game={game} />
          </>
        )}
        {tab === "mods" && (
          <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-muted/40" />}>
            <ModsTab game={game} />
          </Suspense>
        )}
        {tab === "guides" && (
          <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-muted/40" />}>
            <GuidesTabAsync gameSlug={game.slug} isSignedIn={signedIn} />
          </Suspense>
        )}
        {tab === "achievements" && <AchievementsTab />}
        {tab === "news" && (
          <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-muted/40" />}>
            <NewsTabAsync game={game} />
          </Suspense>
        )}
        {tab === "discussion" && (
          <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-muted/40" />}>
            <DiscussionTabSection
              game={game}
              isSignedIn={signedIn}
              query={{
                category: sp.category,
                sort: sp.sort,
                filter: sp.filter,
                q: sp.q,
              }}
            />
          </Suspense>
        )}
        {tab === "reviews" && (
          <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-muted/40" />}>
            <ReviewsTabAsync gameSlug={game.slug} isSignedIn={signedIn} editions={editions} />
          </Suspense>
        )}
        {tab === "media" && <MediaTab game={game} />}
      </div>
    </div>
  );
}

/* ────────────────────────── Tabs ────────────────────────── */

async function OverviewTab({
  game,
  developer,
  editions,
  includeTesting,
}: {
  game: Game;
  developer: Developer | undefined;
  editions: Edition[];
  includeTesting: boolean;
}) {
  if (!game) return null;
  const [affiliates, unlocks] = await Promise.all([
    getStoreAffiliateMap(),
    game.masterCopy ? listUnlockedByMaster(game.slug, { includeTesting }) : Promise.resolve(null),
  ]);

  const relatedComparisons = comparisonsFeaturing(game.slug);
  const relatedAlternatives = alternativePages.filter((p) =>
    p.picks.some((pick) => pick.slug === game.slug)
  );

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-10">
        {unlocks ? <MasterCopyUnlocks game={game} unlocks={unlocks} affiliates={affiliates} /> : null}

        <GameCommerce game={game} affiliates={affiliates} />

        {game.thatOneThing && (
          <section className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/15 via-card to-card p-6 shadow-sm sm:p-7">
            <div aria-hidden className="absolute -right-10 -top-12 size-36 rounded-full bg-primary/15 blur-3xl" />
            <div className="relative flex gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/15 text-primary shadow-sm">
                <Sparkles className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-extrabold tracking-[0.18em] text-primary uppercase">
                  That One Thing
                </p>
                <h2 className="mt-1 text-xl font-extrabold tracking-tight sm:text-2xl">
                  Why {game.title} sticks with us
                </h2>
                <p className="mt-2 text-base leading-relaxed text-foreground/85 sm:text-lg">
                  {game.thatOneThing}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Quality assessment leads the rest of the page — it is the reason to trust
            everything below it, and the block most likely to be cited. */}
        {game.qualityBar && (
          <QualityBarPanel bar={game.qualityBar} gameTitle={game.title} />
        )}

        {/* Editions sit high on the page: when a game has several, which one
            to install is the reader's first decision, ahead of the blurb.
            Renders nothing for games with only the generated Official one. */}
        <Suspense fallback={<EditionsSectionFallback game={game} editions={editions} />}>
          <GameEditionsBlock game={game} editions={editions} />
        </Suspense>

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
            <Suspense fallback={null}>
              <GameWhyIssueLink gameSlug={game.slug} />
            </Suspense>
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
          <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-muted/30" />}>
            <GameHardwareCompatibility gameSlug={game.slug} />
          </Suspense>
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

        <section>
          <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-muted/30" />}>
            <CompatibleGearList gameSlug={game.slug} gameTitle={game.title} />
          </Suspense>
        </section>

        <Suspense fallback={<GameSimilarFallback />}>
          <GameSimilarBlock game={game} />
        </Suspense>
      </div>

      <aside className="min-w-0 space-y-4">
        <Suspense fallback={<GameActivityAsideFallback />}>
          <GameActivityAside gameSlug={game.slug} />
        </Suspense>
        <div className="hidden lg:block">
          <GameFriendsWidget gameSlug={game.slug} />
        </div>
        <Suspense fallback={null}>
          <GameUpcomingEvents gameSlug={game.slug} />
        </Suspense>
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
          <a
            href={withOutboundUtm(game.website, { campaign: "game_page", content: game.slug })}
            target="_blank"
            rel="noreferrer"
            className="block pt-1 text-sm font-semibold text-primary hover:underline"
          >
            Official website →
          </a>
        </div>
        <Suspense fallback={<div className="h-32 animate-pulse rounded-xl bg-muted/40" />}>
          <GameCommunityAside game={game} />
        </Suspense>
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
        <Suspense fallback={null}>
          <GameFeaturingAside gameSlug={game.slug} />
        </Suspense>
      </aside>
    </div>
  );
}

function EditionsSectionFallback({ game, editions }: { game: Game; editions: Edition[] }) {
  // Show editions immediately without waiting on live player counts.
  return <EditionsSection game={game} editions={editions} />;
}

async function ModsTab({ game }: { game: Game }) {
  const includeTesting = await viewerCanSeeTesting();
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

async function GuidesTabAsync({
  gameSlug,
  isSignedIn,
}: {
  gameSlug: string;
  isSignedIn: boolean;
}) {
  const items = await safeQuery(
    () =>
      GuidePost.find({ gameSlug, ...gameScopedUgcFilter() })
        .sort({ createdAt: -1 })
        .limit(30)
        .lean(),
    []
  );
  return <GuidesTab gameSlug={gameSlug} isSignedIn={isSignedIn} items={items} />;
}

async function NewsTabAsync({ game }: { game: Game }) {
  const releases = game.githubRepo ? await fetchGithubReleases(game.githubRepo) : [];
  return <NewsTab game={game} releases={releases} />;
}

async function ReviewsTabAsync({
  gameSlug,
  isSignedIn,
  editions,
}: {
  gameSlug: string;
  isSignedIn: boolean;
  editions: Edition[];
}) {
  const items = await safeQuery(
    () =>
      Review.find({ gameSlug, ...gameScopedUgcFilter() })
        .sort({ createdAt: -1 })
        .limit(30)
        .lean(),
    []
  );
  return (
    <ReviewList
      gameSlug={gameSlug}
      isSignedIn={isSignedIn}
      items={items}
      showEditionLabels={hasChoosableEditions(editions)}
      editionNamesBySlug={new Map(editions.map((e) => [e.slug, e.name]))}
    />
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
              href={withOutboundUtm(r.url, { campaign: "game_page", content: game.slug })}
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
          <a
            href={withOutboundUtm(game.website, { campaign: "game_page", content: game.slug })}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-primary hover:underline"
          >
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
}: {
  game: Game;
  isSignedIn: boolean;
  query: { category?: string; sort?: string; filter?: string; q?: string };
}) {
  const presence = await getDiscordPresence(game.communityLinks?.playboundDiscord?.guildId);
  const categories = visibleCategories(game);
  const filter = query.filter ?? "all";
  const sort = query.sort ?? "activity";
  const category = query.category;
  const q = query.q?.trim() ?? "";

  const mongoQuery: Record<string, unknown> = {
    gameSlug: game.slug,
    ...gameScopedUgcFilter(),
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
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Media</h2>
        <span className="text-xs text-muted-foreground">
          {vids.length > 0 && `${vids.length} ${vids.length === 1 ? "video" : "videos"}`}
          {vids.length > 0 && shots.length > 0 && " · "}
          {shots.length > 0 && `${shots.length} ${shots.length === 1 ? "screenshot" : "screenshots"}`}
        </span>
      </div>

      {vids.length > 0 && (
        <details open className="group rounded-xl border border-border bg-card/50 overflow-hidden">
          <summary className="flex cursor-pointer select-none items-center justify-between px-4 py-3 bg-secondary/30 transition-colors hover:bg-secondary/50 font-semibold text-sm">
            <span className="flex items-center gap-2">
              <Film className="size-4 text-primary" />
              <span>Videos</span>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground font-normal">
                {vids.length}
              </span>
            </span>
            <ChevronDown className="size-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <div className="p-4 grid grid-cols-1 gap-3">
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
        </details>
      )}

      {shots.length > 0 ? (
        <details open className="group rounded-xl border border-border bg-card/50 overflow-hidden">
          <summary className="flex cursor-pointer select-none items-center justify-between px-4 py-3 bg-secondary/30 transition-colors hover:bg-secondary/50 font-semibold text-sm">
            <span className="flex items-center gap-2">
              <ImageIcon className="size-4 text-primary" />
              <span>Screenshots</span>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground font-normal">
                {shots.length}
              </span>
            </span>
            <ChevronDown className="size-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <div className="p-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {shots.map((src) => (
              <a
                key={src}
                href={src}
                target="_blank"
                rel="noreferrer"
                className="relative aspect-video overflow-hidden rounded-lg border border-border bg-secondary transition-transform hover:scale-[1.01]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`${game.title} screenshot`} className="h-full w-full object-cover" />
              </a>
            ))}
          </div>
        </details>
      ) : (
        vids.length === 0 && (
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
        )
      )}
      <p className="text-xs text-muted-foreground">
        More screenshots and trailers live on{" "}
        <a
          href={withOutboundUtm(game.website, { campaign: "game_page", content: game.slug })}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-primary hover:underline"
        >
          the official {game.title} site
        </a>
        .
      </p>
    </div>
  );
}
