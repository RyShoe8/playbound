import { createFreeOfferCard, createGameCard } from "./cards.js";
import {
  api,
  buildCatalogStatsCardHtml,
  buildCatalogStatsSkeletonHtml,
  CACHE_TTL,
  cacheInvoke,
  cachePeek,
  cachePut,
  filterByCompatibility,
  markViewReady,
  state,
  views,
} from "./shared.js";

const HOME_SHELL_HTML = `
    <div class="home-header-row">
      <div class="home-header-copy">
        <h1 class="view-title">Welcome back</h1>
        <p class="view-sub">Play your favorite titles or browse free games on PlayBound.</p>
      </div>
      <div id="home-stats-slot">${buildCatalogStatsSkeletonHtml()}</div>
    </div>

    <div id="home-recent-section" class="hidden">
      <div class="section-header">Recently Played</div>
      <div id="home-recent-grid" class="game-grid"></div>
    </div>

    <div id="home-free-offers-section" class="hidden">
      <div class="section-header">
        <span>🎁 Free Games This Week</span>
        <button class="btn-secondary btn-sm" id="home-browse-free-games">See All on Web</button>
      </div>
      <div id="home-free-offers-grid" class="free-offers-grid"></div>
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

export function paintHomeGrids(catalog = state.catalogCache, recent = state.recentCache) {
  const recentSec = document.getElementById("home-recent-section");
  const recentGrid = document.getElementById("home-recent-grid");
  if (recentSec && recentGrid) {
    if (recent && recent.length > 0) {
      recentSec.classList.remove("hidden");
      recentGrid.replaceChildren(...filterByCompatibility(recent).map(createGameCard));
    } else {
      recentSec.classList.add("hidden");
      recentGrid.replaceChildren();
    }
  }

  const newestGrid = document.getElementById("home-newest-grid");
  if (newestGrid) {
    const newest = [...filterByCompatibility(catalog)].sort((a, b) => {
      const ta = Date.parse(a.createdAt || "") || 0;
      const tb = Date.parse(b.createdAt || "") || 0;
      return tb - ta;
    });
    newestGrid.replaceChildren(...newest.slice(0, 8).map(createGameCard));
  }
}

function paintCatalogStats(live, catalog) {
  const statsSlot = document.getElementById("home-stats-slot");
  const popularGrid = document.getElementById("home-popular-grid");
  if (statsSlot) {
    statsSlot.innerHTML = buildCatalogStatsCardHtml(live);
    statsSlot.querySelectorAll("[data-popular-slug]").forEach((btn) => {
      btn.addEventListener("click", () => api.openGameDetail?.(btn.dataset.popularSlug, "home"));
    });
  }

  if (!popularGrid) return;
  const byGame = Array.isArray(live?.byGame) ? live.byGame : [];
  const bySlug = new Map(catalog.map((g) => [g.slug, g]));
  const popular = filterByCompatibility(byGame.map((row) => bySlug.get(row.slug)).filter(Boolean)).slice(0, 8);
  if (popular.length > 0) {
    popularGrid.replaceChildren(...popular.map(createGameCard));
  } else {
    popularGrid.innerHTML = `<p class="view-sub">No popularity data yet.</p>`;
  }
}

function applyLiveStats(raw, catalog = state.catalogCache) {
  if (!raw || raw.ok === false || typeof raw.gameCount !== "number") return;
  state._liveStatsLastGood = raw;
  cachePut("catalogLiveStats", raw);
  if (!document.getElementById("home-stats-slot")?.isConnected) return;
  paintCatalogStats(raw, catalog);
}

window.playbound?.onLiveStatsUpdated?.((raw) => applyLiveStats(raw));

function loadLiveStats(catalog) {
  const statsSlot = document.getElementById("home-stats-slot");
  const peek = cachePeek("catalogLiveStats", CACHE_TTL.catalogLiveStats);
  const lastGood = peek?.data && typeof peek.data.gameCount === "number" ? peek.data : state._liveStatsLastGood;
  if (lastGood) {
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
  loadLiveStats(catalog);
  loadFreeOffers();
  markViewReady(views.home);
}

api.renderHomeView = renderHomeView;
api.paintHomeGrids = paintHomeGrids;
