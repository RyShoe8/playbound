import { NextResponse } from "next/server";
import { CONTIGUOUS_US_STATE_PATHS } from "@/components/hosting/usStates";
import { regionMapPoint } from "@/components/hosting/HostingRegionMap";
import { mostPopularGames } from "@/lib/catalog";
import { hostingGameArt } from "@/lib/dedicatedHosting/publicGameArt";
import { loadHostingInventory } from "@/lib/dedicatedHosting/inventory";
import { rankedHostingGames } from "@/lib/dedicatedHosting/publicLineup";
import { loadPublicTier, publicGames } from "@/lib/dedicatedHosting/publicTier";

/**
 * Everything the website's /hosting page shows, as JSON, so the launcher's My
 * servers page can draw the same promo for a player without an active plan.
 * Public and read-only: it is the same data the public page renders.
 */
const HERO_GAMES: Record<string, string> = {
  openra: "OpenRA",
  mindustry: "Mindustry",
  supertuxkart: "SuperTuxKart",
  xonotic: "Xonotic",
  openttd: "OpenTTD",
  hedgewars: "Hedgewars",
  "warzone-2100": "Warzone 2100",
  "0ad": "0 A.D.",
};
const FEATURES = [
  "Switch games whenever you want",
  "Split slots across several servers",
  "Back up and restore supported worlds",
  "Manage maps and players from PlayBound",
  "List public servers on PlayBound.club",
];

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const [basic, inventory, popular] = await Promise.all([
    loadPublicTier("basic"),
    loadHostingInventory(),
    mostPopularGames(1000).catch(() => []),
  ]);
  const games = rankedHostingGames(publicGames(basic.tier), inventory, popular.map((game) => game.slug));
  const art = await hostingGameArt(games.slice(0, 10).map((game) => game.gameSlug));
  const packages = [...basic.tier.packages].filter((pkg) => pkg.enabled !== false).sort((a, b) => a.order - b.order);
  const salesRegion = basic.tier.regions.find((region) => region.salesEnabled);
  const STATIC = new Set(["openra", "xonotic", "supertuxkart", "mindustry", "openttd", "warzone-2100", "hedgewars"]);
  const absolute = (value?: string | null) => (value ? (value.startsWith("http") ? value : `${origin}${value}`) : null);
  return NextResponse.json(
    {
      hero: Object.entries(HERO_GAMES).map(([slug, name]) => ({ slug, name, cover: `${origin}/games/${slug}/cover.webp` })),
      features: FEATURES,
      available: basic.live && basic.tier.salesEnabled,
      region: salesRegion?.label || "US Central",
      regionKey: salesRegion?.key || "",
      packages: packages.map((pkg) => ({ slots: pkg.slots, priceCents: pkg.priceCents })),
      gameCount: games.length,
      editionCount: games.reduce((sum, game) => sum + game.editions.length, 0),
      games: games.slice(0, 10).map((game) => ({
        slug: game.gameSlug,
        title: game.title,
        editions: game.editions,
        cover: absolute(art[game.gameSlug]?.coverImage || (STATIC.has(game.gameSlug) ? `/games/${game.gameSlug}/cover.webp` : null)),
      })),
      regions: basic.tier.regions.filter((region) => region.salesEnabled).map((region) => ({
        key: region.key,
        label: region.label,
        point: region.latitude != null && region.longitude != null ? regionMapPoint(region.latitude, region.longitude) : null,
      })),
      statePaths: CONTIGUOUS_US_STATE_PATHS,
    },
    { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600", "Access-Control-Allow-Origin": "*" } }
  );
}
