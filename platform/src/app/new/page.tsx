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
import dbConnect from "@/lib/db";
import LibraryEntry from "@/lib/models/LibraryEntry";
import { FreeGamesSection, FreeGamesSectionFallback } from "@/components/FreeGamesSection";
import { FeaturedModsRow } from "@/components/access/FeaturedModsRow";
import { PlayWithFriends } from "@/components/friends/PlayWithFriends";
import { EventCard } from "@/components/events/EventCard";
import { NewHomeFeature, NewHomeGames, NewHomeHeading } from "@/components/new/NewHomeCatalog";

export { metadata } from "../page";

export default async function NewHomePage() {
  await connection();
  const [games, popular, mods, events, stats, session] = await Promise.all([
    listGamesNewestFirst(), mostPopularGames(12), listMods({ view: "card" }),
    listPublicEvents({ limit: 7 }), getCatalogLiveStats(), getServerSession(authOptions),
  ]);
  const cards = games.map(toHomeCardGame);
  const bySlug = new Map(games.map(game => [game.slug, game]));
  let librarySlugs: string[] = [];
  if (session?.user) {
    await dbConnect();
    const entries = await LibraryEntry.find({ userId: session.user.id, $or: [{ installed: true }, { saved: true }] }).select("gameSlug").sort({ updatedAt: -1 }).limit(24).lean();
    librarySlugs = [...new Set(entries.map(entry => String(entry.gameSlug)))];
  }
  const library = librarySlugs.flatMap(slug => { const game = bySlug.get(slug); return game ? [toHomeCardGame(game)] : []; });
  const nextNight = events.find(event => event.eventType === "game_night");
  const modCandidates = mods.slice(0, 12).map(mod => {
    const base = bySlug.get(mod.baseGameSlug);
    return { mod, baseGame: base ? { slug: base.slug, title: base.title, coverImage: base.coverImage, platforms: base.platforms, browserPlayable: base.browserPlayable, steamDeck: base.steamDeck } : null };
  });
  const counts = playingNowBySlug(stats);
  return <div className="new-home new-page">
    <NewHomeHeading />
    <div className="new-home-layout">
      <div className="new-main-stack">
        <NewHomeFeature games={popular.map(toHomeCardGame)} />
        <NewHomeGames games={library.length ? library : cards} title={library.length ? "Your library" : "Recently added"} counts={counts} />
        <section className="new-home-event"><div className="new-section-heading"><h2>Next game night</h2><Link href="/new/events">Full schedule →</Link></div>{nextNight ? <EventCard event={nextNight} gameTitle={nextNight.gameSlug ? bySlug.get(nextNight.gameSlug)?.title : null} /> : <div className="new-panel new-pad"><h3>Make the next game night happen</h3><p>Gather your friends around a game you love.</p><Link className="new-button primary" href={session?.user?.role === "admin" ? "/new/admin/events/new" : "/new/multiplayer?startParty=1"}>{session?.user?.role === "admin" ? "Create event" : "Start a party"}</Link></div>}</section>
        <Suspense fallback={<FreeGamesSectionFallback />}><FreeGamesSection /></Suspense>
        <NewHomeGames games={popular.map(toHomeCardGame)} title="Popular with the community" counts={counts} />
        <FeaturedModsRow candidates={modCandidates} limit={4} />
      </div>
      <aside className="new-home-rail">
        <section className="new-panel new-pad"><div className="new-section-heading"><h2>Your people</h2><Link href="/new/friends">Friends →</Link></div>{session?.user ? <PlayWithFriends surface="new_home" compact /> : <><p>See what your friends are playing and pick up your party here.</p><Link className="new-button" href="/login?callbackUrl=/new">Sign in</Link></>}</section>
        <section className="new-panel new-pad"><p className="new-eyebrow">One place to play</p><h2>Your launcher</h2><p>Your library, parties, and game helper—together on your desktop.</p><Link className="new-button" href="/new/launcher">Explore the launcher</Link></section>
        <section className="new-panel new-pad"><h2>Discover more</h2><nav className="new-rail-links"><Link href="/new/collections">Curated collections →</Link><Link href="/new/deals">Free games & deals →</Link><Link href="/new/weekly">This week’s pick →</Link><Link href="/new/multiplayer">Community servers →</Link></nav></section>
      </aside>
    </div>
  </div>;
}
