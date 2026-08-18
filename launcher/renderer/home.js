import { createFreeOfferCard, createGameCard } from "./cards.js";
import {
  api,
  buildCatalogStatsCardHtml,
  buildCatalogStatsSkeletonHtml,
  CACHE_TTL,
  cacheInvoke,
  cachePeek,
  cachePut,
  filterCatalogGames,
  markViewReady,
  playingNowBySlug,
  state,
  syncDiscoveryControls,
  views,
} from "./shared.js";

const HOME_SHELL_HTML = `
    <div class="home-discover-card">
      <p class="home-discover-label">Explore PlayBound</p>
      <div class="home-discover-pills" role="radiogroup" aria-label="Discovery mode">
        <button type="button" role="radio" data-discovery-mode="FREE" aria-checked="false">FREE</button>
        <button type="button" role="radio" data-discovery-mode="ALL" aria-checked="true" class="is-selected">ALL</button>
      </div>
      <p class="home-discover-caption" id="home-discovery-caption">Show me every PlayBound-approved game up to $15.</p>
    </div>

    <div class="home-top-row">
      <div class="home-top-left">
        <div id="home-recent-section" class="hidden">
          <div class="section-header" style="margin-top: 0">Recently Played</div>
          <div id="home-recent-grid" class="game-grid"></div>
        </div>
      </div>
      <div id="home-stats-slot" class="home-top-stats">${buildCatalogStatsSkeletonHtml()}</div>
    </div>

    <div id="home-free-offers-section" class="hidden">
      <div class="section-header">
        <span>🎁 Free Games This Week</span>
        <button class="btn-secondary btn-sm" id="home-browse-free-games">See All on Web</button>
      </div>
      <div id="home-free-offers-grid" class="game-grid"></div>
    </div>

    <div class="section-header">
      <span>Newest Games</span>
      <button class="btn-secondary btn-sm" id="home-browse-games">Browse Games</button>
    </div>
    <div id="home-newest-grid" class="game-grid"></div>

    <div class="section-header">Most Popular Games</div>
    <div id="home-popular-grid" class="game-grid">
      <p class="view-sub">Loading popularity data…</p>
    </div>
`;

function ensureHomeShell() {
  const container = views.home;
  if (!container) return null;
  if (!document.getElementById("home-newest-grid")) {
    container.innerHTML = HOME_SHELL_HTML;
    container.dataset.homeWired = "";
  }
  if (!container.dataset.homeWired) {
    container.dataset.homeWired = "1";
    document.getElementById("home-browse-games")?.addEventListener("click", () => api.navigateTo?.("games"));
    document.getElementById("home-browse-free-games")?.addEventListener("click", () => {
      window.playbound.openExternal("https://playbound.club/free-games");
    });
  }
  return container;
}

/**
 * One player-count snapshot shared by every card on the page, refreshed on the
 * same 15-minute cadence the site's catalog snapshot uses.
 */
let homePlayingNow = new Map();

function makeCard(game) {
  return createGameCard(game, homePlayingNow.get(game.slug));
}

export function paintHomeGrids(catalog = state.catalogCache, recent = state.recentCache) {
  syncDiscoveryControls();
  const recentSec = document.getElementById("home-recent-section");
  const recentGrid = document.getElementById("home-recent-grid");
  if (recentSec && recentGrid) {
    if (recent && recent.length > 0) {
      recentSec.classList.remove("hidden");
      recentGrid.replaceChildren(...filterCatalogGames(recent).map(makeCard));
    } else {
      recentSec.classList.add("hidden");
      recentGrid.replaceChildren();
    }
  }

  const newestGrid = document.getElementById("home-newest-grid");
  if (newestGrid) {
    const newest = [...filterCatalogGames(catalog)].sort((a, b) => {
      const ta = Date.parse(a.createdAt || "") || 0;
      const tb = Date.parse(b.createdAt || "") || 0;
      return tb - ta;
    });
    newestGrid.replaceChildren(...newest.slice(0, 8).map(makeCard));
  }

  if (state._liveStatsLastGood) paintCatalogStats(state._liveStatsLastGood, catalog);
}

async function fetchExtraStats() {
  try {
    const [pRes, lfgRes] = await Promise.allSettled([
      fetch("https://playbound.club/api/parties/open-count", { signal: AbortSignal.timeout(5000) }).then((r) =>
        r.ok ? r.json() : null
      ),
      fetch("https://playbound.club/api/presence/lfg/count", { signal: AbortSignal.timeout(5000) }).then((r) =>
        r.ok ? r.json() : null
      ),
    ]);
    const openParties =
      pRes.status === "fulfilled" && typeof pRes.value?.count === "number"
        ? pRes.value.count
        : state.liveExtraStats.openParties;
    const lookingToParty =
      lfgRes.status === "fulfilled" && typeof lfgRes.value?.count === "number"
        ? lfgRes.value.count
        : state.liveExtraStats.lookingToParty;
    state.liveExtraStats = { openParties, lookingToParty };
    if (state._liveStatsLastGood && document.getElementById("home-stats-slot")?.isConnected) {
      paintCatalogStats(state._liveStatsLastGood, state.catalogCache);
    }
  } catch {
    /* keep previous stats */
  }
}

function paintCatalogStats(live, catalog) {
  const statsSlot = document.getElementById("home-stats-slot");
  const popularGrid = document.getElementById("home-popular-grid");
  if (statsSlot) {
    statsSlot.innerHTML = buildCatalogStatsCardHtml(live, state.liveExtraStats);
    statsSlot.querySelectorAll("[data-popular-slug]").forEach((btn) => {
      btn.addEventListener("click", () => api.openGameDetail?.(btn.dataset.popularSlug, "home"));
    });
    statsSlot.querySelectorAll("[data-stats-nav]").forEach((btn) => {
      btn.addEventListener("click", () => api.navigateTo?.(btn.dataset.statsNav));
    });
  }

  if (!popularGrid) return;
  const byGame = Array.isArray(live?.byGame) ? live.byGame : [];
  const bySlug = new Map(catalog.map((g) => [g.slug, g]));
  const popular = filterCatalogGames(byGame.map((row) => bySlug.get(row.slug)).filter(Boolean)).slice(0, 8);
  if (popular.length > 0) {
    popularGrid.replaceChildren(...popular.map(makeCard));
  } else {
    popularGrid.innerHTML = `<p class="view-sub">No popularity data yet.</p>`;
  }
}

function applyLiveStats(raw, catalog = state.catalogCache) {
  if (!raw || raw.ok === false || typeof raw.gameCount !== "number") return;
  state._liveStatsLastGood = raw;
  cachePut("catalogLiveStats", raw);
  // The same payload the stats card is built from already carries the per-slug
  // counts, so the cards get their numbers without a second request.
  homePlayingNow = playingNowBySlug(raw);
  if (!document.getElementById("home-stats-slot")?.isConnected) return;
  paintHomeGrids(catalog);
  paintCatalogStats(raw, catalog);
}

window.playbound?.onLiveStatsUpdated?.((raw) => applyLiveStats(raw));

/** @param {boolean} repaintGrids repaint cards already on screen with the counts */
function loadLiveStats(catalog, repaintGrids = false) {
  const statsSlot = document.getElementById("home-stats-slot");
  const peek = cachePeek("catalogLiveStats", CACHE_TTL.catalogLiveStats);
  const lastGood = peek?.data && typeof peek.data.gameCount === "number" ? peek.data : state._liveStatsLastGood;
  if (lastGood) {
    homePlayingNow = playingNowBySlug(lastGood);
    // The grids were painted before this ran, so they need the counts folding in.
    if (repaintGrids) paintHomeGrids(catalog);
    paintCatalogStats(lastGood, catalog);
  } else if (statsSlot && !statsSlot.querySelector(".catalog-stats-card")) {
    statsSlot.innerHTML = buildCatalogStatsSkeletonHtml();
  }

  if (peek?.fresh) return;

  void (async () => {
    const raw = await (window.playbound.getLiveStats?.() ?? Promise.resolve(null));
    applyLiveStats(raw, catalog);
  })();
}

function loadFreeOffers() {
  void (async () => {
    try {
      const res = await cacheInvoke("freeOffers", CACHE_TTL.freeOffers, () =>
        window.playbound.getFreeOffers?.()
      );
      const offers = Array.isArray(res?.offers) ? res.offers : [];
      const freeSec = document.getElementById("home-free-offers-section");
      const freeGrid = document.getElementById("home-free-offers-grid");
      if (freeSec && freeGrid && offers.length > 0) {
        freeSec.classList.remove("hidden");
        freeGrid.replaceChildren(...offers.map(createFreeOfferCard));
      }
    } catch {
      /* ignore */
    }
  })();
}

export async function renderHomeView() {
  ensureHomeShell();
  const catalog = state.catalogCache;
  const recent = state.recentCache;
  paintHomeGrids(catalog, recent);
  loadLiveStats(catalog, true);
  fetchExtraStats();
  loadFreeOffers();
  markViewReady(views.home);
}

api.renderHomeView = renderHomeView;
api.paintHomeGrids = paintHomeGrids;
