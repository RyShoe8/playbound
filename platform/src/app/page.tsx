import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Newspaper, Server } from "lucide-react";
import { getGame, listGames, listGamesNewestFirst, mostPopularGames } from "@/lib/catalog";
import { listCollections } from "@/lib/collections";
import { listMods } from "@/lib/mods";
import { listServersForGame } from "@/lib/servers/registry";
import { toHomeCardGame } from "@/lib/discoverListing";
import { FeaturedModsRow } from "@/components/access/FeaturedModsRow";
import { FeaturedCollectionsRow } from "@/components/access/FeaturedCollectionsRow";
import { NewsletterForm } from "@/components/NewsletterForm";
import { FreeGamesSection, FreeGamesSectionFallback } from "@/components/FreeGamesSection";
import { RecaptchaNotice } from "@/components/RecaptchaNotice";
import { HomeGamesSections } from "@/components/HomeGamesSections";
import { HomeHeroPromoSection } from "@/components/HomeHeroPromoSection";
import { PlayWithFriends } from "@/components/friends/PlayWithFriends";
import {
  HomeCommunityServers,
  type HomeCommunityServer,
} from "@/components/HomeCommunityServers";
import { Badge, SectionHeader } from "@/components/ui/bits";
import { getCatalogLiveStats, playingNowBySlug } from "@/lib/liveActivity";
import { listAllJoinableCommunityServers } from "@/lib/communityHosting/discovery";

const FEATURED_MODS_LIMIT = 8;

async function loadCommunityServers(): Promise<HomeCommunityServer[]> {
  const hosted = await listAllJoinableCommunityServers();
  const games = await listGames();
  const gameMap = new Map(games.map((g) => [g.slug, g]));
  return hosted.map((s) => {
    const game = gameMap.get(s.gameSlug || "");
    return {
      id: s.id,
      gameSlug: s.gameSlug || "",
      gameTitle: s.gameTitle || game?.title || s.gameSlug || "Server",
      editionSlug: s.editionSlug,
      serverName: s.name,
      host: s.host,
      port: s.port,
      players: s.players,
      maxPlayers: s.maxPlayers,
      bots: s.bots,
      region: s.location?.region || "US",
      platforms: game?.platforms ?? [],
      browserPlayable: Boolean(game?.browserPlayable),
      steamDeck: Boolean(game?.steamDeck),
    };
  });
}

async function HomeCommunityServersSection() {
  await connection();
  const servers = await loadCommunityServers();
  return <HomeCommunityServers servers={servers} />;
}

function HomeCommunityServersFallback() {
  return (
    <section>
      <SectionHeader
        title="Community Servers"
        subtitle="Dedicated servers hosted by PlayBound — join and play right now"
        href="/multiplayer"
      />
      <div className="grid gap-3 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
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

/**
 * The homepage's own canonical, which used to live on the root layout.
 *
 * Only `alternates` is set here. Title, description and the social cards are
 * already correct from the layout defaults, and re-stating them would mean two
 * places to keep in sync for no gain.
 */
/*
 * ISR, matched to the live-activity window — see developers/page.tsx for the
 * reasoning. Admin writes still land immediately via revalidateTag("catalog").
 */

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  /*
   * No party count here. This render is CDN-cached, so a count computed in it
   * is frozen — the 0 a just-created public party could not clear.
   * CatalogStatsCard fetches it on the client instead.
   */
  const [gamesNewestFirst, games, popular, mods, liveStats, collections] =
    await Promise.all([
      listGamesNewestFirst(),
      listGames(),
      mostPopularGames(12),
      listMods({ view: "card" }),
      getCatalogLiveStats(),
      listCollections(),
    ]);

  /*
   * Candidate pools, not final rows. FeaturedModsRow and FeaturedCollectionsRow
   * apply the viewer's discovery mode and then slice, which is the order the
   * server used and has to stay: slicing first would leave a FREE viewer short
   * whenever a paid entry landed in the top few.
   */
  const gameBySlug = new Map(games.map((g) => [g.slug, g]));
  // Card-sized projections: client components get only what cards render.
  const latestCards = gamesNewestFirst.map(toHomeCardGame);
  const modCandidates = mods.slice(0, FEATURED_MODS_LIMIT * 3).map((m) => {
    const base = gameBySlug.get(m.baseGameSlug);
    return {
      mod: m,
      baseGame: base
        ? {
            slug: base.slug,
            title: base.title,
            coverImage: base.coverImage,
            platforms: base.platforms,
            browserPlayable: base.browserPlayable,
            steamDeck: base.steamDeck,
          }
        : null,
    };
  });

  return (
    <div className="space-y-12 px-4 py-6 sm:px-6 lg:px-8">
      {/* ── PlayBound Promotion & Top Hero / Stats Row ── */}
      <HomeHeroPromoSection
        gamesNewestFirst={latestCards}
        games={games.map((g) => ({ slug: g.slug }))}
        live={liveStats}
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
      <HomeGamesSections
        latest={latestCards}
        popular={popular.map(toHomeCardGame)}
        playingNowBySlug={playingNowBySlug(liveStats)}
      />

      <section>
        <PlayWithFriends surface="homepage" compact />
      </section>

      {/* ── Community servers (streamed — do not block Home chrome) ─── */}
      <Suspense fallback={<HomeCommunityServersFallback />}>
        <HomeCommunityServersSection />
      </Suspense>

      {/* ── Mods ───────────────────────────────────────────────── */}
      <FeaturedModsRow candidates={modCandidates} limit={FEATURED_MODS_LIMIT} />

      {/* ── Collections ────────────────────────────────────────── */}
      <FeaturedCollectionsRow
        collections={collections.map((c) => ({
          slug: c.slug,
          title: c.title,
          description: c.description,
          gameSlugs: c.gameSlugs,
        }))}
        limit={3}
      />
    </div>
  );
}
