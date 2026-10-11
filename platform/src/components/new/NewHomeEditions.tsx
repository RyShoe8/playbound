"use client";

import Link from "next/link";
import type { HomeCardGame } from "@/lib/discoverListing";
import type { Edition } from "@/lib/editionTypes";
import { GameArt } from "@/components/GameArt";
import { useFilteredGames } from "@/components/compatibility/useFilteredGames";
import { useCompatibilityFilter } from "@/hooks/useCompatibilityFilter";
import { isEditionCompatible } from "@/lib/compatibility/compatibility";

export function NewHomeEditions({ candidates }: { candidates: { game: HomeCardGame; edition: Edition }[] }) {
  const accessible = new Set(useFilteredGames(candidates.map(c => c.game)).map(g => g.slug));
  const { mode, device } = useCompatibilityFilter();
  const visible = candidates.filter(({ game, edition }) => accessible.has(game.slug) &&
    (mode === "all" || isEditionCompatible(edition, game, device.type))).slice(0, 4);
  if (!visible.length) return null;
  return <section><div className="new-section-heading"><h2>Newest Editions</h2><Link href="/new/discover">Explore games →</Link></div>
    <div className="new-card-grid">{visible.map(({ game, edition }) => <Link key={edition.id} className="new-panel overflow-hidden" href={`/new/games/${game.slug}/editions/${edition.slug}`}>
      <GameArt game={{ ...game, title: edition.name, coverImage: edition.branding.heroImage || edition.branding.logo || game.coverImage }} showTitle={false} className="aspect-video" />
      <div className="new-pad"><p className="new-eyebrow">{game.title}</p><h3>{edition.name}</h3><p className="line-clamp-2">{edition.shortDescription}</p></div>
    </Link>)}</div>
  </section>;
}
