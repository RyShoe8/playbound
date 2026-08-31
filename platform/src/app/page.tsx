import type { Metadata } from "next";
import { Suspense } from "react";
import { Newspaper, Server } from "lucide-react";
import { getGame, listGames, listGamesNewestFirst, mostPopularGames } from "@/lib/catalog";
import { listCollections } from "@/lib/collections";
import { listMods } from "@/lib/mods";
import { listServersForGame } from "@/lib/servers/registry";
import { FeaturedModsRow } from "@/components/access/FeaturedModsRow";
import { FeaturedCollectionsRow } from "@/components/access/FeaturedCollectionsRow";
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
import { getCatalogLiveStats, playingNowBySlug } from "@/lib/liveActivity";

const HOME_SERVER_SLUGS = ["openra", "openttd", "luanti"] as const;
const FEATURED_MODS_LIMIT = 8;

async function loadServerPreviews(): Promise<HomeServerPreview[]> {
  /*
   * No discovery filter here. All three of HOME_SERVER_SLUGS are free, so the
   * filter never removed anything — it only read a cookie, and that read was
   * enough to stop the homepage being prerendered at all.
   */
  const slugs = [...HOME_SERVER_SLUGS];
  const settled = await Promise.allSettled(
    slugs.map(async (slug): Promise<HomeServerPreview | null> => {
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
  const modCandidates = mods.slice(0, FEATURED_MODS_LIMIT * 3).map((m) => {
    const base = gameBySlug.get(m.baseGameSlug);
    return {
      mod: m,
      baseGame: base ? { slug: base.slug, title: base.title, coverImage: base.coverImage } : null,
    };
  });

  return (
    <div className="space-y-12 px-4 py-6 sm:px-6 lg:px-8">
      {/* ── PlayBound Promotion & Top Hero / Stats Row ── */}
      <HomeHeroPromoSection
        gamesNewestFirst={gamesNewestFirst}
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
        latest={gamesNewestFirst}
        popular={popular}
        playingNowBySlug={playingNowBySlug(liveStats)}
      />

      <section>
        <PlayWithFriends surface="homepage" compact />
      </section>

      {/* ── Live servers (streamed — do not block Home chrome) ─── */}
      <Suspense fallback={<HomeLiveServersFallback />}>
        <HomeLiveServersSection />
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
