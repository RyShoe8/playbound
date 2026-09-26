/**
 * The PlayBound Dedicated plan as the public pages show it: /hosting, the
 * per-game /hosting/[game] pages and the sitemap.
 *
 * A cache boundary (Cache Components will not read the database during a
 * prerender otherwise), tagged so an admin save shows at once. Falls back to
 * the launch defaults when there is no database — local dev and the build —
 * rather than failing the page. Reading never writes (see tier.ts).
 */
import { cacheLife, cacheTag } from "next/cache";
import { getHostableGame } from "@/lib/gameHost/catalog";
import { BASIC_DEFAULTS, getTier, type HostingTier } from "./tier";

export const HOSTING_TIER_TAG = "hosting-tier";

export async function loadPublicTier(): Promise<{ tier: HostingTier; live: boolean }> {
  "use cache";
  cacheLife("hours");
  cacheTag(HOSTING_TIER_TAG);
  try {
    return { tier: await getTier(), live: true };
  } catch {
    const fallback = {
      ...BASIC_DEFAULTS,
      startsDisabled: false,
      minAllocation: 4,
      allocationIncrement: 4,
      maxSlotsSold: 32,
      maxSavedServers: 10,
      packages: BASIC_DEFAULTS.packages.map((p) => ({ ...p, currency: "usd", enabled: true, stripePriceId: null })),
      games: BASIC_DEFAULTS.games.map((g) => ({
        ...g,
        enabled: true,
        newServerCreationEnabled: true,
        existingServerStartEnabled: true,
        minSlots: 4,
        slotIncrement: 4,
        allowedMods: [],
      })),
    } as unknown as HostingTier;
    return { tier: fallback, live: false };
  }
}

export type PublicHostingGame = { gameSlug: string; title: string; editions: string[]; maxSlots: number };

/** Games on sale for new servers, one entry per game (editions folded in). */
export function publicGames(tier: HostingTier): PublicHostingGame[] {
  const byGame = new Map<string, PublicHostingGame>();
  for (const g of tier.games || []) {
    if (g.enabled === false || g.newServerCreationEnabled === false) continue;
    const [gameSlug, edition] = g.profileKey.split(":");
    const current = byGame.get(gameSlug) || {
      gameSlug,
      title: getHostableGame(gameSlug)?.title || gameSlug,
      editions: [],
      maxSlots: 0,
    };
    if (edition && edition !== "base") current.editions.push(edition);
    current.maxSlots = Math.max(current.maxSlots, Math.min(g.maxSlots || 0, tier.maxSlotsSold || 32));
    byGame.set(gameSlug, current);
  }
  return [...byGame.values()].sort((a, b) => a.title.localeCompare(b.title));
}
