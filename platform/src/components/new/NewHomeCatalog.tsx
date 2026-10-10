"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import type { HomeCardGame } from "@/lib/discoverListing";
import { useFilteredGames } from "@/components/compatibility/useFilteredGames";
import { GameCard } from "@/components/GameCard";
import { GameArt } from "@/components/GameArt";

export function NewHomeHeading() {
  const { data: session } = useSession();
  return <header className="new-page-heading"><div><p className="new-eyebrow">Your clubhouse</p><h1>{session?.user?.name ? `Good to see you, ${session.user.name}.` : "Find your next game night."}</h1><p>Your people, your games, and what’s happening next.</p></div><Link className="new-button primary" href="/new/multiplayer?startParty=1">Start a party</Link></header>;
}

export function NewHomeFeature({ games }: { games: HomeCardGame[] }) {
  const [game] = useFilteredGames(games);
  if (!game) return <section className="new-panel new-pad"><h2>A game for your kind of evening</h2><p>Adjust Discovery and Compatibility to explore more of the catalog.</p><Link href="/new/discover" className="new-button">Explore games</Link></section>;
  return <section className="new-home-feature"><GameArt game={game} showTitle={false} className="new-feature-art" /><div className="new-feature-copy"><p className="new-eyebrow">Something for the whole crew</p><h2>{game.title}</h2><p>{game.tagline}</p><div className="new-actions"><Link href={`/new/games/${game.slug}`} className="new-button primary">Explore the game</Link><Link href="/new/discover" className="new-button">Find something else</Link></div></div></section>;
}

export function NewHomeGames({ games, title, counts }: { games: HomeCardGame[]; title: string; counts: Record<string, number> }) {
  const visible = useFilteredGames(games, { limit: 4 });
  if (!visible.length) return null;
  return <section><div className="new-section-heading"><h2>{title}</h2><Link href={title === "Your library" ? "/new/library" : "/new/discover"}>View all →</Link></div><div className="new-card-grid">{visible.map(game => <GameCard key={game.slug} game={game} playingNow={counts[game.slug] ?? 0} />)}</div></section>;
}
