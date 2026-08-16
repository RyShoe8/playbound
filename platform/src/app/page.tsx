import { Suspense } from "react";
import Link from "next/link";
import { Gem, Newspaper, Server } from "lucide-react";
import { listGamesNewestFirst, listGames, mostPopularGames, getGame } from "@/lib/catalog";
import { listCollections } from "@/lib/collections";
import { listMods } from "@/lib/mods";
import { listServersForGame } from "@/lib/servers/registry";
import { CardRow } from "@/components/GameCard";
import { ModPreviewCard } from "@/components/ModPreviewCard";
import { NewsletterForm } from "@/components/NewsletterForm";
import { FreeGamesSection, FreeGamesSectionFallback } from "@/components/FreeGamesSection";
import { RecaptchaNotice } from "@/components/RecaptchaNotice";
import { HomeGamesSections } from "@/components/HomeGamesSections";
import { HomeHeroPromoSection } from "@/components/HomeHeroPromoSection";
import { PlayWithFriends } from "@/components/friends/PlayWithFriends";
import {
  HomeServerPreviews,
  type HomeServerPreview,
} from "@/components/HomeServerPreviews";
import { Badge, SectionHeader } from "@/components/ui/bits";
import { getCatalogLiveStats } from "@/lib/liveActivity";
import { countOpenPublicParties } from "@/lib/playTogether/party";

const HOME_SERVER_SLUGS = ["openra", "openttd", "luanti"] as const;
const FEATURED_MODS_LIMIT = 8;

async function loadServerPreviews(): Promise<HomeServerPreview[]> {
  const settled = await Promise.allSettled(
    HOME_SERVER_SLUGS.map(async (slug): Promise<HomeServerPreview | null> => {
      const [game, result] = await Promise.all([getGame(slug), listServersForGame(slug)]);
      if (!game || !result.supported) return null;
      const servers = result.servers ?? [];
      const playerCount = servers.reduce((sum, s) => sum + (Number(s.players) || 0), 0);
      return {
        slug,
        title: game.title,
        serverCount: servers.length,
        playerCount,
        platforms: game.platforms,
        browserPlayable: game.browserPlayable,
        steamDeck: game.steamDeck,
      };
    })
  );

  const rows: HomeServerPreview[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled" && result.value) rows.push(result.value);
  }
  return rows;
}

async function HomeLiveServersSection() {
  const serverPreviews = await loadServerPreviews();
  return <HomeServerPreviews rows={serverPreviews} />;
}

function HomeLiveServersFallback() {
  return (
    <section>
      <SectionHeader
        title="Live Servers"
        subtitle="Public multiplayer right now — open the full browser for every title"
        href="/servers"
      />
      <div className="grid gap-3 sm:grid-cols-3">
        {HOME_SERVER_SLUGS.map((slug) => (
          <div
            key={slug}
            className="animate-pulse rounded-xl border border-border bg-card p-4"
          >
            <p className="flex items-center gap-1.5 font-bold text-muted-foreground">
              <Server className="size-3.5" /> Loading…
            </p>
            <div className="mt-3 h-4 w-2/3 rounded bg-muted" />
          </div>
        ))}
      </div>
    </section>
  );
}

export default async function HomePage() {
  const [gamesNewestFirst, games, popular, mods, liveStats, openPartyCount, collections] =
    await Promise.all([
      listGamesNewestFirst(),
      listGames(),
      mostPopularGames(12),
      listMods({ view: "card" }),
      getCatalogLiveStats(),
      countOpenPublicParties(),
      listCollections(),
    ]);

  const featuredMods = mods.slice(0, FEATURED_MODS_LIMIT);
  const featuredCollections = collections.slice(0, 3);
  const gameBySlug = new Map(games.map((g) => [g.slug, g]));

  return (
    <div className="space-y-12 px-4 py-6 sm:px-6 lg:px-8">
      {/* ── PlayBound Promotion & Top Hero / Stats Row ── */}
      <HomeHeroPromoSection
        gamesNewestFirst={gamesNewestFirst}
        games={games.map((g) => ({ slug: g.slug }))}
        live={liveStats}
        openPartyCount={openPartyCount}
      />

      {/* ── Free Games This Week ──────────────────────────────── */}
      <Suspense fallback={<FreeGamesSectionFallback />}>
        <FreeGamesSection />
      </Suspense>

      {/* ── Newsletter ─────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/20 via-card to-card p-6 sm:p-8">
        <Badge tone="brand">
          <Newspaper className="size-3" /> The PlayBound Weekly
        </Badge>
        <h2 className="mt-3 text-2xl font-extrabold tracking-tight">
          Something new to play, every single week.
        </h2>
        <p className="mt-2 max-w-lg text-sm text-muted-foreground">
          One email every Wednesday with what&apos;s worth playing. No spam, unsubscribe any time.
        </p>
        <div className="relative mt-5">
          <NewsletterForm />
        </div>
        <RecaptchaNotice className="mt-3" />
      </section>

      {/* ── Latest + Most popular (client-filtered for compatibility) */}
      <HomeGamesSections latest={gamesNewestFirst} popular={popular} />

      <section>
        <PlayWithFriends surface="homepage" compact />
      </section>

      {/* ── Live servers (streamed — do not block Home chrome) ─── */}
      <Suspense fallback={<HomeLiveServersFallback />}>
        <HomeLiveServersSection />
      </Suspense>

      {/* ── Mods ───────────────────────────────────────────────── */}
      {featuredMods.length > 0 && (
        <section>
          <SectionHeader
            title="Mods"
            subtitle="Packageable add-ons for PlayBound titles"
            href="/mods"
          />
          <CardRow>
            {featuredMods.map((m) => {
              const base = gameBySlug.get(m.baseGameSlug);
              return (
                <ModPreviewCard
                  key={m.slug}
                  mod={m}
                  baseGame={
                    base
                      ? {
                          slug: base.slug,
                          title: base.title,
                          coverImage: base.coverImage,
                        }
                      : null
                  }
                />
              );
            })}
          </CardRow>
        </section>
      )}

      {/* ── Collections ────────────────────────────────────────── */}
      {featuredCollections.length > 0 && (
        <section>
          <SectionHeader
            title="Curated Collections"
            subtitle="Hand-picked groupings from PlayBound"
            href="/collections"
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featuredCollections.map((c) => (
              <Link
                key={c.slug}
                href={`/collections/${c.slug}`}
                className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
              >
                <p className="flex items-center gap-1.5 font-bold">
                  <Gem className="size-3.5 text-primary" /> {c.title}
                </p>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{c.description}</p>
                <p className="mt-2 text-xs text-muted-foreground">{c.gameSlugs.length} games</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
