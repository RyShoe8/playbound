/**
 * FREE vs ALL discovery rules for the launcher.
 *
 * Pure on purpose: the renderer state lives in shared.js. Tests and filters
 * call these with an explicit mode so there is one definition of "visible".
 *
 * Missing accessTier / fromPriceCents counts as FREE, so a launcher built
 * before the catalog API ships those fields does not hide the catalog.
 */

export const DEFAULT_DISCOVERY_MODE = "ALL";

export const PRICE_FILTERS = ["any", "free", "under5", "under10", "under15"];

const PRICE_CAPS = {
  under5: 500,
  under10: 1000,
  under15: 1500,
};

export function parseDiscoveryMode(raw) {
  return raw === "FREE" ? "FREE" : raw === "ALL" ? "ALL" : DEFAULT_DISCOVERY_MODE;
}

export function parsePriceFilter(raw) {
  if (raw === "free" || raw === "under5" || raw === "under10" || raw === "under15") return raw;
  return "any";
}

export function accessTierOf(item) {
  return item?.accessTier === "VALUE" ? "VALUE" : "FREE";
}

export function tierVisibleIn(tier, mode) {
  return mode === "ALL" || tier === "FREE";
}

/**
 * Filter anything that reduces to a game slug.
 *
 * `tierBySlug` is optional. When the item itself carries `accessTier`, that
 * wins. Unknown slugs stay visible — same as the site: no slug means not paid.
 */
export function filterByDiscovery(list, mode, slugOf = (item) => item?.slug, tierBySlug) {
  if (mode !== "FREE") return list;
  return list.filter((item) => {
    if (item && (item.accessTier === "FREE" || item.accessTier === "VALUE")) {
      return item.accessTier === "FREE";
    }
    const slug = slugOf(item);
    if (!slug) return true;
    const mapped = tierBySlug?.get?.(slug);
    if (mapped === "VALUE") return false;
    return true;
  });
}

export function priceVisibleIn(fromPriceCents, filter) {
  if (filter === "any") return true;
  const price = fromPriceCents ?? 0;
  if (filter === "free") return price === 0;
  const cap = PRICE_CAPS[filter];
  if (typeof cap !== "number") return true;
  return price <= cap;
}

export function filterGamesByPrice(list, filter) {
  const parsed = parsePriceFilter(filter);
  if (parsed === "any") return list;
  return list.filter((g) => priceVisibleIn(g?.fromPriceCents, parsed));
}

export function accessPriceLabel(fromPriceCents) {
  if (fromPriceCents == null || fromPriceCents === 0) return "FREE";
  return `$${(fromPriceCents / 100).toFixed(2)}`;
}

export function formatCents(cents) {
  if (typeof cents !== "number") return "—";
  if (cents === 0) return "Free";
  return `$${(cents / 100).toFixed(2)}`;
}

export function requiresGamePriceLine(gameTitle, fromPriceCents) {
  if (fromPriceCents == null || fromPriceCents === 0) return null;
  return `Requires ${gameTitle} — $${(fromPriceCents / 100).toFixed(2)}`;
}

export function tierBySlugFromCatalog(catalog) {
  const map = new Map();
  for (const game of Array.isArray(catalog) ? catalog : []) {
    if (game?.slug) map.set(game.slug, accessTierOf(game));
  }
  return map;
}

export function fromPriceBySlugFromCatalog(catalog) {
  const map = new Map();
  for (const game of Array.isArray(catalog) ? catalog : []) {
    if (game?.slug) map.set(game.slug, game.fromPriceCents ?? null);
  }
  return map;
}

/**
 * Homepage catalog snapshot, limited to the current Discover mode.
 *
 * The 15-minute live payload is mode-blind. FREE vs ALL is applied here,
 * the same way the rest of the home grids are.
 */
export function scopeCatalogLiveStats(live, mode, tierBySlug) {
  if (!live || mode !== "FREE") return live;
  const byGame = filterByDiscovery(live.byGame || [], mode, (g) => g.slug, tierBySlug);
  const editionCountBySlug = live.editionCountBySlug || {};
  const modCountBySlug = live.modCountBySlug || {};
  let editionCount = 0;
  let modCount = 0;
  let playingNow = 0;
  for (const game of byGame) {
    editionCount += Math.max(1, Number(editionCountBySlug[game.slug]) || 0);
    modCount += Number(modCountBySlug[game.slug]) || 0;
    playingNow += Number(game.playingNow) || 0;
  }
  return {
    ...live,
    byGame,
    gameCount: byGame.length,
    editionCount,
    modCount,
    playingNow,
    mostPopular: byGame.slice(0, 3),
  };
}
