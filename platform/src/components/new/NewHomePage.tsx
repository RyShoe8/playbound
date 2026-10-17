import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { listGamesNewestFirst, mostPopularGames } from "@/lib/catalog";
import { toHomeCardGame } from "@/lib/discoverListing";
import { listMods } from "@/lib/mods";
import { listPublicEvents } from "@/lib/events/service";
import { getCatalogLiveStats, playingNowBySlug } from "@/lib/liveActivity";
import { listEditionsForGames } from "@/lib/editions";
import { NewHomeEditions } from "@/components/new/NewHomeEditions";
import { hasLinkedLauncher } from "@/lib/library";
import { FreeGamesSection, FreeGamesSectionFallback } from "@/components/FreeGamesSection";
import { FeaturedModsRow } from "@/components/access/FeaturedModsRow";
import { PlayWithFriends } from "@/components/friends/PlayWithFriends";
import { EventCard } from "@/components/events/EventCard";
import { NewHomeFeature, NewHomeGames, NewHomeHeading } from "@/components/new/NewHomeCatalog";


export default async function NewHomePage() {
  await connection();
  const [games, popular, mods, events, stats, session] = await Promise.all([
    listGamesNewestFirst(), mostPopularGames(12, 7), listMods({ view: "card" }),
    listPublicEvents({ limit: 7 }), getCatalogLiveStats(), getServerSession(authOptions),
  ]);
  const launcherLinked = session?.user?.id ? await hasLinkedLauncher(session.user.id) : false;
  const bySlug = new Map(games.map(game => [game.slug, game]));
  const editionsByGame = await listEditionsForGames(games);
  const newestEditions = games.flatMap(game => (editionsByGame.get(game.slug) || [])
    .filter(edition => edition.createdAt && !edition.id.startsWith("seed:"))
    .map(edition => ({ game, edition })))
    .sort((a, b) => Date.parse(b.edition.createdAt!) - Date.parse(a.edition.createdAt!)).slice(0, 24)
    .map(({ game, edition }) => ({
      game: toHomeCardGame(game),
      edition: {
        id: edition.id, slug: edition.slug, name: edition.name, shortDescription: edition.shortDescription,
        platforms: edition.platforms, branding: { heroImage: edition.branding.heroImage, logo: edition.branding.logo },
      },
    }));
  // Keep publication order: latest released on PlayBound, not original release year.
  const released = games.filter(game => game.releaseYear <= new Date().getFullYear());
  /*
   * The client filters these by Discovery and Compatibility and shows four, so
   * it needs a deep-enough slice of the newest games, not the whole catalog.
   * Sending every released game twice made the home page's payload ~1.1MB.
   */
  const newestForClient = released.slice(0, 80).map(toHomeCardGame);
  const nextNight = events.find(event => event.eventType === "game_night");
  const modCandidates = [...mods].sort((a, b) => (Date.parse(b.createdAt || "") || 0) - (Date.parse(a.createdAt || "") || 0)).slice(0, 24).map(mod => {
    const base = bySlug.get(mod.baseGameSlug);
    return { mod, baseGame: base ? { slug: base.slug, title: base.title, coverImage: base.coverImage, platforms: base.platforms, browserPlayable: base.browserPlayable, steamDeck: base.steamDeck } : null };
  });
  const counts = playingNowBySlug(stats);
  return <div className="new-home new-page">
    <NewHomeHeading />
    <div className="new-home-layout">
      <div className="new-main-stack">
        <NewHomeFeature games={newestForClient} />
        <NewHomeGames games={popular.map(toHomeCardGame)} title="Most Popular this week" counts={counts} />
        <section className="new-home-event"><div className="new-section-heading"><h2>Next game night</h2><Link href="/events">Full schedule →</Link></div>{nextNight ? <EventCard event={nextNight} gameTitle={nextNight.gameSlug ? bySlug.get(nextNight.gameSlug)?.title : null} /> : <div className="new-panel new-pad"><h3>Make the next game night happen</h3><p>Gather your friends around a game you love.</p><Link className="new-button primary" href="/events/create">Create event</Link></div>}</section>
        <Suspense fallback={<FreeGamesSectionFallback />}><FreeGamesSection diversifyStores /></Suspense>
        <NewHomeGames games={newestForClient} title="Newest Games" counts={counts} />
        <NewHomeEditions candidates={newestEditions} />
        <FeaturedModsRow candidates={modCandidates} limit={8} title="Newest Mods" grid />
      </div>
      <aside className="new-home-rail">
        <section className="new-panel new-pad"><div className="new-section-heading"><h2>Your people</h2><Link href="/friends">Friends →</Link></div>{session?.user ? <PlayWithFriends surface="new_home" compact /> : <><p>See what your friends are playing and pick up your party here.</p><Link className="new-button" href="/login?callbackUrl=/">Sign in</Link></>}</section>
        {!launcherLinked && <section className="new-panel new-pad"><p className="new-eyebrow">One place to play</p><h2>Your launcher</h2><p>Your library, parties, more multiplayer games and expanded controller support - all in one open source launcher.</p><Link className="new-button" href="/launcher">Explore the launcher</Link></section>}
        <section className="new-panel new-pad"><h2>Discover more</h2><nav className="new-rail-links"><Link href="/collections">Curated collections →</Link><Link href="/deals">Free games & deals →</Link><Link href="/weekly">Weekly newsletter →</Link><Link href="/multiplayer">Community servers →</Link></nav></section>
      </aside>
    </div>
  </div>;
}
