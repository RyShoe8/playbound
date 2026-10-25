import { NextResponse } from "next/server";
import { listGamesNewestFirst } from "@/lib/catalog";
import { weeklyPopular } from "@/lib/weeklyPopular";
import { listMods } from "@/lib/mods";
import { listEditionsForGames } from "@/lib/editions";

// Public editorial selections. Account, installs and native actions stay local.
export async function GET() {
  const [games, popular, mods] = await Promise.all([
    listGamesNewestFirst(), weeklyPopular(), listMods({ view: "card" }),
  ]);
  const editionsByGame = await listEditionsForGames(games);
  const editions = games.flatMap(game => (editionsByGame.get(game.slug) || [])
    .filter(edition => edition.createdAt && !edition.id.startsWith("seed:"))
    .map(edition => ({ gameSlug: game.slug, edition })))
    .sort((a, b) => Date.parse(b.edition.createdAt!) - Date.parse(a.edition.createdAt!)).slice(0, 24);
  // Keep publication order: latest released on PlayBound, not original release year.
  const released = games.filter(game => game.releaseYear <= new Date().getFullYear());
  return NextResponse.json({
    released: released.map(game => game.slug),
    popular: [...new Set(popular.map(({game}) => game.slug))],
    popularEditions: popular.map(({game,edition}) => ({gameSlug: game.slug, edition: edition ? {slug:edition.slug,name:edition.name,coverImage:edition.branding.heroImage || edition.branding.logo || game.coverImage} : null})),
    editions,
    mods: [...mods].sort((a, b) => (Date.parse(b.createdAt || "") || 0) - (Date.parse(a.createdAt || "") || 0)).slice(0, 24),
  }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600", "Access-Control-Allow-Origin": "*" } });
}
