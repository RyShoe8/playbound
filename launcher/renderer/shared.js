/** Shared launcher UI state and helpers. Live bindings via the `state` object. */

import {
  accessPriceLabel,
  filterByDiscovery as filterByDiscoveryMode,
  filterGamesByPrice,
  formatCents,
  fromPriceBySlugFromCatalog,
  parseDiscoveryMode,
  parsePriceFilter,
  requiresGamePriceLine,
  scopeCatalogLiveStats,
  tierBySlugFromCatalog,
} from "./discovery.js";

export {
  accessPriceLabel,
  filterGamesByPrice,
  formatCents,
  parseDiscoveryMode,
  parsePriceFilter,
  requiresGamePriceLine,
};

export const DISCORD_INVITE = "https://discord.gg/yc7WdxATar";
export const PODIUM_MEDALS = ["🥇", "🥈", "🥉"];
export const OPENCIV3_DATA_HINT =
  "OpenCiv3 runs standalone with placeholder art. Optional: install Civilization III Complete (Steam/GOG) for original graphics — it auto-detects common installs.";

export const GAMES_FAMILY_VIEWS = new Set([
  "games",
  "mods",
  "editions",
  "gameDetail",
  "modDetail",
  "editionDetail",
]);

export const state = {
  currentView: "home",
  accountState: { connected: false },
  deepLinkCtx: null,
  currentDetailSlug: null,
  /** Editions on the game in context — drives whether the Editions nav shows. */
  currentDetailEditionCount: 0,
  currentModDetailSlug: null,
  currentEventDetailId: null,
  detailReturnView: "games",
  modDetailActiveTab: "overview",
  detailActiveTab: "overview",
  updateStatus: { phase: "idle" },
  gamesFilters: {
    query: "",
    genre: "",
    /* Selected tag names. Empty means no tag filter. */
    tags: [],
    /* The tag row starts closed — tags are a long tail beside a dozen genres. */
    tagsOpen: false,
    /* Selected feature names, filtered the same way and kept separate from tags. */
    features: [],
    featuresOpen: false,
    multiplayerOnly: false,
    /** Only games with someone in them right now, per the live snapshot. */
    hasPlayersOnly: false,
    sort: "name",
    price: "any",
  },
  searchQuery: "",
  searchFilters: {
    q: "",
    genres: [],
    tags: [],
    platforms: [],
    features: [],
    sort: "title",
    sortDir: "asc",
    price: "any",
  },
  liveExtraStats: {
    openParties: 0,
    lookingToParty: 0,
  },
  compatibilityFilter: "compatible",
  discoveryMode: "ALL",
  currentEditionDetail: null,
  catalogCache: [],
  recentCache: [],
  _liveStatsPromise: null,
  _liveStatsTime: 0,
  _liveStatsLastGood: null,
  serversState: {
    selectedSlug: null,
    selectedModSlug: "",
    search: "",
    pingById: {},
    installedOnly: false,
    withPlayersOnly: (() => {
      try {
        const v = localStorage.getItem("playbound_servers_with_players");
        if (v === null) return true;
        return v === "true";
      } catch {
        return true;
      }
    })(),
    sort: "players",
    sortDir: "desc",
  },
  SERVER_SORT_DEFAULT_DIR: {
    name: "asc",
    players: "desc",
    map: "asc",
    location: "asc",
    ping: "desc",
  },
  _modsCatalog: [],
  _supportedServerGames: [],
  _installedGameSlugs: new Set(),
  _installedModsList: [],
  _activeGameSession: null,
  _addFriendsMode: "username",
  _addFriendsSent: {},
  statusAction: null,
};

/** Cross-module function registry — assigned from boot / view modules at runtime. */
export const api = {};

export const views = {};

export const CACHE_TTL = {
  mods: 60_000,
  gear: 60_000,
  events: 30_000,
  eventDetail: 60_000,
  friends: 15_000,
  installed: 8_000,
  gameDetail: 90_000,
  modDetail: 90_000,
  editions: 60_000,
  freeOffers: 120_000,
  liveStatsGame: 30_000,
  catalogLiveStats: 15 * 60_000,
};

/** @type {Map<string, { at: number, data?: any, inflight?: Promise<any> | null }>} */
const ipcCache = new Map();

/**
 * Bumped by every invalidation.
 *
 * Deleting a key does not stop a request that is already in the air, and that
 * request still writes its result when it lands. After an install that meant
 * the pre-install payload — the one that says the game is not installed — could
 * drop back into the cache *after* the invalidation, and the next read would
 * treat it as fresh. The visible symptom was the hero button staying on
 * "Install Game" after the status area already said the install had finished.
 *
 * A request remembers the epoch it started in and declines to cache its result
 * if the world has moved on since.
 */
let cacheEpoch = 0;

export function cachePeek(key, ttlMs) {
  const hit = ipcCache.get(key);
  if (!hit || hit.data === undefined) return null;
  return { data: hit.data, fresh: Date.now() - hit.at <= ttlMs };
}

export function cachePut(key, data) {
  ipcCache.set(key, { at: Date.now(), data, inflight: null });
  return data;
}

export function cacheInvalidate(prefix = "") {
  cacheEpoch++;
  if (!prefix) {
    ipcCache.clear();
    return;
  }
  for (const key of [...ipcCache.keys()]) {
    if (key === prefix || key.startsWith(`${prefix}:`)) ipcCache.delete(key);
  }
}

export async function cacheInvoke(key, ttlMs, fn) {
  const peek = cachePeek(key, ttlMs);
  if (peek?.fresh) return peek.data;
  const hit = ipcCache.get(key);
  if (hit?.inflight) {
    return hit.data !== undefined ? hit.data : hit.inflight;
  }
  const startedAt = cacheEpoch;
  const inflight = Promise.resolve()
    .then(fn)
    .then((data) => {
      // Invalidated while this was in the air — hand the caller the answer it
      // asked for, but do not let it become the cached truth.
      if (cacheEpoch !== startedAt) return data;
      return cachePut(key, data);
    })
    .finally(() => {
      const cur = ipcCache.get(key);
      if (cur) cur.inflight = null;
    });
  ipcCache.set(key, { at: hit?.at || 0, data: hit?.data, inflight });
  if (hit?.data !== undefined) return hit.data;
  return inflight;
}

export function prefetchGameDetail(slug) {
  if (!slug || !window.playbound?.getGameDetail) return;
  void cacheInvoke(`game:${slug}`, CACHE_TTL.gameDetail, () => window.playbound.getGameDetail(slug));
}

export function prefetchModDetail(slug) {
  if (!slug || !window.playbound?.getModDetail) return;
  void cacheInvoke(`mod:${slug}`, CACHE_TTL.modDetail, () => window.playbound.getModDetail(slug));
}

export function prefetchEventDetail(id) {
  if (!id || !window.playbound?.getEventDetail) return;
  void cacheInvoke(`event:${id}`, CACHE_TTL.eventDetail, () => window.playbound.getEventDetail(id));
}

export function markViewReady(el, token = "1") {
  if (el) el.dataset.ready = String(token);
}

export function isViewReady(el, token = "1") {
  return Boolean(el) && el.dataset.ready === String(token);
}

export function markViewDirty(...els) {
  for (const el of els) {
    if (el) el.dataset.ready = "";
  }
}

export function bindViews() {
  views.home = document.getElementById("view-home");
  views.games = document.getElementById("view-games");
  views.search = document.getElementById("view-search");
  views.editions = document.getElementById("view-editions");
  views.mods = document.getElementById("view-mods");
  views.servers = document.getElementById("view-servers");
  views.events = document.getElementById("view-events");
  views.friends = document.getElementById("view-friends");
  views.gear = document.getElementById("view-gear");
  views.library = document.getElementById("view-library");
  views.couch = document.getElementById("view-couch");
  views.settings = document.getElementById("view-settings");
  views.gameDetail = document.getElementById("view-game-detail");
  views.modDetail = document.getElementById("view-mod-detail");
  views.editionDetail = document.getElementById("view-edition-detail");
  views.deepLink = document.getElementById("view-deep-link");
  views.eventDetail = document.getElementById("view-event-detail");
  views.gearDetail = document.getElementById("view-gear-detail");
}

export function setCatalogCache(list) {
  state.catalogCache = Array.isArray(list) ? list : [];
}

export function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function gamePlayHintHtml(slug) {
  if (slug === "openciv3") {
    return `<p class="view-sub" style="margin:8px 0 0;max-width:36rem;flex-basis:100%">${escapeHtml(OPENCIV3_DATA_HINT)}</p>`;
  }
  return "";
}

export function normalizePlatform(value) {
  const t = String(value || "")
    .trim()
    .toLowerCase();
  if (t === "browser" || t === "web") return "web";
  if (t === "mac os" || t === "macos" || t === "osx" || t === "mac") return "macos";
  if (t === "iphone" || t === "ipad") return "ios";
  return t;
}

export function selectExecutableLabel() {
  try {
    return window.playbound.platform.selectExecutableLabel?.() || "Select .exe";
  } catch {
    return "Select .exe";
  }
}

export function executableNoun() {
  try {
    return window.playbound.platform.executableLabel?.() || ".exe";
  } catch {
    return ".exe";
  }
}

export function isMacOS() {
  try {
    return window.playbound.platform.getOS() === "macos";
  } catch {
    return false;
  }
}

export function desktopPlatformAllowedSet() {
  const currentOS = window.playbound.platform.getOS();
  return currentOS === "macos"
    ? new Set(["macos", "web", "browser"])
    : new Set(["windows", "macos", "linux", "web"]);
}

export function isGameDesktopCompatible(game) {
  if (game?.browserPlayable) return true;

  const currentOS = window.playbound.platform.getOS();
  if (currentOS !== "macos" && game?.steamDeck) return true;

  const platforms = (game?.platforms || []).map(normalizePlatform).filter(Boolean);
  if (platforms.length === 0) return true;

  const allowed = desktopPlatformAllowedSet();
  return platforms.some((p) => allowed.has(p));
}

export function isEditionDesktopCompatible(edition, game) {
  const parent = game || {
    platforms: edition?.platforms,
    browserPlayable: edition?.browserPlayable,
    steamDeck: edition?.steamDeck,
  };
  if (parent && !isGameDesktopCompatible(parent)) return false;
  const platforms = (edition?.platforms || []).map(normalizePlatform).filter(Boolean);
  if (platforms.length === 0) return true;
  const allowed = desktopPlatformAllowedSet();
  return platforms.some((p) => allowed.has(p));
}

export function sortEditionsByCompatibility(editions, game) {
  return editions
    .map((edition, index) => ({ edition, index }))
    .sort((a, b) => {
      const ac = isEditionDesktopCompatible(a.edition, game) ? 0 : 1;
      const bc = isEditionDesktopCompatible(b.edition, game) ? 0 : 1;
      if (ac !== bc) return ac - bc;
      return a.index - b.index;
    })
    .map((row) => row.edition);
}

export function isModDesktopCompatible(mod) {
  const platforms = (mod?.platforms || []).map(normalizePlatform).filter(Boolean);
  if (platforms.length > 0) {
    const allowed = desktopPlatformAllowedSet();
    if (!platforms.some((p) => allowed.has(p))) return false;
  }
  const catalog = state.catalogCache;
  const games = Array.isArray(catalog) ? catalog : catalog?.games || [];
  const game = games.find((g) => g.slug === mod?.baseGameSlug);
  if (game) return isGameDesktopCompatible(game);
  return true;
}

export function filterByCompatibility(list) {
  if (state.compatibilityFilter !== "compatible") return list;
  return list.filter(isGameDesktopCompatible);
}

export function catalogTierBySlug() {
  return tierBySlugFromCatalog(state.catalogCache);
}

export function catalogPriceBySlug() {
  return fromPriceBySlugFromCatalog(state.catalogCache);
}

/** Games (and anything with accessTier / slug) under the current Discover mode. */
export function filterByDiscovery(list, slugOf = (item) => item?.slug) {
  return filterByDiscoveryMode(list, state.discoveryMode, slugOf, catalogTierBySlug());
}

/** Compatibility, then FREE vs ALL. Library of installed games does not use this. */
export function filterCatalogGames(list) {
  return filterByDiscovery(filterByCompatibility(list));
}

export function filterRelatedByDiscovery(list, slugOf) {
  return filterByDiscovery(list, slugOf);
}

/** slug → playingNow, from the catalog-wide snapshot's byGame rows. */
export function playingNowBySlug(raw) {
  const map = new Map();
  for (const row of Array.isArray(raw?.byGame) ? raw.byGame : []) {
    if (row?.slug && typeof row.playingNow === "number") {
      map.set(row.slug, row.playingNow);
    }
  }
  return map;
}

/**
 * One shared player-count snapshot for a whole view.
 *
 * The site reads these from `getCatalogLiveStats()`, a 15-minute
 * `unstable_cache`, so every viewer sees the same numbers from a single
 * computation. Asking per card would be a request per card for values that are
 * identical anyway, so this fetches the catalog-wide payload once and reuses
 * the existing 15-minute renderer cache — the same key the home view fills.
 */
export async function loadPlayingNowBySlug() {
  try {
    const raw = await cacheInvoke("catalogLiveStats", CACHE_TTL.catalogLiveStats, () =>
      window.playbound.getLiveStats?.() ?? Promise.resolve(null)
    );
    return playingNowBySlug(raw);
  } catch {
    return new Map();
  }
}

export function syncCompatRadios() {
  document.querySelectorAll('input[name="compat-filter"]').forEach((input) => {
    input.checked = input.value === state.compatibilityFilter;
  });
}

export function applyCompatibilitySetting(settings) {
  if (settings?.compatibilityFilter === "all" || settings?.compatibilityFilter === "compatible") {
    state.compatibilityFilter = settings.compatibilityFilter;
  }
  syncCompatRadios();
}

export function syncDiscoveryControls() {
  document.querySelectorAll('input[name="discovery-filter"]').forEach((input) => {
    input.checked = input.value === state.discoveryMode;
  });
  document.querySelectorAll("[data-discovery-mode]").forEach((btn) => {
    const selected = btn.dataset.discoveryMode === state.discoveryMode;
    btn.setAttribute("aria-checked", selected ? "true" : "false");
    btn.classList.toggle("is-selected", selected);
  });
  const caption = document.getElementById("home-discovery-caption");
  if (caption) {
    caption.textContent =
      state.discoveryMode === "FREE"
        ? "Only show me games I can play without spending anything."
        : "Show me every PlayBound-approved game up to $15.";
  }
}

export function applyDiscoverySetting(settings) {
  state.discoveryMode = parseDiscoveryMode(settings?.discoveryMode);
  syncDiscoveryControls();
}

export async function loadCompatibilitySetting() {
  try {
    const s = await window.playbound.getSettings();
    applyCompatibilitySetting(s);
    applyDiscoverySetting(s);
  } catch {
    /* ignore */
  }
}

function repaintFilteredViews({ includeLibrary = false } = {}) {
  if (state.currentView === "home") api.paintHomeGrids?.(state.catalogCache, state.recentCache);
  else if (state.currentView === "games") api.paintGamesGrid?.(state.catalogCache);
  else if (state.currentView === "mods") api.paintModsGrid?.();
  else if (state.currentView === "search") api.paintSearchResults?.(state.catalogCache);
  else if (state.currentView === "events") {
    markViewDirty(views.events);
    api.renderEventsView?.();
  } else if (state.currentView === "servers") {
    markViewDirty(views.servers);
    api.renderServersView?.();
  } else if (state.currentView === "editions") {
    markViewDirty(views.editions);
    api.renderEditionsView?.();
  } else if (state.currentView === "friends") {
    markViewDirty(views.friends);
    api.renderFriendsView?.();
  } else if (includeLibrary && state.currentView === "library") {
    markViewDirty(views.library);
    api.renderLibraryView?.();
  }
}

export async function setCompatibilityFilter(mode) {
  if (mode !== "compatible" && mode !== "all") return;
  state.compatibilityFilter = mode;
  syncCompatRadios();
  try {
    await window.playbound.saveSettings({ compatibilityFilter: mode });
  } catch {
    /* ignore */
  }
  repaintFilteredViews({ includeLibrary: true });
}

export async function setDiscoveryMode(mode) {
  const next = parseDiscoveryMode(mode);
  state.discoveryMode = next;
  syncDiscoveryControls();
  try {
    await window.playbound.saveSettings({ discoveryMode: next });
  } catch {
    /* ignore */
  }
  repaintFilteredViews();
}

export function formatStatNumber(n) {
  const v = Number(n) || 0;
  return v.toLocaleString();
}

export function buildActivityPanelHtml(stats, title = "Activity") {
  if (!stats) {
    return `<aside class="activity-panel"><p class="activity-panel-title">${escapeHtml(title)}</p><p class="view-sub" style="margin:0">Stats unavailable offline.</p></aside>`;
  }
  const rows = [];
  if (typeof stats.playersThisMonth === "number" && stats.playersThisMonth > 0) {
    rows.push(["Players this month", stats.playersThisMonth]);
  }
  if (typeof stats.multiplayerPlayers === "number" && stats.multiplayerPlayers > 0) {
    rows.push(["On multiplayer servers", stats.multiplayerPlayers]);
  }
  if (typeof stats.serverCount === "number" && stats.serverCount > 0) {
    rows.push(["Live servers", stats.serverCount]);
  }
  if (typeof stats.installsAllTime === "number" && stats.installsAllTime > 0) {
    rows.push(["Installs", stats.installsAllTime]);
  }
  if (typeof stats.installsThisMonth === "number" && stats.installsThisMonth > 0) {
    rows.push(["Installs this month", stats.installsThisMonth]);
  }
  const rowsHtml =
    rows.length > 0
      ? `<dl class="activity-rows">${rows
          .map(
            ([label, value]) =>
              `<div><dt>${escapeHtml(label)}</dt><dd>${formatStatNumber(value)}</dd></div>`
          )
          .join("")}</dl>`
      : "";
  return `
    <aside class="activity-panel">
      <p class="activity-panel-title">${escapeHtml(title)}</p>
      <div class="activity-playing">
        <strong>${formatStatNumber(stats.playingNow)}</strong>
        <span>playing now</span>
      </div>
      ${rowsHtml}
      <p class="catalog-stats-footer">Updated every 15 minutes</p>
    </aside>`;
}

export function buildCatalogStatsSkeletonHtml() {
  const cell = (label) =>
    `<div><dt>${label}</dt><dd><span class="stat-skeleton" aria-hidden="true"></span></dd></div>`;
  const popularRow = `<li><span class="stat-skeleton stat-skeleton-line" aria-hidden="true"></span></li>`;
  return `
    <aside class="catalog-stats-card" aria-busy="true">
      <dl class="catalog-stats-grid">
        ${cell("Games")}
        ${cell("Mods")}
        ${cell("Editions")}
        ${cell("Gamers Playing")}
        ${cell("Open Parties")}
        ${cell("Looking to Party")}
      </dl>
      <div class="catalog-stats-popular">
        <h3>Most Popular Right Now</h3>
        <ol>${popularRow.repeat(3)}</ol>
      </div>
      <p class="catalog-stats-footer">Across supported games • Updated every 15 min</p>
    </aside>`;
}

export function buildCatalogStatsCardHtml(live, extra = {}) {
  const usable = live && live.ok !== false && typeof live.gameCount === "number";
  if (!usable) {
    return `<aside class="catalog-stats-card"><p class="view-sub" style="margin:0">Live stats unavailable.</p></aside>`;
  }
  const scoped = scopeCatalogLiveStats(live, state.discoveryMode, catalogTierBySlug());
  const openParties = extra.openParties ?? state.liveExtraStats?.openParties ?? 0;
  const lookingToParty = extra.lookingToParty ?? state.liveExtraStats?.lookingToParty ?? 0;

  const popular = Array.isArray(scoped.mostPopular) ? scoped.mostPopular : [];
  const popularHtml =
    popular.length > 0
      ? `<div class="catalog-stats-popular">
          <h3>Most Popular Right Now</h3>
          <ol>
            ${popular
              .map(
                (g, i) =>
                  `<li><span aria-hidden="true">${PODIUM_MEDALS[i] || `${i + 1}.`}</span> <button type="button" class="linkish" data-popular-slug="${escapeHtml(g.slug)}">${escapeHtml(g.title)}</button></li>`
              )
              .join("")}
          </ol>
        </div>`
      : "";
  return `
    <aside class="catalog-stats-card">
      <dl class="catalog-stats-grid">
        <div><dt>Games</dt><dd>${formatStatNumber(scoped.gameCount)}</dd></div>
        <div><dt>Mods</dt><dd>${formatStatNumber(scoped.modCount)}</dd></div>
        <div><dt>Editions</dt><dd>${formatStatNumber(scoped.editionCount)}</dd></div>
        <div><dt>Gamers Playing</dt><dd>${formatStatNumber(scoped.playingNow)}</dd></div>
        <div><dt><button type="button" class="linkish stat-label-btn" data-stats-nav="events">Open Parties</button></dt><dd>${formatStatNumber(openParties)}</dd></div>
        <div><dt><button type="button" class="linkish stat-label-btn" data-stats-nav="friends">Looking to Party</button></dt><dd>${formatStatNumber(lookingToParty)}</dd></div>
      </dl>
      ${popularHtml}
      <p class="catalog-stats-footer">Across supported games • Updated every 15 min</p>
    </aside>`;
}

export const fmtBytes = (n) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(0)} MB` : `${Math.round(n / 1e3)} KB`;

export function editionsContextSlug() {
  return state.currentDetailSlug || state.currentEditionDetail?.gameSlug || null;
}

export function updateGamesFamilyNav() {
  const editionsBtn = document.getElementById("nav-editions");
  /*
   * Only offer Editions when the game in context actually has a choice to
   * make. It used to appear on every game page, so most of the catalog — the
   * games with a single official build — showed a nav entry that led to a list
   * of one. Matches the game page itself, which shows its Editions section on
   * the same "more than one" rule.
   */
  const showEditions =
    Boolean(editionsContextSlug()) &&
    state.currentDetailEditionCount > 1 &&
    (state.currentView === "gameDetail" ||
      state.currentView === "editionDetail" ||
      state.currentView === "editions");
  if (editionsBtn) {
    editionsBtn.hidden = !showEditions;
    editionsBtn.setAttribute("aria-hidden", showEditions ? "false" : "true");
  }

  const gamesGroup = document.querySelector(".nav-group");
  gamesGroup?.classList.toggle("has-active-child", GAMES_FAMILY_VIEWS.has(state.currentView));
}

export function setStatusAction(action) {
  state.statusAction = action;
  const statusMsg = document.getElementById("statusbar-msg");
  statusMsg?.classList.toggle("statusbar-msg--action", Boolean(action));
  if (statusMsg) {
    if (action) statusMsg.setAttribute("role", "button");
    else statusMsg.removeAttribute("role");
    statusMsg.tabIndex = action ? 0 : -1;
  }
}

export function setStatus(text, isError = false) {
  setStatusAction(null);
  const statusMsg = document.getElementById("statusbar-msg");
  if (!statusMsg) return;
  statusMsg.textContent = text || "";
  statusMsg.style.color = isError ? "var(--danger)" : "var(--text-muted)";
}

export function setProgress(pct) {
  const statusProgress = document.getElementById("statusbar-progress");
  const statusBar = document.getElementById("statusbar-bar");
  if (!statusProgress || !statusBar) return;
  statusBar.classList.remove("indeterminate");
  if (pct === null) {
    statusProgress.classList.add("hidden");
  } else if (pct === "indeterminate") {
    statusProgress.classList.remove("hidden");
    statusBar.style.width = "35%";
    statusBar.classList.add("indeterminate");
  } else {
    statusProgress.classList.remove("hidden");
    statusBar.style.width = `${pct}%`;
  }
}

export async function runStatusAction() {
  if (!state.statusAction) return;
  if (state.statusAction === "install-update") {
    setStatus("Installing update and restarting…");
    await window.playbound.installUpdate();
    return;
  }
  if (state.statusAction === "check-updates") {
    setStatus("Checking for updates…");
    const res = await window.playbound.checkForUpdates();
    if (!res?.ok) {
      setStatus(res?.message || "Update check failed", true);
    }
  }
}

export function applyAccountToSidebar(acc) {
  state.accountState = acc || { connected: false };
  const connectionDot = document.getElementById("connection-dot");
  const connectionLabel = document.getElementById("connection-label");
  if (!connectionDot || !connectionLabel) return;
  if (acc?.connected) {
    connectionDot.className = "dot online";
    const who = acc.username || acc.email;
    connectionLabel.textContent = who ? `Signed in · ${who}` : "Signed in";
  } else {
    connectionDot.className = "dot";
    connectionLabel.textContent = acc ? "Not signed in" : "Offline";
  }
}

export async function refreshAccountStatus() {
  try {
    const acc = await window.playbound.getAccount();
    applyAccountToSidebar(acc);
  } catch {
    applyAccountToSidebar(null);
  }
}

function getTelemetryAnonymousId() {
  try {
    let id = localStorage.getItem("pb_telemetry_anonymous_id");
    if (!id) {
      id = `pb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem("pb_telemetry_anonymous_id", id);
    }
    return id;
  } catch {
    return `pb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function postTelemetry(event, properties) {
  const sessionId = `launcher-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  void window.playbound
    .postTelemetry({
      event,
      properties: { ...properties, platform: "launcher" },
      timestamp: new Date().toISOString(),
      sessionId,
      anonymousId: getTelemetryAnonymousId(),
      userId: state.accountState?.username || null,
    })
    .catch(() => {
      /* fail-soft */
    });
}

export function startGameSession(slug, title) {
  endGameSession();
  state._activeGameSession = { slug, title, startedAt: Date.now() };
  postTelemetry("game_started", {
    gameSlug: slug,
    gameTitle: title,
    installMethod: "launcher",
  });
}

export function endGameSession() {
  if (!state._activeGameSession) return;
  const durationMs = Math.max(0, Date.now() - state._activeGameSession.startedAt);
  postTelemetry("game_finished", {
    gameSlug: state._activeGameSession.slug,
    gameTitle: state._activeGameSession.title,
    durationMs,
  });
  state._activeGameSession = null;
}

export function enhanceSelect(selectEl) {
  if (!selectEl || selectEl.dataset.premium === "true") return;
  selectEl.dataset.premium = "true";
  selectEl.classList.add("premium-select-native-hidden");
  selectEl.style.display = "none";

  const wrapper = document.createElement("div");
  wrapper.className = "premium-select";
  if (selectEl.id) wrapper.dataset.for = selectEl.id;
  if (selectEl.style.flex) wrapper.style.flex = selectEl.style.flex;
  if (selectEl.style.maxWidth) wrapper.style.maxWidth = selectEl.style.maxWidth;
  if (selectEl.style.minWidth) wrapper.style.minWidth = selectEl.style.minWidth;
  if (selectEl.style.margin) wrapper.style.margin = selectEl.style.margin;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "premium-select-btn";
  btn.setAttribute("aria-haspopup", "listbox");
  btn.setAttribute("aria-expanded", "false");
  if (selectEl.disabled) btn.disabled = true;

  const span = document.createElement("span");
  span.className = "premium-select-label";
  btn.appendChild(span);

  const icon = document.createElement("span");
  icon.className = "premium-select-icon";
  icon.innerHTML =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
  btn.appendChild(icon);

  const dropdown = document.createElement("div");
  dropdown.className = "premium-select-dropdown";
  dropdown.setAttribute("role", "listbox");
  dropdown.tabIndex = -1;

  wrapper.appendChild(btn);
  wrapper.appendChild(dropdown);
  selectEl.parentNode.insertBefore(wrapper, selectEl);
  wrapper.appendChild(selectEl);

  function renderOptions() {
    dropdown.innerHTML = "";
    btn.disabled = !!selectEl.disabled;

    let selectedOpt = selectEl.selectedIndex >= 0 ? selectEl.options[selectEl.selectedIndex] : null;
    if (!selectedOpt && selectEl.options.length > 0) {
      selectedOpt = selectEl.options[0];
    }
    span.textContent = selectedOpt
      ? selectedOpt.textContent || selectedOpt.label || selectedOpt.value
      : "Select…";

    Array.from(selectEl.options).forEach((opt) => {
      const isSelected = opt === selectedOpt || String(opt.value) === String(selectEl.value);
      const item = document.createElement("div");
      item.className =
        "premium-select-item" + (isSelected ? " selected" : "") + (opt.disabled ? " disabled" : "");
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", isSelected ? "true" : "false");
      item.dataset.value = opt.value;

      const itemText = document.createElement("span");
      itemText.className = "premium-select-item-text";
      itemText.textContent = opt.textContent || opt.label || opt.value;
      item.appendChild(itemText);

      if (isSelected) {
        const check = document.createElement("span");
        check.className = "premium-select-check";
        check.innerHTML =
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
        item.appendChild(check);
      }

      item.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (opt.disabled) return;
        selectEl.value = opt.value;
        wrapper.classList.remove("open");
        btn.setAttribute("aria-expanded", "false");
        renderOptions();
        selectEl.dispatchEvent(new Event("change", { bubbles: true }));
        selectEl.dispatchEvent(new Event("input", { bubbles: true }));
        if (typeof selectEl.onchange === "function") {
          selectEl.onchange(new Event("change"));
        }
      });

      dropdown.appendChild(item);
    });
  }

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (btn.disabled || selectEl.disabled) return;
    const isOpen = wrapper.classList.contains("open");
    document.querySelectorAll(".premium-select.open").forEach((p) => {
      p.classList.remove("open");
      p.querySelector(".premium-select-btn")?.setAttribute("aria-expanded", "false");
    });
    if (!isOpen) {
      wrapper.classList.add("open");
      btn.setAttribute("aria-expanded", "true");
      renderOptions();
      const sel = dropdown.querySelector(".premium-select-item.selected");
      if (sel) sel.scrollIntoView({ block: "nearest" });
    }
  });

  selectEl.addEventListener("change", renderOptions);
  selectEl.addEventListener("input", renderOptions);
  selectEl._syncCustomSelect = renderOptions;

  const origAppendChild = selectEl.appendChild.bind(selectEl);
  selectEl.appendChild = function (child) {
    const res = origAppendChild(child);
    renderOptions();
    return res;
  };
  const origInsertBefore = selectEl.insertBefore.bind(selectEl);
  selectEl.insertBefore = function (newNode, refNode) {
    const res = origInsertBefore(newNode, refNode);
    renderOptions();
    return res;
  };
  const origRemoveChild = selectEl.removeChild.bind(selectEl);
  selectEl.removeChild = function (child) {
    const res = origRemoveChild(child);
    renderOptions();
    return res;
  };
  try {
    const innerHTMLDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
    if (innerHTMLDescriptor && innerHTMLDescriptor.set) {
      Object.defineProperty(selectEl, "innerHTML", {
        get() {
          return innerHTMLDescriptor.get.call(this);
        },
        set(val) {
          innerHTMLDescriptor.set.call(this, val);
          renderOptions();
        },
        configurable: true,
      });
    }
  } catch {
    /* ignore */
  }

  try {
    const protoVal = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
    if (protoVal && protoVal.set) {
      Object.defineProperty(selectEl, "value", {
        get() {
          return protoVal.get.call(this);
        },
        set(v) {
          protoVal.set.call(this, v);
          renderOptions();
        },
        configurable: true,
      });
    }
  } catch {
    /* ignore descriptor errors */
  }

  const observer = new MutationObserver(() => renderOptions());
  observer.observe(selectEl, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["disabled", "value"],
  });

  renderOptions();
}

export function wireEnhanceSelect() {
  document.addEventListener("click", (e) => {
    document.querySelectorAll(".premium-select.open").forEach((p) => {
      if (!p.contains(e.target)) {
        p.classList.remove("open");
        p.querySelector(".premium-select-btn")?.setAttribute("aria-expanded", "false");
      }
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.querySelectorAll(".premium-select.open").forEach((p) => {
        p.classList.remove("open");
        p.querySelector(".premium-select-btn")?.setAttribute("aria-expanded", "false");
      });
    }
  });

  const selectObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) {
          if (node.tagName === "SELECT") enhanceSelect(node);
          if (node.querySelectorAll) {
            node.querySelectorAll("select").forEach(enhanceSelect);
          }
        }
      });
    });
  });
  selectObserver.observe(document.body, { childList: true, subtree: true });
  document.querySelectorAll("select").forEach(enhanceSelect);
}
