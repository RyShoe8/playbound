// State
let currentView = "home";
let accountState = { connected: false };
let deepLinkCtx = null;
let currentDetailSlug = null;
let currentModDetailSlug = null;
let detailReturnView = "games";
let modDetailActiveTab = "overview";
let detailActiveTab = "overview";
let updateStatus = { phase: "idle" };

/** Games catalog filter state (persists across re-renders of the view). */
const gamesFilters = {
  query: "",
  genre: "",
  multiplayerOnly: false,
  installableOnly: false,
  sort: "name",
};

/** Compatible | all — mirrors site GameCompatibilityToggle (desktop rules). */
let compatibilityFilter = "compatible";
let currentEditionDetail = null; // { gameSlug, editionSlug }
let _liveStatsPromise = null;
let _liveStatsTime = 0;
/** Last successful catalog live-stats payload (survives failed refreshes). */
let _liveStatsLastGood = null;

const DISCORD_INVITE = "https://discord.gg/yc7WdxATar";
const PODIUM_MEDALS = ["🥇", "🥈", "🥉"];

const OPENCIV3_DATA_HINT =
  "OpenCiv3 runs standalone with placeholder art. Optional: install Civilization III Complete (Steam/GOG) for original graphics — it auto-detects common installs.";

function gamePlayHintHtml(slug) {
  if (slug === "openciv3") {
    return `<p class="view-sub" style="margin:8px 0 0;max-width:36rem;flex-basis:100%">${escapeHtml(OPENCIV3_DATA_HINT)}</p>`;
  }
  return "";
}

function normalizePlatform(value) {
  const t = String(value || "")
    .trim()
    .toLowerCase();
  if (t === "browser" || t === "web") return "web";
  if (t === "mac os" || t === "macos" || t === "osx" || t === "mac") return "macos";
  if (t === "iphone" || t === "ipad") return "ios";
  return t;
}

function selectExecutableLabel() {
  try {
    return window.playbound.platform.selectExecutableLabel?.() || "Select .exe";
  } catch {
    return "Select .exe";
  }
}

function executableNoun() {
  try {
    return window.playbound.platform.executableLabel?.() || ".exe";
  } catch {
    return ".exe";
  }
}

function isMacOS() {
  try {
    return window.playbound.platform.getOS() === "macos";
  } catch {
    return false;
  }
}

function desktopPlatformAllowedSet() {
  const currentOS = window.playbound.platform.getOS();
  return currentOS === "macos"
    ? new Set(["macos", "web", "browser"])
    : new Set(["windows", "macos", "linux", "web"]);
}

function isGameDesktopCompatible(game) {
  if (game?.browserPlayable) return true;

  const currentOS = window.playbound.platform.getOS();
  if (currentOS !== "macos" && game?.steamDeck) return true;

  const platforms = (game?.platforms || []).map(normalizePlatform).filter(Boolean);
  if (platforms.length === 0) return true;

  const allowed = desktopPlatformAllowedSet();
  return platforms.some((p) => allowed.has(p));
}

/** Empty platforms = all OSes (same rule as games). */
function isModDesktopCompatible(mod) {
  const platforms = (mod?.platforms || []).map(normalizePlatform).filter(Boolean);
  if (platforms.length === 0) return true;
  const allowed = desktopPlatformAllowedSet();
  return platforms.some((p) => allowed.has(p));
}

function filterByCompatibility(list) {
  if (compatibilityFilter !== "compatible") return list;
  return list.filter(isGameDesktopCompatible);
}

async function loadCompatibilitySetting() {
  try {
    const s = await window.playbound.getSettings();
    if (s?.compatibilityFilter === "all" || s?.compatibilityFilter === "compatible") {
      compatibilityFilter = s.compatibilityFilter;
    }
  } catch {
    /* ignore */
  }
  syncCompatRadios();
}

function syncCompatRadios() {
  document.querySelectorAll('input[name="compat-filter"]').forEach((input) => {
    input.checked = input.value === compatibilityFilter;
  });
}

async function setCompatibilityFilter(mode) {
  if (mode !== "compatible" && mode !== "all") return;
  compatibilityFilter = mode;
  syncCompatRadios();
  try {
    await window.playbound.saveSettings({ compatibilityFilter: mode });
  } catch {
    /* ignore */
  }
  if (currentView === "home") renderHomeView();
  else if (currentView === "games") renderGamesView();
  else if (currentView === "library") renderLibraryView();
}

function formatStatNumber(n) {
  const v = Number(n) || 0;
  return v.toLocaleString();
}

function buildActivityPanelHtml(stats, title = "Activity") {
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

/**
 * Placeholder shown while live stats are in flight.
 *
 * Mirrors the real card's structure — same wrapper, same four-cell grid, same
 * popular list and footer — so the slot reserves its final height instead of
 * collapsing to nothing and shoving the header down when data lands. The
 * labels are real; only the values are pending, which reads as loading rather
 * than as broken.
 */
function buildCatalogStatsSkeletonHtml() {
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
      </dl>
      <div class="catalog-stats-popular">
        <h3>Most Popular Right Now</h3>
        <ol>${popularRow.repeat(3)}</ol>
      </div>
      <p class="catalog-stats-footer">Across supported games • Updated every 15 min</p>
    </aside>`;
}

function buildCatalogStatsCardHtml(live) {
  const usable =
    live &&
    live.ok !== false &&
    typeof live.gameCount === "number";
  if (!usable) {
    return `<aside class="catalog-stats-card"><p class="view-sub" style="margin:0">Live stats unavailable.</p></aside>`;
  }
  const popular = Array.isArray(live.mostPopular) ? live.mostPopular : [];
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
        <div><dt>Games</dt><dd>${formatStatNumber(live.gameCount)}</dd></div>
        <div><dt>Mods</dt><dd>${formatStatNumber(live.modCount)}</dd></div>
        <div><dt>Editions</dt><dd>${formatStatNumber(live.editionCount)}</dd></div>
        <div><dt>Gamers Playing</dt><dd>${formatStatNumber(live.playingNow)}</dd></div>
      </dl>
      ${popularHtml}
      <p class="catalog-stats-footer">Across supported games • Updated every 15 min</p>
    </aside>`;
}

/** Servers browser state */
const serversState = {
  selectedSlug: null,
  selectedModSlug: "", // "" = Base game (no mod filter)
  search: "",
  pingById: {},
  installedOnly: false,
  sort: "players", // name | players | map | location | ping
  sortDir: "desc", // asc | desc
};

const SERVER_SORT_DEFAULT_DIR = {
  name: "asc",
  players: "desc",
  map: "asc",
  location: "asc",
  ping: "desc",
};
/** Cached mods list for the mod dropdown (from getModsCatalog). */
let _modsCatalog = [];
let _supportedServerGames = [];
let _installedGameSlugs = new Set();
let _installedModsList = [];

// ── Game session telemetry ──────────────────────────────────────────────────
let _activeGameSession = null;

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

/** POST a telemetry event via main process (uses getApiBase → playbound.club). */
function postTelemetry(event, properties) {
  const sessionId = `launcher-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  void window.playbound.postTelemetry({
    event,
    properties: { ...properties, platform: "launcher" },
    timestamp: new Date().toISOString(),
    sessionId,
    anonymousId: getTelemetryAnonymousId(),
    userId: accountState?.username || null,
  }).catch(() => { /* fail-soft */ });
}

/** Start tracking a new game session. Ends the previous session if one is active. */
function startGameSession(slug, title) {
  endGameSession();
  _activeGameSession = { slug, title, startedAt: Date.now() };
  postTelemetry("game_started", {
    gameSlug: slug,
    gameTitle: title,
    installMethod: "launcher",
  });
}

/** End the active game session and fire game_finished with computed duration. */
function endGameSession() {
  if (!_activeGameSession) return;
  const durationMs = Math.max(0, Date.now() - _activeGameSession.startedAt);
  postTelemetry("game_finished", {
    gameSlug: _activeGameSession.slug,
    gameTitle: _activeGameSession.title,
    durationMs,
  });
  _activeGameSession = null;
}

window.addEventListener("beforeunload", () => endGameSession());

window.playbound.onGameExited?.((data) => {
  const slug = data?.slug;
  if (!slug || !_activeGameSession || _activeGameSession.slug !== slug) return;
  endGameSession();
});
// ─────────────────────────────────────────────────────────────────────────────

// DOM Elements
const navBtns = document.querySelectorAll(".nav-btn");
const views = {
  home: document.getElementById("view-home"),
  games: document.getElementById("view-games"),
  editions: document.getElementById("view-editions"),
  mods: document.getElementById("view-mods"),
  servers: document.getElementById("view-servers"),
  events: document.getElementById("view-events"),
  friends: document.getElementById("view-friends"),
  gear: document.getElementById("view-gear"),
  library: document.getElementById("view-library"),
  settings: document.getElementById("view-settings"),
  gameDetail: document.getElementById("view-game-detail"),
  modDetail: document.getElementById("view-mod-detail"),
  editionDetail: document.getElementById("view-edition-detail"),
  deepLink: document.getElementById("view-deep-link"),
};

const GAMES_FAMILY_VIEWS = new Set([
  "games",
  "mods",
  "editions",
  "gameDetail",
  "modDetail",
  "editionDetail",
]);

function editionsContextSlug() {
  return currentDetailSlug || currentEditionDetail?.gameSlug || null;
}

function updateGamesFamilyNav() {
  const editionsBtn = document.getElementById("nav-editions");
  const showEditions =
    Boolean(editionsContextSlug()) &&
    (currentView === "gameDetail" ||
      currentView === "editionDetail" ||
      currentView === "editions");
  if (editionsBtn) {
    editionsBtn.hidden = !showEditions;
    editionsBtn.setAttribute("aria-hidden", showEditions ? "false" : "true");
  }

  const gamesGroup = document.querySelector(".nav-group");
  gamesGroup?.classList.toggle("has-active-child", GAMES_FAMILY_VIEWS.has(currentView));
}
const connectionDot = document.getElementById("connection-dot");
const connectionLabel = document.getElementById("connection-label");
const statusMsg = document.getElementById("statusbar-msg");
const statusProgress = document.getElementById("statusbar-progress");
const statusBar = document.getElementById("statusbar-bar");

const fmtBytes = (n) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(0)} MB` : `${Math.round(n / 1e3)} KB`;

function navigateTo(viewName, params = {}) {
  if (viewName === "editions" && !editionsContextSlug() && !params.gameSlug) {
    navigateTo("games");
    return;
  }

  currentView = viewName;
  const navKey =
    viewName === "gameDetail" || viewName === "editionDetail" || viewName === "modDetail"
      ? null
      : viewName === "editions"
        ? "editions"
        : viewName;
  navBtns.forEach((btn) => {
    const isGamesParent =
      btn.dataset.view === "games" && !btn.classList.contains("sub-nav-btn");
    const active =
      (Boolean(navKey) && btn.dataset.view === navKey) ||
      (isGamesParent &&
        (viewName === "games" ||
          viewName === "mods" ||
          viewName === "gameDetail" ||
          viewName === "modDetail" ||
          viewName === "editionDetail" ||
          viewName === "editions"));
    btn.classList.toggle("active", active);
  });
  Object.keys(views).forEach((k) => {
    views[k]?.classList.toggle("active", k === viewName);
  });
  updateGamesFamilyNav();

  if (viewName === "home") renderHomeView();
  else if (viewName === "games") renderGamesView();
  else if (viewName === "editions") renderEditionsView(params.gameSlug);
  else if (viewName === "mods") renderModsView();
  else if (viewName === "servers") renderServersView();
  else if (viewName === "events") renderEventsView();
  else if (viewName === "library") renderLibraryView();
  else if (viewName === "friends") renderFriendsView();
  else if (viewName === "gear") renderGearView();
  else if (viewName === "settings") renderSettingsView();
  else if (viewName === "gameDetail") renderGameDetailView(params.slug);
  else if (viewName === "modDetail") renderModDetailView(params.slug);
  else if (viewName === "editionDetail") {
    renderEditionDetailView(params.gameSlug, params.editionSlug);
  }
}

navBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!btn.dataset.view) return;
    if (btn.dataset.view === "editions") {
      const slug = editionsContextSlug();
      if (!slug) {
        navigateTo("games");
        return;
      }
      navigateTo("editions", { gameSlug: slug });
      return;
    }
    navigateTo(btn.dataset.view);
  });
});

updateGamesFamilyNav();

document.getElementById("sidebar-discord")?.addEventListener("click", (e) => {
  e.preventDefault();
  window.playbound.openExternal(DISCORD_INVITE, { campaign: "discord" });
});

document.querySelectorAll('input[name="compat-filter"]').forEach((input) => {
  input.addEventListener("change", () => {
    if (input.checked) void setCompatibilityFilter(input.value);
  });
});

void loadCompatibilitySetting();

/** @type {null | "install-update" | "check-updates"} */
let statusAction = null;

function setStatusAction(action) {
  statusAction = action;
  statusMsg?.classList.toggle("statusbar-msg--action", Boolean(action));
  if (statusMsg) {
    if (action) statusMsg.setAttribute("role", "button");
    else statusMsg.removeAttribute("role");
    statusMsg.tabIndex = action ? 0 : -1;
  }
}

function setStatus(text, isError = false) {
  setStatusAction(null);
  statusMsg.textContent = text || "";
  statusMsg.style.color = isError ? "var(--danger)" : "var(--text-muted)";
}

function setProgress(pct) {
  if (pct === null) {
    statusProgress.classList.add("hidden");
  } else {
    statusProgress.classList.remove("hidden");
    statusBar.style.width = `${pct}%`;
  }
}

async function runStatusAction() {
  if (!statusAction) return;
  if (statusAction === "install-update") {
    setStatus("Installing update and restarting…");
    await window.playbound.installUpdate();
    return;
  }
  if (statusAction === "check-updates") {
    setStatus("Checking for updates…");
    const res = await window.playbound.checkForUpdates();
    if (!res?.ok) {
      setStatus(res?.message || "Update check failed", true);
    }
  }
}

statusMsg?.addEventListener("click", () => {
  void runStatusAction();
});
statusMsg?.addEventListener("keydown", (e) => {
  if (!statusAction) return;
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    void runStatusAction();
  }
});

async function refreshAccountStatus() {
  try {
    const acc = await window.playbound.getAccount();
    accountState = acc;
    if (acc.connected) {
      connectionDot.className = "dot online";
      const who = acc.username || acc.email;
      connectionLabel.textContent = who ? `Signed in · ${who}` : "Signed in";
    } else {
      connectionDot.className = "dot";
      connectionLabel.textContent = "Not signed in";
    }
  } catch {
    connectionDot.className = "dot";
    connectionLabel.textContent = "Offline";
  }
}

window.playbound.onAccount((data) => {
  if (data?.message) setStatus(data.message, data.connected === false);
  refreshAccountStatus();
  if (data?.connected) void loadCompatibilitySetting();
  if (currentView === "settings") renderSettingsView();
  if (currentView === "library" && /library|located|Locate/i.test(data?.message || "")) {
    renderLibraryView();
  }
});

window.playbound.onNavigate?.((data) => {
  if (data?.view) navigateTo(data.view);
});

window.playbound.onUpdateStatus?.((data) => {
  updateStatus = data || { phase: "idle" };
  const phase = data?.phase;
  const refreshSettings = () => {
    if (currentView === "settings") renderSettingsView();
  };
  const patchSettingsHint = (text) => {
    const el = document.getElementById("set-update-hint");
    if (el) el.textContent = text;
  };

  if (phase === "checking") {
    setStatus("Checking for updates…");
    setProgress(null);
  } else if (phase === "available") {
    statusMsg.textContent = `Update ${data.version} available — click to download`;
    statusMsg.style.color = "var(--accent-light)";
    setStatusAction("check-updates");
    setProgress(null);
    patchSettingsHint(`Update ${data.version} available.`);
  } else if (phase === "downloading") {
    const pct = Math.max(0, Math.min(100, Number(data.percent) || 0));
    setStatus(`Downloading update… ${pct}%`);
    setProgress(pct);
    patchSettingsHint(`Downloading… ${pct}%`);
  } else if (phase === "ready") {
    statusMsg.textContent = `Update ${data.version} ready — click to install and restart`;
    statusMsg.style.color = "var(--accent-light)";
    setStatusAction("install-update");
    setProgress(null);
    refreshSettings();
  } else if (phase === "none") {
    setStatus(data.version ? `You're up to date (v${data.version}).` : "You're up to date.");
    setProgress(null);
    refreshSettings();
  } else if (phase === "error") {
    setStatus(data.message || "Update error", true);
    setProgress(null);
    refreshSettings();
  }
});

// ── Views ────────────────────────────────────────────────────

async function renderHomeView() {
  const container = views.home;
  container.innerHTML = `
    <div class="home-header-row">
      <div class="home-header-copy">
        <h1 class="view-title">Welcome back</h1>
        <p class="view-sub">Play your favorite titles or browse free games on PlayBound.</p>
      </div>
      <div id="home-stats-slot"></div>
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
    <div id="home-popular-grid" class="game-grid"></div>
  `;

  document.getElementById("home-browse-games")?.addEventListener("click", () => navigateTo("games"));
  document.getElementById("home-browse-free-games")?.addEventListener("click", () => {
    window.playbound.openExternal("https://playbound.club/free-games");
  });

  /**
   * Local data only. Recently-played and the catalog are both read from
   * memory or disk in the main process, so these resolve immediately.
   *
   * Live stats are deliberately NOT awaited here. That call goes over the
   * network, and having it inside this Promise.all meant the entire homepage —
   * including lists already sitting in memory — stayed blank until it came
   * back. On a slow or unreachable connection that was the whole 5+ second
   * wait for any content at all. "Most Popular" is filled in once live stats
   * resolve, same as the stats card below.
   */
  const [recent, catalog] = await Promise.all([
    window.playbound.getRecentlyPlayed(),
    window.playbound.getCatalog(),
  ]);

  // Reserve the card's space up front so the header does not jump when the
  // real numbers arrive.
  const statsSlot = document.getElementById("home-stats-slot");
  if (statsSlot) statsSlot.innerHTML = buildCatalogStatsSkeletonHtml();

  const popularGrid = document.getElementById("home-popular-grid");
  if (popularGrid) {
    popularGrid.innerHTML = `<p class="view-sub">Loading popularity data…</p>`;
  }

  void (async () => {
    const now = Date.now();
    const cacheFresh = _liveStatsPromise && now - _liveStatsTime <= 60_000;

    async function fetchCatalogLiveStats() {
      const raw = await (window.playbound.getLiveStats?.() ?? Promise.resolve(null));
      if (raw && raw.ok !== false && typeof raw.gameCount === "number") {
        _liveStatsLastGood = raw;
        return raw;
      }
      return null;
    }

    if (!cacheFresh) {
      _liveStatsTime = now;
      _liveStatsPromise = (async () => {
        let live = await fetchCatalogLiveStats();
        if (!live) {
          await new Promise((r) => setTimeout(r, 750));
          live = await fetchCatalogLiveStats();
        }
        // Only cache successes — failures must not stick for 60s.
        if (!live) {
          _liveStatsPromise = null;
          _liveStatsTime = 0;
          return _liveStatsLastGood;
        }
        return live;
      })();
    }

    const live = await _liveStatsPromise;
    // The user may have navigated away while this was in flight, in which case
    // the slot no longer exists — or has been replaced by a newer render.
    if (!statsSlot || !statsSlot.isConnected) return;
    statsSlot.innerHTML = buildCatalogStatsCardHtml(live || _liveStatsLastGood);
    statsSlot.querySelectorAll("[data-popular-slug]").forEach((btn) => {
      btn.addEventListener("click", () => openGameDetail(btn.dataset.popularSlug, "home"));
    });

    if (popularGrid && popularGrid.isConnected) {
      const byGame = Array.isArray((live || _liveStatsLastGood)?.byGame)
        ? (live || _liveStatsLastGood).byGame
        : [];
      const bySlug = new Map(catalog.map((g) => [g.slug, g]));
      const popular = filterByCompatibility(
        byGame
          .map((row) => bySlug.get(row.slug))
          .filter(Boolean)
      ).slice(0, 8);
      if (popular.length > 0) {
        popularGrid.replaceChildren(...popular.map(createGameCard));
      } else {
        popularGrid.innerHTML = `<p class="view-sub">No popularity data yet.</p>`;
      }
    }
  })();

  void (async () => {
    try {
      const res = await window.playbound.getFreeOffers?.();
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

  const recentSec = document.getElementById("home-recent-section");
  const recentGrid = document.getElementById("home-recent-grid");
  if (recent && recent.length > 0) {
    recentSec.classList.remove("hidden");
    recentGrid.replaceChildren(...filterByCompatibility(recent).map(createGameCard));
  }

  const newestGrid = document.getElementById("home-newest-grid");
  const newest = [...filterByCompatibility(catalog)].sort((a, b) => {
    const ta = Date.parse(a.createdAt || "") || 0;
    const tb = Date.parse(b.createdAt || "") || 0;
    return tb - ta;
  });
  newestGrid.replaceChildren(...newest.slice(0, 8).map(createGameCard));
}

async function renderLibraryView() {
  const container = views.library;
  container.innerHTML = `
    <div class="section-header" style="margin-top: 0">
      <div>
        <h1 class="view-title" style="margin: 0">Library</h1>
        <p class="view-sub" style="margin: 4px 0 0 0">Games and mods on this ${isMacOS() ? "Mac" : "PC"} — install or add an existing ${executableNoun()}.</p>
      </div>
      <button class="btn-primary btn-sm" type="button" id="btn-library-add">Add game</button>
    </div>
    <div id="library-add-panel" class="library-add-panel hidden"></div>
    <div id="library-list" class="library-grid" style="margin-top: 20px"></div>
  `;

  document.getElementById("btn-library-add")?.addEventListener("click", () => {
    void toggleLibraryAddPanel();
  });

  document.getElementById("btn-sync-lib-settings")?.addEventListener("click", () => {
    void syncLibraryNow({ quiet: false });
  });

  // Without this the Library view rendered its shell and never filled in.
  await renderLibraryList();
}

// ── Friends View ──────────────────────────────────────────────
let friendsPollInterval = null;

function wireFriendsAppearOfflineButton() {
  const btn = document.getElementById("btn-appear-offline");
  if (!btn || !window.playbound.getAppearOffline) {
    if (btn) btn.style.display = "none";
    return;
  }
  window.playbound.getAppearOffline().then((res) => {
    let on = Boolean(res?.appearOffline);
    btn.textContent = on ? "Go online" : "Appear offline";
    btn.title = "Appear offline so friends don’t see you as online or playing";
    btn.onclick = async () => {
      btn.disabled = true;
      const result = await window.playbound.setAppearOffline(!on);
      if (!result?.error) on = !on;
      btn.textContent = on ? "Go online" : "Appear offline";
      btn.disabled = false;
    };
  });
}

async function renderFriendsView() {
  const container = views.friends;
  
  if (!accountState.connected) {
    container.innerHTML = `
      <div class="section-header" style="margin-top: 0">
        <div>
          <h1 class="view-title" style="margin: 0">Friends</h1>
          <p class="view-sub" style="margin: 4px 0 0 0">See who's playing and manage friend requests.</p>
        </div>
      </div>
      <div style="text-align: center; padding: 40px 0; border: 1px dashed var(--border); border-radius: 8px; margin-top: 20px;">
        <p class="view-sub">Sign in to view and manage your friends.</p>
        <button class="btn-primary" style="margin-top: 12px" id="btn-friends-login">Sign In</button>
      </div>
    `;
    document.getElementById("btn-friends-login")?.addEventListener("click", () => openAuthWindow());
    return;
  }

  // Initial skeleton
  if (!container.querySelector("#friends-content-area")) {
    container.innerHTML = `
      <div class="section-header" style="margin-top: 0">
        <div>
          <h1 class="view-title" style="margin: 0">Friends</h1>
          <p class="view-sub" style="margin: 4px 0 0 0">See who's playing and manage friend requests.</p>
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
          <button class="btn-secondary btn-sm" id="btn-appear-offline">Loading…</button>
          <button class="btn-secondary btn-sm" id="btn-toggle-add-friend">Add Friend</button>
        </div>
      </div>
      
      <div id="add-friends-panel" style="display: none; margin-top: 16px; padding: 16px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-secondary);">
        <div style="display: flex; gap: 8px; margin-bottom: 12px; align-items: center; flex-wrap: wrap;">
          <h2 style="margin: 0; font-size: 16px; font-weight: bold; margin-right: 8px;">Add friends</h2>
          <button class="btn-primary btn-sm" id="add-friends-tab-username" style="border-radius: 16px; padding: 4px 12px;">By username</button>
          <button class="btn-secondary btn-sm" id="add-friends-tab-players" style="border-radius: 16px; padding: 4px 12px; border: none; background: transparent; color: var(--text-muted);">Find players</button>
          <button class="btn-secondary btn-sm" id="add-friends-tab-email" style="border-radius: 16px; padding: 4px 12px; border: none; background: transparent; color: var(--text-muted);">Invite by email</button>
        </div>

        <form id="add-friends-form-username" style="display: flex; gap: 8px;">
          <input type="text" class="input-text" id="add-friends-username-input" placeholder="Username" style="flex: 1;" />
          <button type="submit" class="btn-primary" id="btn-search-username" style="border-radius: 16px; padding: 0 16px;">Search</button>
        </form>

        <form id="add-friends-form-players" style="display: none; flex-direction: column; gap: 8px;">
          <p class="view-sub" style="font-size: 12px; margin: 0;">Find people with a game in their library, or anyone playing a genre.</p>
          <div style="display: flex; gap: 8px;">
            <select class="input-text" id="add-friends-game-select" style="flex: 1;">
              <option value="">Any game...</option>
            </select>
            <select class="input-text" id="add-friends-genre-select" style="flex: 1;">
              <option value="">Any genre...</option>
            </select>
            <button type="submit" class="btn-primary" id="btn-search-players" style="border-radius: 16px; padding: 0 16px;">Find</button>
          </div>
        </form>

        <form id="add-friends-form-email" style="display: none; flex-direction: column; gap: 8px;">
          <p class="view-sub" style="font-size: 12px; margin: 0;">Invite someone to PlayBound by email. If they already have an account, we'll send a friend request.</p>
          <div style="display: flex; gap: 8px;">
            <input type="email" class="input-text" id="add-friends-email-input" placeholder="friend@example.com" style="flex: 1;" />
            <button type="submit" class="btn-primary" id="btn-invite-email" style="border-radius: 16px; padding: 0 16px;">Send invite</button>
          </div>
        </form>

        <div id="add-friends-message" style="margin-top: 12px; font-size: 14px; color: var(--text-muted); display: none;"></div>
        <div id="add-friends-results" style="margin-top: 12px;"></div>
      </div>

      <div id="friends-content-area" style="margin-top: 20px;">
        <p class="view-sub">Loading friends...</p>
      </div>
    `;

    document.getElementById("btn-toggle-add-friend").onclick = () => toggleAddFriendsPanel();
    wireFriendsAppearOfflineButton();
  }

  await refreshFriendsData();

  if (!friendsPollInterval) {
    friendsPollInterval = setInterval(() => {
      if (currentView === "friends" && accountState.connected) {
        refreshFriendsData();
      } else {
        clearInterval(friendsPollInterval);
        friendsPollInterval = null;
      }
    }, 30000); // Poll every 30s
  }
}

async function refreshFriendsData() {
  const content = document.getElementById("friends-content-area");
  if (!content) return;

  try {
    const [friendsData, requestsData] = await Promise.all([
      window.playbound.getFriends(),
      window.playbound.getFriendRequests()
    ]);

    const friends = Array.isArray(friendsData?.friends) ? friendsData.friends : [];
    const incomingRequests = Array.isArray(requestsData?.incoming) ? requestsData.incoming : [];
    const outgoingRequests = Array.isArray(requestsData?.outgoing) ? requestsData.outgoing : [];

    const playing = friends.filter(f => f.presence?.status === "playing");
    const looking = friends.filter(
      (f) => f.presence?.lookingForPlayers && f.presence?.status !== "playing"
    );
    const online = friends.filter(f =>
      ["online", "browsing", "away", "viewing_game", "installing", "launching"].includes(f.presence?.status) &&
      !looking.includes(f)
    );
    const offline = friends.filter(f =>
      !playing.includes(f) && !online.includes(f) && !looking.includes(f)
    );

    let html = "";

    if (incomingRequests.length > 0) {
      html += `
        <div class="friends-section">
          <div class="section-header" style="margin-bottom: 12px">Incoming Requests</div>
          <div class="friends-list">
            ${incomingRequests.map(req => `
              <div class="friend-card">
                <div class="friend-card-main">
                  <div class="friend-avatar">${escapeHtml(req.user.username.charAt(0).toUpperCase())}</div>
                  <div class="friend-info">
                    <div class="friend-name">${escapeHtml(req.user.username)}</div>
                    <div class="friend-status" style="color: var(--text-muted)">Wants to be friends</div>
                  </div>
                </div>
                <div class="friend-actions">
                  <button class="btn-primary btn-sm btn-accept" data-id="${escapeHtml(req.id)}">Accept</button>
                  <button class="btn-danger btn-sm btn-decline" data-id="${escapeHtml(req.id)}">Decline</button>
                </div>
              </div>
            `).join("")}
          </div>
        </div>
      `;
    }

    if (outgoingRequests.length > 0) {
      html += `
        <div class="friends-section">
          <div class="section-header" style="margin-bottom: 12px">Outgoing Requests</div>
          <div class="friends-list">
            ${outgoingRequests.map(req => `
              <div class="friend-card">
                <div class="friend-card-main">
                  <div class="friend-avatar">${escapeHtml(req.user.username.charAt(0).toUpperCase())}</div>
                  <div class="friend-info">
                    <div class="friend-name">${escapeHtml(req.user.username)}</div>
                    <div class="friend-status" style="color: var(--text-muted)">Pending</div>
                  </div>
                </div>
                <div class="friend-actions">
                  <button class="btn-secondary btn-sm btn-cancel-request" data-id="${escapeHtml(req.id)}">Cancel</button>
                </div>
              </div>
            `).join("")}
          </div>
        </div>
      `;
    }

    if (playing.length > 0) {
      html += buildFriendsSectionHtml("Playing Now", playing, "playing");
    }
    if (looking.length > 0) {
      html += buildFriendsSectionHtml("Looking for Players", looking, "looking");
    }
    if (online.length > 0) {
      html += buildFriendsSectionHtml("Online", online, "online");
    }
    if (offline.length > 0) {
      html += buildFriendsSectionHtml("Offline", offline, "offline");
    }

    if (!friends.length && !incomingRequests.length && !outgoingRequests.length) {
      html = `
        <div style="text-align: center; padding: 40px 0; border: 1px dashed var(--border); border-radius: 8px;">
          <p class="view-sub">No friends yet. Find someone above — outgoing requests will show here until they accept.</p>
          <button class="btn-primary" style="margin-top: 12px" onclick="toggleAddFriendsPanel(true)">Find Friends</button>
        </div>
      `;
    }

    content.innerHTML = html;

    // Attach event listeners
    content.querySelectorAll(".btn-accept").forEach(btn => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "Accepting...";
        await window.playbound.acceptFriendRequest(btn.dataset.id);
        refreshFriendsData();
      });
    });

    content.querySelectorAll(".btn-decline").forEach(btn => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "Declining...";
        await window.playbound.declineFriendRequest(btn.dataset.id);
        refreshFriendsData();
      });
    });

    content.querySelectorAll(".btn-cancel-request").forEach(btn => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "Cancelling...";
        await window.playbound.cancelFriendRequest(btn.dataset.id);
        refreshFriendsData();
      });
    });

    content.querySelectorAll(".btn-remove-friend").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!confirm("Are you sure you want to remove this friend?")) return;
        btn.disabled = true;
        await window.playbound.removeFriend(btn.dataset.id);
        refreshFriendsData();
      });
    });

    content.querySelectorAll(".btn-view-game").forEach(btn => {
      btn.addEventListener("click", () => {
        const slug = btn.dataset.slug;
        if (slug) navigateTo("gameDetail", { slug });
      });
    });

    const onlineCount = playing.length + online.length;
    const friendsNav = document.querySelector('.nav-btn[data-view="friends"]');
    if (friendsNav) {
      const label = friendsNav.querySelector(".nav-label") || friendsNav;
      // Keep icon; update trailing text node if present
      friendsNav.setAttribute("data-online-count", String(onlineCount));
      const badge = friendsNav.querySelector(".friends-online-badge") || document.createElement("span");
      badge.className = "friends-online-badge";
      badge.style.cssText = "margin-left:6px;font-size:11px;font-weight:700;opacity:0.75";
      badge.textContent = onlineCount > 0 ? String(onlineCount) : "";
      if (!badge.parentElement) friendsNav.appendChild(badge);
    }

  } catch (err) {
    content.innerHTML = `<p class="view-sub" style="color: var(--danger)">Failed to load friends: ${escapeHtml(err.message)}</p>`;
  }
}

function buildFriendsSectionHtml(title, list, type) {
  let listHtml = "";
  for (const f of list) {
    let statusText = "Offline";
    let statusDot = "";
    const gameLabel = f.presence?.currentGameTitle || f.presence?.currentGameId || "a game";
    const gameSlug = f.presence?.currentGameId || "";
    const joinSlug =
      type === "looking"
        ? f.presence?.lookingForPlayersGameId || gameSlug
        : gameSlug;
    
    if (type === "playing") {
      statusText = `<span style="color: var(--primary)">Playing ${escapeHtml(gameLabel)}</span>`;
      statusDot = `<span class="status-dot dot-playing"></span>`;
    } else if (type === "looking") {
      const lfgLabel =
        f.presence?.lookingForPlayersGameId ||
        f.presence?.currentGameTitle ||
        f.presence?.currentGameId ||
        "";
      statusText = `<span style="color: var(--primary)">Looking for players${
        lfgLabel ? ` · ${escapeHtml(lfgLabel)}` : ""
      }</span>`;
      statusDot = `<span class="status-dot dot-online"></span>`;
    } else if (type === "online") {
      statusText = "Online on PlayBound";
      statusDot = `<span class="status-dot dot-online"></span>`;
    }

    listHtml += `
      <div class="friend-card ${type === 'offline' ? 'friend-offline' : ''}">
        <div class="friend-card-main">
          <div class="friend-avatar-wrap">
            <div class="friend-avatar">${escapeHtml(f.username.charAt(0).toUpperCase())}</div>
            ${statusDot}
          </div>
          <div class="friend-info">
            <div class="friend-name">${escapeHtml(f.username)}${f.discordLinked ? ' <span class="discord-badge" title="Discord Linked"></span>' : ''}</div>
            <div class="friend-status">${statusText}</div>
          </div>
        </div>
        <div class="friend-actions">
          ${
            (type === "playing" || type === "looking") && joinSlug
              ? `<button class="btn-success btn-sm btn-view-game" data-slug="${escapeHtml(joinSlug)}">Join Game</button>`
              : ""
          }
          <button class="btn-secondary btn-sm btn-remove-friend" data-id="${escapeHtml(f.id)}" title="Remove Friend">
             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="23" y1="11" x2="17" y2="11"></line></svg>
          </button>
        </div>
      </div>
    `;
  }

  return `
    <div class="friends-section" style="margin-bottom: 24px">
      <div class="section-header" style="margin-bottom: 12px">${escapeHtml(title)} - ${list.length}</div>
      <div class="friends-list">
        ${listHtml}
      </div>
    </div>
  `;
}
// ─────────────────────────────────────────────────────────────────

async function renderGearView() {
  const container = views.gear;
  if (!container) return;
  container.innerHTML = `
    <div class="section-header" style="margin-top: 0; flex-direction: column; align-items: stretch; gap: 8px;">
      <div style="text-align: center;">
        <h1 class="view-title" style="margin: 0">Gear</h1>
        <p class="view-sub" style="margin: 8px auto 0; max-width: 36rem;">
          Hardware recommendations driven by the games you actually play. Playbound Certified and tested by the community.
        </p>
      </div>
      <div style="display: flex; justify-content: flex-end;">
        <button class="btn-secondary btn-sm" id="btn-open-gear-web">Open playbound.club/gear</button>
      </div>
    </div>
    <div id="gear-directory" style="margin-top: 24px;">
      <p class="view-sub">Loading gear…</p>
    </div>
  `;

  document.getElementById("btn-open-gear-web")?.addEventListener("click", () => {
    window.playbound.openExternal("https://playbound.club/gear");
  });

  const dir = document.getElementById("gear-directory");
  try {
    const res = (await window.playbound.getGearCatalog?.()) || {};
    const categories = Array.isArray(res.categories) ? res.categories : [];
    const grouped = res.grouped && typeof res.grouped === "object" ? res.grouped : {};

    if (!categories.length) {
      dir.innerHTML = `<p class="view-sub" style="text-align:center;padding:40px 0;">Check back soon for our first batch of recommendations.</p>`;
      return;
    }

    dir.innerHTML = categories
      .map((category) => {
        const items = Array.isArray(grouped[category]) ? grouped[category] : [];
        const preview = items.slice(0, 4);
        const cards = preview
          .map((gear) => {
            const img = gear.coverImage
              ? `<img class="gear-card-img" src="${escapeHtml(gear.coverImage)}" alt="" loading="lazy" />`
              : `<div class="gear-card-img gear-card-img-fallback">${escapeHtml(
                  String(gear.category || "?").slice(0, 1)
                )}</div>`;
            const links = (gear.affiliateLinks || [])
              .map(
                (l) =>
                  `<button type="button" class="btn-secondary btn-sm gear-buy" data-url="${escapeHtml(
                    l.url
                  )}">Buy from ${escapeHtml(l.retailer)}${
                    l.price ? ` · ${escapeHtml(l.price)}` : ""
                  }</button>`
              )
              .join("");
            const certified = gear.playboundCertified
              ? `<span class="chip chip-accent">Playbound Certified</span>`
              : "";
            const detailUrl = `https://playbound.club/gear/${encodeURIComponent(
              String(gear.category || "").toLowerCase()
            )}/${encodeURIComponent(gear.slug)}`;
            return `
              <div class="gear-card">
                ${img}
                <div class="gear-card-body">
                  <div class="gear-card-title-row">
                    <button type="button" class="gear-card-title-btn" data-url="${escapeHtml(detailUrl)}">${escapeHtml(
                      gear.title
                    )}</button>
                    ${certified}
                  </div>
                  <p class="gear-card-desc">${escapeHtml(gear.description || "")}</p>
                  <div class="gear-card-actions">${links || `<button type="button" class="btn-secondary btn-sm" data-url="${escapeHtml(
                    detailUrl
                  )}">View on playbound.club</button>`}</div>
                </div>
              </div>
            `;
          })
          .join("");

        return `
          <section class="gear-category-section">
            <div class="gear-category-header">
              <h2 class="gear-category-title">${escapeHtml(category)}</h2>
              <button type="button" class="btn-secondary btn-sm gear-view-all" data-category="${escapeHtml(
                String(category).toLowerCase()
              )}">View all ${escapeHtml(category)} →</button>
            </div>
            <div class="gear-card-grid">${cards}</div>
          </section>
        `;
      })
      .join("");

    dir.querySelectorAll("[data-url]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const url = btn.getAttribute("data-url");
        if (!url) return;
        // Affiliate buy links must not get PlayBound UTMs.
        const skipUtm = btn.classList.contains("gear-buy");
        window.playbound.openExternal(url, skipUtm ? { skipUtm: true } : undefined);
      });
    });
    dir.querySelectorAll(".gear-view-all").forEach((btn) => {
      btn.addEventListener("click", () => {
        const cat = btn.getAttribute("data-category");
        window.playbound.openExternal(`https://playbound.club/gear/${encodeURIComponent(cat || "")}`);
      });
    });
  } catch (err) {
    dir.innerHTML = `<p class="view-sub" style="color: var(--danger)">Failed to load gear: ${escapeHtml(
      err?.message || String(err)
    )}</p>`;
  }
}

/**
 * Populate the library list.
 *
 * This body lost its `function` declaration when the Friends view was inserted
 * above it, leaving a top-level `await` in a file loaded as a classic script —
 * which is a parse error, so the entire renderer failed to load.
 */
async function renderLibraryList() {
  const [installed, installedMods, modsCat] = await Promise.all([
    window.playbound.getInstalled(),
    window.playbound.getInstalledMods?.() || Promise.resolve([]),
    window.playbound.getModsCatalog(),
  ]);
  const modTitles = new Map((modsCat.mods || []).map((m) => [m.slug, m.title]));
  const list = document.getElementById("library-list");
  if (!list) return;
  const hasGames = installed && installed.length > 0;
  const hasMods = installedMods && installedMods.length > 0;

  if (!hasGames && !hasMods) {
    list.innerHTML = `
      <div style="text-align: center; padding: 40px 0; grid-column: 1 / -1;">
        <p class="view-sub">No games yet. Browse the catalog or add one you already installed.</p>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:12px">
          <button class="btn-primary" id="btn-go-games" type="button">Browse Games</button>
          <button class="btn-secondary" id="btn-empty-add" type="button">Add existing game</button>
        </div>
      </div>
    `;
    document.getElementById("btn-go-games")?.addEventListener("click", () => navigateTo("games"));
    document.getElementById("btn-empty-add")?.addEventListener("click", () => {
      void toggleLibraryAddPanel(true);
    });
    return;
  }

  list.replaceChildren();
  const installedSlugs = new Set((installed || []).map((g) => g.slug));

  for (const game of installed || []) {
    const gameMods = (installedMods || []).filter((m) => m.baseGameSlug === game.slug);
    list.appendChild(buildLibraryGameBlock(game, gameMods, modTitles));
  }

  const orphanMods = (installedMods || []).filter(
    (m) => m.baseGameSlug && !installedSlugs.has(m.baseGameSlug)
  );
  const orphansByBase = new Map();
  for (const mod of orphanMods) {
    const key = mod.baseGameSlug;
    if (!orphansByBase.has(key)) orphansByBase.set(key, []);
    orphansByBase.get(key).push(mod);
  }
  for (const [baseSlug, mods] of orphansByBase) {
    const title = baseSlug
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    const fakeGame = {
      slug: baseSlug,
      title,
      blurb: "",
      art: ["#312e81", "#a78bfa"],
      coverImage: null,
      dir: null,
      exe: null,
    };
    list.appendChild(buildLibraryGameBlock(fakeGame, mods, modTitles, { orphan: true }));
  }
}

async function toggleLibraryAddPanel(forceOpen = false) {
  const panel = document.getElementById("library-add-panel");
  if (!panel) return;
  const willOpen = forceOpen || panel.classList.contains("hidden");
  if (!willOpen) {
    panel.classList.add("hidden");
    panel.replaceChildren();
    return;
  }

  panel.classList.remove("hidden");
  panel.innerHTML = `<p class="view-sub">Loading catalog…</p>`;

  const [catalog, installed] = await Promise.all([
    window.playbound.getCatalog(),
    window.playbound.getInstalled(),
  ]);
  const ready = new Set(
    (installed || []).filter((g) => g.exe && !g.pending).map((g) => g.slug)
  );
  const catalogList = Array.isArray(catalog) ? catalog : catalog?.games || [];
  const games = catalogList
    .filter((g) => g?.slug && !ready.has(g.slug))
    .sort((a, b) => String(a.title).localeCompare(String(b.title)));

  panel.innerHTML = `
    <div class="library-add-header">
      <input type="search" id="library-add-search" class="library-add-search" placeholder="Search catalog games…" autocomplete="off" />
      <button type="button" class="btn-secondary btn-sm" id="library-add-close">Close</button>
    </div>
    <div style="margin: 12px 0; padding: 12px; background: rgba(255,255,255,0.04); border: 1px solid var(--border); border-radius: 8px; display: flex; align-items: center; justify-content: space-between; gap: 12px;">
      <div>
        <strong style="display: block; font-size: 13px; color: var(--text, #fff);">Add any game from this ${isMacOS() ? "Mac" : "PC"}</strong>
        <span class="view-sub" style="font-size: 11px; margin: 0;">Add games installed via Steam, Epic Games, or anywhere on disk.</span>
      </div>
      <button type="button" class="btn-primary btn-sm" id="btn-add-custom-exe" style="white-space: nowrap;">Browse ${executableNoun()}</button>
    </div>
    <p class="view-sub" style="margin:8px 0">Or pick a catalog game to locate its installed ${executableNoun()}:</p>
    <div id="library-add-list" class="library-add-list"></div>
  `;

  document.getElementById("btn-add-custom-exe")?.addEventListener("click", async () => {
    try {
      setStatus("Selecting game executable…");
      const res = await window.playbound.addCustomGame();
      if (res?.status === "cancelled") {
        setStatus("Locate cancelled.");
        return;
      }
      setStatus(`${res?.title || "Game"} added to library.`);
      toggleLibraryAddPanel(false);
      renderLibraryView();
    } catch (err) {
      setStatus(err.message || String(err), true);
    }
  });

  const listEl = document.getElementById("library-add-list");
  const searchEl = document.getElementById("library-add-search");

  function paint(filter = "") {
    const q = filter.trim().toLowerCase();
    const filtered = q
      ? games.filter(
          (g) =>
            String(g.title).toLowerCase().includes(q) ||
            String(g.slug).toLowerCase().includes(q)
        )
      : games;
    listEl.replaceChildren();
    if (!filtered.length) {
      listEl.innerHTML = `<p class="view-sub">No matching games.</p>`;
      return;
    }
    for (const game of filtered) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "library-add-row";
      row.innerHTML = `<span class="library-add-row-title">${escapeHtml(game.title)}</span>
        <span class="library-add-row-hint">${selectExecutableLabel()}</span>`;
      row.addEventListener("click", async () => {
        try {
          setStatus(`Locate ${game.title}…`);
          const res = await window.playbound.locateExe(game.slug);
          if (res?.status === "cancelled") {
            setStatus("Locate cancelled.");
            return;
          }
          setStatus(`${game.title} added to library.`);
          renderLibraryView();
        } catch (err) {
          setStatus(err.message || String(err), true);
        }
      });
      listEl.appendChild(row);
    }
  }

  paint();
  searchEl?.addEventListener("input", () => paint(searchEl.value));
  document.getElementById("library-add-close")?.addEventListener("click", () => {
    panel.classList.add("hidden");
    panel.replaceChildren();
  });
  searchEl?.focus();
}

/**
 * A "⋯" button that reveals secondary actions.
 *
 * Library cards had every action as a peer button — Play, Folder, Saves,
 * Display, Remove — so a game with three editions showed sixteen buttons of
 * identical weight, and Remove sat directly beside Play. Collapsing everything
 * except the primary action leaves one obvious thing to click and puts the
 * destructive one behind a deliberate second step.
 *
 * @param {{label: string, onClick: function, danger?: boolean}[]} items
 */
function buildOverflowMenu(items) {
  const wrap = document.createElement("div");
  wrap.className = "action-menu";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "btn-secondary btn-sm action-menu-trigger";
  trigger.setAttribute("aria-haspopup", "true");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-label", "More actions");
  trigger.textContent = "⋯";

  const menu = document.createElement("div");
  menu.className = "action-menu-panel hidden";
  menu.setAttribute("role", "menu");

  for (const item of items) {
    if (!item) continue;
    const entry = document.createElement("button");
    entry.type = "button";
    entry.className = `action-menu-item${item.danger ? " danger" : ""}`;
    entry.setAttribute("role", "menuitem");
    entry.textContent = item.label;
    entry.addEventListener("click", (e) => {
      e.stopPropagation();
      close();
      item.onClick(e);
    });
    menu.appendChild(entry);
  }

  function close() {
    menu.classList.add("hidden");
    trigger.setAttribute("aria-expanded", "false");
    document.removeEventListener("click", onOutside, true);
    document.removeEventListener("keydown", onKey, true);
  }
  function onOutside(e) {
    if (!wrap.contains(e.target)) close();
  }
  function onKey(e) {
    if (e.key === "Escape") close();
  }

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const opening = menu.classList.contains("hidden");
    // Only one menu open at a time, or stale popovers stack up over cards.
    document
      .querySelectorAll(".action-menu-panel:not(.hidden)")
      .forEach((p) => p.classList.add("hidden"));
    if (!opening) {
      close();
      return;
    }
    menu.classList.remove("hidden");
    trigger.setAttribute("aria-expanded", "true");
    document.addEventListener("click", onOutside, true);
    document.addEventListener("keydown", onKey, true);
  });

  wrap.appendChild(trigger);
  wrap.appendChild(menu);
  return wrap;
}

/**
 * The artwork thumbnail for a library row.
 *
 * Falls back to the game's gradient and initial, and does the same if the
 * image fails to load, so a dead cover never leaves an empty rectangle.
 */
/**
 * Whether an edition name tells the player anything.
 *
 * "Official", "Official Vanilla Edition" and friends are what almost every
 * game reports, so showing them adds a line of text to every row that carries
 * no information. Anything else — Project Quarm, Rat King Adventure — is
 * precisely what someone needs to see.
 */
function isMeaningfulEditionName(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return false;
  return !/^(official|default|standard|base|vanilla)\b/i.test(trimmed);
}

function buildLibraryThumb(game) {
  const thumb = document.createElement("div");
  thumb.className = "library-thumb";
  const grad =
    Array.isArray(game.art) && game.art.length >= 2
      ? `linear-gradient(135deg, ${game.art[0]}, ${game.art[1]})`
      : `linear-gradient(135deg, #312e81, #a78bfa)`;
  thumb.style.background = grad;
  thumb.textContent = (game.title || "?").charAt(0);

  if (game.coverImage) {
    const img = document.createElement("img");
    img.src = game.coverImage;
    img.alt = "";
    img.loading = "lazy";
    img.addEventListener("load", () => {
      thumb.textContent = "";
      thumb.appendChild(img);
    });
    img.addEventListener("error", () => img.remove());
  }
  return thumb;
}

/**
 * One installed game, as a single horizontal card.
 *
 * Previously this was a 192px-wide column holding a vertical cover card, then
 * a strip of buttons, then a mods disclosure — three separate boxes that read
 * as unrelated, with no width left for a row of controls. Everything now lives
 * inside one bordered card: art and title on the left, the action for that
 * game on the right, and editions and mods nested beneath a divider so they
 * clearly belong to the game above them rather than floating alongside it.
 */
function buildLibraryGameBlock(game, gameMods, modTitles, opts = {}) {
  const block = document.createElement("div");
  block.className = "library-game-block";
  // State drives the dimming and cursor that used to live on the old card
  // classes, which this layout no longer emits.
  if (opts.orphan) block.classList.add("is-orphan");
  if (game.pending) block.classList.add("is-pending");

  const head = document.createElement("div");
  head.className = "library-card-head";
  head.appendChild(buildLibraryThumb(game));

  const copy = document.createElement("div");
  copy.className = "library-card-copy";

  const subtitle = opts.orphan
    ? "Installed mods only"
    : game.pending
      ? game.scanning
        ? "Scanning for install…"
        : `Install not found yet — ${selectExecutableLabel().toLowerCase()}`
      : [game.genres?.[0], game.approxSize].filter(Boolean).join(" · ");

  copy.innerHTML = `
    <div class="library-card-title">${escapeHtml(game.title)}</div>
    <div class="library-card-sub">${escapeHtml(subtitle || "")}</div>
  `;
  head.appendChild(copy);
  block.appendChild(head);

  if (!opts.orphan) {
    copy.querySelector(".library-card-title")?.addEventListener("click", () =>
      openGameDetail(game.slug, "library")
    );
    copy.querySelector(".library-card-title")?.classList.add("linkish");
  }

  const actions = document.createElement("div");
  actions.className = "library-card-actions";
  if (game.pending) {
    actions.innerHTML = `
      <button class="btn-primary btn-sm btn-lib-locate" type="button">${selectExecutableLabel()}</button>
      <button class="btn-secondary btn-sm btn-lib-dismiss" type="button">Dismiss</button>
    `;
    actions.querySelector(".btn-lib-locate")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        setStatus(`Locate ${game.title}…`);
        const res = await window.playbound.locateExe(game.slug);
        if (res?.status === "cancelled") {
          setStatus("Locate cancelled.");
          return;
        }
        setStatus(`${game.title} added to library.`);
        renderLibraryView();
      } catch (err) {
        setStatus(err.message || String(err), true);
      }
    });
    actions.querySelector(".btn-lib-dismiss")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm(`Remove ${game.title} from Library? (Does not delete game files.)`)) return;
      await window.playbound.dismissPendingInstall?.(game.slug);
      renderLibraryView();
    });
    head.appendChild(actions);
  } else if (!opts.orphan && (game.exe || game.dir || (game.installedEditions || []).length)) {
    const editions = Array.isArray(game.installedEditions)
      ? game.installedEditions.filter((e) => e.exe || e.dir)
      : [];

    /*
     * One row: which edition, then the single thing you came to do, then
     * everything else behind a menu.
     *
     * Editions used to repeat a full button set per edition, so three editions
     * meant three Play buttons, three Folders and three Removes stacked up —
     * and picking the right row was the hard part. A selector makes the choice
     * explicit and leaves exactly one Play on the card.
     */
    let selected = editions[0]?.editionSlug || game.editionSlug || null;
    const selectedEdition = () => editions.find((e) => e.editionSlug === selected) || null;

    if (editions.length > 1) {
      const picker = document.createElement("select");
      picker.className = "library-edition-select";
      picker.setAttribute("aria-label", `Edition of ${game.title}`);
      picker.innerHTML = editions
        .map(
          (ed) =>
            `<option value="${escapeHtml(ed.editionSlug)}">${escapeHtml(
              ed.editionName || ed.editionSlug
            )}</option>`
        )
        .join("");
      picker.value = selected || editions[0].editionSlug;
      picker.addEventListener("click", (e) => e.stopPropagation());
      picker.addEventListener("change", (e) => {
        e.stopPropagation();
        selected = picker.value;
        // A save panel belongs to one edition; drop it rather than let it
        // silently describe a different install than the one now selected.
        block.querySelector(".library-saves-panel")?.remove();
      });
      copy.appendChild(picker);
    } else if (editions.length === 1 && isMeaningfulEditionName(editions[0].editionName)) {
      /*
       * Only when it says something. Nearly every game has exactly one
       * edition called "Official", so printing it on every row was pure
       * noise — the label earns its place only when the player is running
       * something other than the standard build.
       */
      const label = document.createElement("span");
      label.className = "library-edition-label";
      label.title = editions[0].editionName;
      label.textContent = editions[0].editionName;
      copy.appendChild(label);
    }

    const group = document.createElement("div");
    group.className = "library-action-group";

    const play = document.createElement("button");
    play.type = "button";
    play.className = "btn-success btn-sm btn-lib-play";
    play.textContent = "Play";
    play.addEventListener("click", async (e) => {
      e.stopPropagation();
      const ed = editions.length > 1 ? selected : selected || null;
      try {
        setStatus(`Checking Java / launching ${game.title}…`);
        await window.playbound.play(game.slug, null, ed);
        startGameSession(game.slug, game.title);
        setStatus(`Launched ${game.title}`);
      } catch (err) {
        setStatus(err.message || String(err), true);
      }
    });
    group.appendChild(play);

    const menuItems = [];

    menuItems.push({
      label: "Open folder",
      onClick: () => {
        const dir = selectedEdition()?.dir || game.dir || editions[0]?.dir;
        if (dir) window.playbound.openFolder(dir);
        else setStatus("No folder recorded for this install.", true);
      },
    });

    menuItems.push({
      label: "Save backups",
      onClick: () => toggleSavesPanel(block, game, editions.length > 1 ? selected : selected || null),
    });

    if (game.slug === "openciv3") {
      menuItems.push({
        label: "Display settings",
        onClick: () => toggleOpenCiv3DisplayPanel(block, game),
      });
    }

    menuItems.push({
      label: editions.length > 1 ? "Remove this edition" : "Uninstall",
      danger: true,
      onClick: async () => {
        const ed = editions.length > 1 ? selected : selected || null;
        const label =
          editions.length > 1
            ? `${game.title} — ${selectedEdition()?.editionName || ed}`
            : game.title;
        if (!confirm(`Uninstall ${label}?`)) return;
        try {
          await window.playbound.uninstall(game.slug, ed);
          setStatus(`Uninstalled ${label}`);
          renderLibraryView();
        } catch (err) {
          setStatus(err.message || String(err), true);
        }
      },
    });

    group.appendChild(buildOverflowMenu(menuItems));
    actions.appendChild(group);
    head.appendChild(actions);
  }

  if (gameMods.length) {
    // Nested inside the card, under a divider, so mods read as belonging to
    // the game above them rather than as a separate floating panel.
    const extra = document.createElement("div");
    extra.className = "library-card-extra";
    extra.appendChild(buildModsDisclosure(gameMods, modTitles));
    block.appendChild(extra);
  }
  return block;
}

/* ── save backups ──────────────────────────────────────────── */

function formatSaveBytes(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function formatSaveWhen(iso) {
  if (!iso) return "unknown time";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "unknown time";
  const mins = Math.floor((Date.now() - then.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return then.toLocaleDateString();
}

/**
 * Why a snapshot was taken, in words a player recognises.
 *
 * "pre-restore" matters most: it is the copy taken automatically before a
 * restore replaced things, and it is what makes a wrong restore undoable — so
 * it should read as a safety net rather than as noise in the list.
 */
function describeSaveReason(reason) {
  if (!reason) return "";
  if (reason === "after-play") return "after playing";
  if (reason === "manual") return "backed up manually";
  if (reason === "cloud-upload") return "before syncing";
  if (String(reason).startsWith("pre-restore")) return "before a restore";
  return String(reason);
}

/**
 * The cloud row inside the saves panel.
 *
 * Sync is presented as a decision the player makes, never one taken for them.
 * When both this machine and another have moved on since the last sync there is
 * no correct automatic answer — picking the newer one would throw away someone's
 * session on the other device — so that case offers both directions and says
 * what each will do.
 */
async function renderCloudRow(panel, game, editionSlug, refresh) {
  const row = panel.querySelector(".saves-cloud");
  if (!row) return;

  let status;
  try {
    status = await window.playbound.savesSyncStatus(game.slug, editionSlug);
  } catch (err) {
    row.dataset.state = "error";
    row.textContent = `Cloud saves unavailable: ${err.message || err}`;
    return;
  }

  if (!status?.supported) {
    row.remove();
    return;
  }
  if (!status.signedIn) {
    row.dataset.state = "signed-out";
    row.textContent = "Sign in to PlayBound to sync these saves to your other devices.";
    return;
  }
  if (status.error) {
    row.dataset.state = "error";
    row.textContent = `Cloud saves unavailable: ${status.error}`;
    return;
  }

  const action = status.decision?.action || "noop";
  const reason = status.decision?.reason || "";

  const buttons =
    action === "conflict"
      ? `<button class="btn-secondary btn-sm btn-cloud-up" type="button">Upload this PC's</button>
         <button class="btn-secondary btn-sm btn-cloud-down" type="button">Use the cloud copy</button>`
      : action === "upload"
        ? `<button class="btn-secondary btn-sm btn-cloud-up" type="button">Upload</button>`
        : action === "download"
          ? `<button class="btn-secondary btn-sm btn-cloud-down" type="button">Download</button>`
          : `<button class="btn-secondary btn-sm btn-cloud-up" type="button">Upload anyway</button>`;

  row.dataset.state = action;
  row.innerHTML = `
    <div class="saves-cloud-main">
      <span class="saves-cloud-title">${
        action === "conflict" ? "Saves differ between devices" : "Cloud saves"
      }</span>
      <span class="saves-cloud-sub">${escapeHtml(reason)}</span>
    </div>
    <div class="library-action-group">${buttons}</div>`;

  row.querySelector(".btn-cloud-up")?.addEventListener("click", async (e) => {
    e.stopPropagation();
    try {
      setStatus(`Uploading ${game.title} saves…`);
      const res = await window.playbound.savesUpload(game.slug, editionSlug);
      if (res?.status === "too-large") {
        setStatus(res.message || "Saves are too large to sync.", true);
      } else if (res?.status === "no-saves") {
        setStatus("No save files found to upload yet.", true);
      } else {
        setStatus("Saves uploaded.");
      }
      refresh();
    } catch (err) {
      setStatus(err.message || String(err), true);
    }
  });

  row.querySelector(".btn-cloud-down")?.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (
      !confirm(
        `Replace this PC's ${game.title} saves with the cloud copy?\n\n` +
          `Your current saves will be backed up first, so you can undo this.`
      )
    ) {
      return;
    }
    try {
      setStatus(`Downloading ${game.title} saves…`);
      const res = await window.playbound.savesDownload(game.slug, editionSlug, null);
      setStatus(
        res?.status === "none"
          ? "No cloud saves stored for this game yet."
          : "Cloud saves restored. Your previous saves are still in the list."
      );
      refresh();
    } catch (err) {
      setStatus(err.message || String(err), true);
    }
  });
}

/**
 * Show a game's save history, and let the player put one back.
 *
 * Saves are the one thing PlayBound touches that a player cannot replace, so
 * this deliberately explains what will happen before it happens, and says
 * plainly that the current saves are kept.
 */
async function toggleSavesPanel(block, game, editionSlug) {
  const existing = block.querySelector(".library-saves-panel");
  if (existing) {
    existing.remove();
    return;
  }

  const panel = document.createElement("div");
  panel.className = "library-saves-panel";
  panel.innerHTML = `<div class="saves-empty">Loading save history…</div>`;
  block.appendChild(panel);

  let data;
  try {
    data = await window.playbound.savesList(game.slug, editionSlug);
  } catch (err) {
    panel.innerHTML = `<div class="saves-empty">Couldn't read save history: ${escapeHtml(
      err.message || String(err)
    )}</div>`;
    return;
  }

  if (!data?.supported) {
    panel.innerHTML = data?.noLocalSaves
      ? `<div class="saves-empty">
           ${escapeHtml(game.title)} has nothing to back up on this PC. ${escapeHtml(
             data.noLocalSaves
           )}
         </div>`
      : `<div class="saves-empty">
           PlayBound doesn't back up saves for ${escapeHtml(game.title)} yet — we only do it for
           games whose save location we've confirmed, so we never copy or overwrite the wrong folder.
         </div>`;
    return;
  }

  const render = (snapshots) => {
    const rows = snapshots.length
      ? snapshots
          .map(
            (s) => `
        <div class="saves-row">
          <div class="saves-row-main">
            <span class="saves-when">${escapeHtml(formatSaveWhen(s.createdAt))}</span>
            <span class="saves-meta">${escapeHtml(
              [
                s.files ? `${s.files} file${s.files === 1 ? "" : "s"}` : "",
                formatSaveBytes(s.bytes),
                describeSaveReason(s.reason),
              ]
                .filter(Boolean)
                .join(" · ")
            )}</span>
          </div>
          <button class="btn-secondary btn-sm btn-saves-restore" type="button" data-id="${escapeHtml(
            s.id
          )}">Restore</button>
        </div>`
          )
          .join("")
      : `<div class="saves-empty">No backups yet. PlayBound takes one automatically each time you finish playing.</div>`;

    panel.innerHTML = `
      <div class="saves-header">
        <div>
          <div class="saves-title">Save backups</div>
          <div class="saves-sub">Kept on this PC. Restoring always keeps a copy of your current saves first.</div>
        </div>
        <div class="library-action-group">
          <button class="btn-secondary btn-sm btn-saves-now" type="button">Back up now</button>
          <button class="btn-secondary btn-sm btn-saves-folder" type="button">Folder</button>
        </div>
      </div>
      <div class="saves-cloud" data-state="loading">Checking cloud saves…</div>
      <div class="saves-list">${rows}</div>`;

    void renderCloudRow(panel, game, editionSlug, () => render(snapshots));

    panel.querySelector(".btn-saves-now")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        setStatus(`Backing up ${game.title} saves…`);
        const res = await window.playbound.savesSnapshot(game.slug, editionSlug);
        if (res?.status === "no-saves") {
          setStatus("No save files found to back up yet.", true);
        } else if (res?.status === "too-large") {
          setStatus(
            `Saves are ${formatSaveBytes(res.bytes)} — too large to back up automatically.`,
            true
          );
        } else {
          setStatus(`Backed up ${res.files} save file${res.files === 1 ? "" : "s"}.`);
        }
        const fresh = await window.playbound.savesList(game.slug, editionSlug);
        render(fresh.snapshots || []);
      } catch (err) {
        setStatus(err.message || String(err), true);
      }
    });

    panel.querySelector(".btn-saves-folder")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      // Backups are plain copied files, so a player can always recover by hand.
      await window.playbound.savesOpenFolder(game.slug, editionSlug);
    });

    panel.querySelectorAll(".btn-saves-restore").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const when = snapshots.find((s) => s.id === id)?.createdAt;
        if (
          !confirm(
            `Restore ${game.title} saves from ${formatSaveWhen(when)}?\n\n` +
              `Your current saves will be backed up first, so you can undo this.`
          )
        ) {
          return;
        }
        try {
          setStatus(`Restoring ${game.title} saves…`);
          const res = await window.playbound.savesRestore(game.slug, editionSlug, id);
          setStatus(
            res?.safetySnapshot
              ? `Restored ${res.files} file${res.files === 1 ? "" : "s"}. Your previous saves are still in the list.`
              : `Restored ${res?.files ?? 0} file(s).`
          );
          const fresh = await window.playbound.savesList(game.slug, editionSlug);
          render(fresh.snapshots || []);
        } catch (err) {
          setStatus(err.message || String(err), true);
        }
      });
    });
  };

  render(data.snapshots || []);
}

async function toggleOpenCiv3DisplayPanel(block, game) {
  const existing = block.querySelector(".openciv3-display-panel");
  if (existing) {
    existing.remove();
    return;
  }

  const panel = document.createElement("div");
  panel.className = "openciv3-display-panel";
  panel.innerHTML = `<p class="view-sub" style="margin:0">Loading display settings…</p>`;
  block.appendChild(panel);

  let settings;
  try {
    settings = await window.playbound.getOpenCiv3Display();
  } catch (err) {
    panel.innerHTML = `<p class="view-sub" style="margin:0;color:var(--danger,#f87171)">${escapeHtml(err.message || String(err))}</p>`;
    return;
  }

  const presets = Array.isArray(settings?.presets) ? settings.presets : [];
  const width = Number(settings?.width) || 1920;
  const height = Number(settings?.height) || 1080;
  const presetMatch = presets.find((p) => p.width === width && p.height === height);
  const presetOptions = [
    ...presets.map(
      (p) =>
        `<option value="${p.width}x${p.height}" ${
          presetMatch && p.width === width && p.height === height ? "selected" : ""
        }>${escapeHtml(p.label)}</option>`
    ),
    `<option value="custom" ${presetMatch ? "" : "selected"}>Custom…</option>`,
  ].join("");

  panel.innerHTML = `
    <div class="openciv3-display-title">Window resolution</div>
    <p class="view-sub openciv3-display-hint">OpenCiv3 starts small by default. Pick a size — applied on next launch.</p>
    <div class="openciv3-display-label">Preset
      <select id="openciv3-preset" class="openciv3-display-select">${presetOptions}</select>
    </div>
    <div class="openciv3-display-custom">
      <label class="openciv3-display-label">Width
        <input type="number" id="openciv3-width" class="openciv3-display-input" min="640" max="7680" step="1" value="${width}" />
      </label>
      <label class="openciv3-display-label">Height
        <input type="number" id="openciv3-height" class="openciv3-display-input" min="640" max="7680" step="1" value="${height}" />
      </label>
    </div>
    <div class="openciv3-display-actions">
      <button type="button" class="btn-primary btn-sm" id="openciv3-apply">Apply</button>
      <button type="button" class="btn-secondary btn-sm" id="openciv3-close">Close</button>
    </div>
  `;

  const presetEl = panel.querySelector("#openciv3-preset");
  const widthEl = panel.querySelector("#openciv3-width");
  const heightEl = panel.querySelector("#openciv3-height");

  function syncCustomFromPreset() {
    const v = presetEl?.value || "";
    if (v === "custom") return;
    const [w, h] = v.split("x").map(Number);
    if (widthEl && Number.isFinite(w)) widthEl.value = String(w);
    if (heightEl && Number.isFinite(h)) heightEl.value = String(h);
  }

  presetEl?.addEventListener("change", () => {
    syncCustomFromPreset();
  });
  widthEl?.addEventListener("input", () => {
    if (presetEl) presetEl.value = "custom";
  });
  heightEl?.addEventListener("input", () => {
    if (presetEl) presetEl.value = "custom";
  });

  panel.querySelector("#openciv3-close")?.addEventListener("click", (e) => {
    e.stopPropagation();
    panel.remove();
  });

  panel.querySelector("#openciv3-apply")?.addEventListener("click", async (e) => {
    e.stopPropagation();
    const w = Number(widthEl?.value);
    const h = Number(heightEl?.value);
    try {
      await window.playbound.setOpenCiv3Display({ width: w, height: h });
      setStatus(`OpenCiv3 display set to ${w}×${h} — restart the game if it’s running.`);
      panel.remove();
    } catch (err) {
      setStatus(err.message || String(err), true);
    }
  });
}

function buildModsDisclosure(gameMods, modTitles) {
  const wrap = document.createElement("div");
  wrap.className = "library-mods-disclosure";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "library-mods-toggle";
  toggle.setAttribute("aria-expanded", "false");
  toggle.innerHTML = `<span>Mods (${gameMods.length})</span><span class="chevron">▾</span>`;

  const panel = document.createElement("div");
  panel.className = "library-mods-panel hidden";

  for (const mod of gameMods) {
    const title = modTitles.get(mod.slug) || mod.title || mod.slug;
    const row = document.createElement("div");
    row.className = "library-mod-row";
    // Same shape as the game row above it: name, one action, then a menu.
    row.innerHTML = `
      <button type="button" class="library-mod-title linkish" title="${escapeHtml(title)}">${escapeHtml(title)}</button>
      <div class="library-action-group library-mod-actions"></div>
    `;
    row.querySelector(".library-mod-title")?.addEventListener("click", (e) => {
      e.stopPropagation();
      openModDetail(mod.slug, "library");
    });

    const modActions = row.querySelector(".library-mod-actions");
    const modPlay = document.createElement("button");
    modPlay.type = "button";
    modPlay.className = "btn-primary btn-sm btn-mod-play";
    modPlay.textContent = "Play";
    modPlay.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        setStatus(`Launching ${title}…`);
        await window.playbound.playMod(mod.slug);
        setStatus(`Launched ${title}`);
      } catch (err) {
        setStatus(err.message || String(err), true);
      }
    });
    modActions.appendChild(modPlay);

    modActions.appendChild(
      buildOverflowMenu([
        mod.dir
          ? { label: "Open folder", onClick: () => window.playbound.openFolder(mod.dir) }
          : null,
        {
          label: "Remove",
          danger: true,
          onClick: async () => {
            if (!confirm(`Remove mod ${title} from library tracking?`)) return;
            await window.playbound.uninstallMod(mod.slug);
            renderLibraryView();
          },
        },
      ])
    );
    panel.appendChild(row);
  }

  toggle.addEventListener("click", () => {
    const nowHidden = panel.classList.toggle("hidden");
    const open = !nowHidden;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.querySelector(".chevron")?.classList.toggle("open", open);
  });

  wrap.appendChild(toggle);
  wrap.appendChild(panel);
  return wrap;
}

async function renderEditionsView(gameSlugParam) {
  const gameSlug = gameSlugParam || editionsContextSlug();
  const container = views.editions;
  if (!container) return;

  if (!gameSlug) {
    container.innerHTML = `
      <div class="section-header" style="margin-top:0">
        <div>
          <h1 class="view-title" style="margin:0">Editions</h1>
          <p class="view-sub" style="margin:4px 0 0 0">Open a game first to browse its editions.</p>
        </div>
        <button class="btn-secondary btn-sm" id="btn-editions-to-games">Browse games</button>
      </div>
    `;
    document.getElementById("btn-editions-to-games")?.addEventListener("click", () => {
      navigateTo("games");
    });
    return;
  }

  currentDetailSlug = gameSlug;
  updateGamesFamilyNav();

  container.innerHTML = `
    <div class="section-header" style="margin-top:0">
      <div>
        <button type="button" class="btn-secondary btn-sm" id="editions-back-game">← Back to game</button>
        <h1 class="view-title" style="margin:12px 0 0 0">Editions</h1>
        <p class="view-sub" style="margin:4px 0 0 0" id="editions-sub">Loading editions for ${escapeHtml(gameSlug)}…</p>
      </div>
    </div>
    <div id="editions-grid" class="editions-grid" style="margin-top:20px"></div>
  `;

  document.getElementById("editions-back-game")?.addEventListener("click", () => {
    openGameDetail(gameSlug, "games");
  });

  let catalogTitle = gameSlug;
  try {
    const catalogRes = await window.playbound.getCatalog?.();
    const game = (catalogRes?.games || []).find((g) => g.slug === gameSlug);
    if (game?.title) catalogTitle = game.title;
  } catch {
    /* ignore */
  }

  const sub = document.getElementById("editions-sub");
  if (sub) sub.textContent = `Alternate builds, community servers, and versions of ${catalogTitle}.`;

  const grid = document.getElementById("editions-grid");
  try {
    const res = await window.playbound.getEditions?.(gameSlug);
    const editions = res?.editions || [];
    if (!grid) return;
    if (!editions.length) {
      grid.innerHTML = `<p class="view-sub" style="grid-column:1/-1">No editions listed for this game — the default install recipe is used.</p>`;
      return;
    }
    grid.replaceChildren(
      ...editions.map((ed) => {
        const card = document.createElement("div");
        card.className = "edition-card";
        const cover = ed.coverImage || ed.heroImage || "";
        const desc = ed.shortDescription || ed.description || "Alternate edition of this game.";
        card.innerHTML = `
          <div class="edition-card-banner">
            ${cover ? `<img class="edition-card-cover" src="${escapeHtml(cover)}" alt="" loading="lazy" />` : `<span>${escapeHtml((ed.editionName || "?").charAt(0))}</span>`}
            <div class="edition-card-gradient"></div>
          </div>
          <div class="edition-card-body">
            <div class="edition-card-header">
              <h3 class="edition-card-title">${escapeHtml(ed.editionName || ed.editionSlug)}</h3>
              ${ed.isDefault ? `<span class="edition-row-tag">Default</span>` : ""}
            </div>
            <p class="edition-card-desc">${escapeHtml(desc)}</p>
            <div class="edition-card-badges">
              ${ed.editionType ? `<span class="chip">${escapeHtml(ed.editionType)}</span>` : ""}
              ${ed.verificationLevel ? `<span class="chip chip-accent">${escapeHtml(ed.verificationLevel)}</span>` : ""}
              ${ed.version ? `<span class="chip" style="font-size:10px">v${escapeHtml(ed.version)}</span>` : ""}
            </div>
            <div class="edition-card-footer">
              <button type="button" class="btn-primary btn-sm btn-ed-install">Install / Play</button>
              <button type="button" class="btn-secondary btn-sm btn-ed-details">Details →</button>
            </div>
          </div>
        `;
        card.querySelector(".btn-ed-details")?.addEventListener("click", (e) => {
          e.stopPropagation();
          openEditionDetail(gameSlug, ed.editionSlug);
        });
        card.querySelector(".btn-ed-install")?.addEventListener("click", (e) => {
          e.stopPropagation();
          openEditionDetail(gameSlug, ed.editionSlug);
        });
        card.addEventListener("click", () => {
          openEditionDetail(gameSlug, ed.editionSlug);
        });
        return card;
      })
    );
  } catch (err) {
    if (grid) {
      grid.innerHTML = `<p class="view-sub" style="grid-column:1/-1">${escapeHtml(
        err.message || String(err)
      )}</p>`;
    }
  }
}

async function renderModsView() {
  const container = views.mods;
  container.innerHTML = `
    <div class="section-header" style="margin-top: 0">
      <div>
        <h1 class="view-title" style="margin: 0">Mods</h1>
        <p class="view-sub" style="margin: 4px 0 0 0">Browse mods you can install with PlayBound.</p>
      </div>
      <button class="btn-secondary btn-sm" id="btn-open-mods-web">Open playbound.club/mods</button>
    </div>
    <div class="games-filters" id="mods-filters">
      <input type="search" class="input-text" id="mods-search" placeholder="Search mods or games…" />
      <select class="input-text" id="mods-game" aria-label="Filter by game">
        <option value="">All games</option>
      </select>
    </div>
    <p class="view-sub" id="mods-count" style="margin: 10px 0 0 0"></p>
    <div id="mods-grid" class="game-grid" style="margin-top: 16px"></div>
  `;

  document.getElementById("btn-open-mods-web")?.addEventListener("click", () => {
    window.playbound.openExternal("https://playbound.club/mods");
  });

  const res = await window.playbound.getModsCatalog();
  // The API already drops mods whose base game isn't live, so every entry
  // here has a real game behind it — nothing to filter twice.
  const mods = res.mods || [];
  const search = document.getElementById("mods-search");
  const gameSelect = document.getElementById("mods-game");

  const gameOptions = new Map();
  for (const m of mods) {
    if (m.baseGameSlug && !gameOptions.has(m.baseGameSlug)) {
      gameOptions.set(m.baseGameSlug, m.baseGameTitle || m.baseGameSlug);
    }
  }
  [...gameOptions.entries()]
    .sort((a, b) => String(a[1]).localeCompare(String(b[1])))
    .forEach(([slug, title]) => {
      const opt = document.createElement("option");
      opt.value = slug;
      opt.textContent = title;
      gameSelect.appendChild(opt);
    });
  enhanceSelect(gameSelect);
  gameSelect._syncCustomSelect?.();

  const paint = () => {
    const q = (search.value || "").trim().toLowerCase();
    const gameSlug = gameSelect.value;
    let list = mods.slice();
    if (compatibilityFilter === "compatible") {
      list = list.filter(isModDesktopCompatible);
    }
    if (gameSlug) {
      list = list.filter((m) => m.baseGameSlug === gameSlug);
    }
    if (q) {
      list = list.filter((m) =>
        [m.title, m.tagline, m.slug, m.baseGameTitle, m.baseGameSlug]
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }
    list.sort((a, b) => String(a.title).localeCompare(String(b.title)));
    const count = document.getElementById("mods-count");
    if (count) count.textContent = `${list.length} mod${list.length === 1 ? "" : "s"}`;
    const grid = document.getElementById("mods-grid");
    if (!grid) return;
    if (!list.length) {
      grid.innerHTML = `<p class="view-sub" style="grid-column:1/-1">No mods match.</p>`;
      return;
    }
    grid.replaceChildren(
      ...list.map((mod) => {
        const card = document.createElement("div");
        card.className = "game-card";
        const bgGrad =
          Array.isArray(mod.art) && mod.art.length >= 2
            ? `linear-gradient(135deg, ${mod.art[0]}, ${mod.art[1]})`
            : `linear-gradient(135deg, #312e81, #a78bfa)`;
        card.innerHTML = `
          <div class="card-banner" style="background:${bgGrad}">${escapeHtml((mod.title || "?").charAt(0))}</div>
          <div class="card-body">
            <div class="card-title">${escapeHtml(mod.title)}</div>
            <div class="card-blurb">${escapeHtml(mod.tagline || mod.baseGameTitle || mod.baseGameSlug || "")}</div>
            <div class="card-footer">
              <span style="font-size: 11px; color: var(--text-dim);">${escapeHtml([mod.baseGameTitle ? `For ${mod.baseGameTitle}` : (mod.baseGameSlug ? `For ${mod.baseGameSlug}` : null), mod.approxSize].filter(Boolean).join(" · "))}</span>
              <button class="btn-primary btn-sm btn-mod-install" type="button">Install</button>
            </div>
          </div>
        `;
        // Cascade: mod cover → base-game cover → art gradient
        const coverUrl = mod.coverImage || mod.baseGameCoverImage || "";
        const useBaseFallback = !mod.coverImage && Boolean(mod.baseGameCoverImage);
        if (coverUrl) {
          const banner = card.querySelector(".card-banner");
          banner.textContent = "";
          const img = document.createElement("img");
          img.className = "card-cover";
          img.src = coverUrl;
          img.alt = "";
          img.loading = "lazy";
          if (useBaseFallback) img.dataset.source = "base-game";
          banner.appendChild(img);
        }
        card.querySelector(".btn-mod-install")?.addEventListener("click", async (e) => {
          e.stopPropagation();
          try {
            setStatus(`Installing ${mod.title}…`);
            const result = await window.playbound.installMod(mod.slug);
            if (result?.status === "external" || result?.status === "external-opened") {
              setStatus("Opened download page in browser.");
            } else {
              setStatus(`Installed ${mod.title}`);
            }
            setProgress(null);
          } catch (err) {
            setStatus(err.message || String(err), true);
            setProgress(null);
          }
        });
        card.addEventListener("click", (e) => {
          if (e.target.closest("button")) return;
          openModDetail(mod.slug, "mods");
        });
        return card;
      })
    );
  };
  search.addEventListener("input", paint);
  gameSelect.addEventListener("change", paint);
  paint();
}

async function renderEventsView() {
  const container = views.events;
  container.innerHTML = `
    <div class="section-header" style="margin-top: 0">
      <div>
        <h1 class="view-title" style="margin: 0">Events</h1>
        <p class="view-sub" style="margin: 4px 0 0 0">Game Nights and tournaments — join, play, and host.</p>
      </div>
      <div style="display:flex; gap:8px; align-items:center;">
        <button class="btn-primary btn-sm" id="btn-create-event" type="button">+ Create Event</button>
        <button class="btn-secondary btn-sm" id="btn-open-events-web" type="button">Open playbound.club/events</button>
      </div>
    </div>
    <div id="events-banner" class="events-banner" style="margin-top: 16px"></div>
    <div id="events-list" class="events-list" style="margin-top: 20px"></div>

    <!-- Create Event Modal -->
    <div class="modal-overlay" id="modal-create-event">
      <div class="modal-card">
        <div class="modal-header">
          <h2 class="modal-title">Create Event</h2>
          <button type="button" class="modal-close" id="btn-close-create-event">✕</button>
        </div>
        <form id="form-create-event" class="modal-body">
          <div class="form-group">
            <label for="event-title">Event Title *</label>
            <input type="text" class="input-text" id="event-title" required placeholder="e.g. OpenRA Saturday Night Battle" />
          </div>
          <div class="form-row-2">
            <div class="form-group">
              <label for="event-type">Event Type</label>
              <select class="input-text" id="event-type">
                <option value="game_night">Game Night</option>
                <option value="tournament">Tournament</option>
                <option value="release">Showcase / Release</option>
                <option value="meetup">Community Meetup</option>
              </select>
            </div>
            <div class="form-group">
              <label for="event-game">Game</label>
              <select class="input-text" id="event-game">
                <option value="">No specific game</option>
              </select>
            </div>
          </div>
          <div class="form-row-2">
            <div class="form-group">
              <label for="event-starts-at">Starts At *</label>
              <input type="datetime-local" class="input-text" id="event-starts-at" required />
            </div>
            <div class="form-group">
              <label for="event-ends-at">Ends At (optional)</label>
              <input type="datetime-local" class="input-text" id="event-ends-at" />
            </div>
          </div>
          <div class="form-group">
            <label for="event-description">Description *</label>
            <textarea class="input-text" id="event-description" rows="3" required placeholder="Details about this match, rules, voice chat channels, or schedule…"></textarea>
          </div>
          <div class="form-group">
            <label for="event-discord">Discord Invite / Voice Link (optional)</label>
            <input type="url" class="input-text" id="event-discord" placeholder="https://discord.gg/..." />
          </div>

          <div id="tournament-fields" style="display: none;" class="form-row-2">
            <div class="form-group">
              <label for="event-tournament-format">Tournament Format</label>
              <select class="input-text" id="event-tournament-format">
                <option value="single_elim">Single Elimination</option>
                <option value="double_elim">Double Elimination</option>
                <option value="round_robin">Round Robin</option>
                <option value="ffa">Free For All</option>
              </select>
            </div>
            <div class="form-group">
              <label for="event-team-size">Team Size</label>
              <select class="input-text" id="event-team-size">
                <option value="1">1v1 (Solo)</option>
                <option value="2">2v2 (Duos)</option>
                <option value="3">3v3 (Trios)</option>
                <option value="4">4v4 (Squads)</option>
              </select>
            </div>
          </div>

          <p id="create-event-error" class="view-sub" style="color:var(--danger); display:none; margin:0"></p>

          <div class="modal-actions">
            <button type="button" class="btn-secondary" id="btn-cancel-create-event">Cancel</button>
            <button type="submit" class="btn-primary" id="btn-submit-create-event">Create Event</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.getElementById("btn-open-events-web")?.addEventListener("click", () => {
    window.playbound.openExternal("https://playbound.club/events");
  });

  // Modal controls
  const modal = document.getElementById("modal-create-event");
  const openBtn = document.getElementById("btn-create-event");
  const closeBtn = document.getElementById("btn-close-create-event");
  const cancelBtn = document.getElementById("btn-cancel-create-event");
  const typeSelect = document.getElementById("event-type");
  const gameSelect = document.getElementById("event-game");
  const tournamentFields = document.getElementById("tournament-fields");
  const form = document.getElementById("form-create-event");
  const errorMsg = document.getElementById("create-event-error");

  // Populate games dropdown
  try {
    const catalog = await window.playbound.getCatalog();
    (catalog || []).forEach((g) => {
      const opt = document.createElement("option");
      opt.value = g.slug;
      opt.textContent = g.title;
      gameSelect.appendChild(opt);
    });
    enhanceSelect(gameSelect);
    gameSelect._syncCustomSelect?.();
  } catch {}

  enhanceSelect(typeSelect);
  enhanceSelect(document.getElementById("event-tournament-format"));
  enhanceSelect(document.getElementById("event-team-size"));

  const closeModal = () => {
    modal.classList.remove("open");
    if (errorMsg) errorMsg.style.display = "none";
  };

  openBtn?.addEventListener("click", () => {
    // Set default startsAt to next full hour
    const now = new Date();
    now.setHours(now.getHours() + 1, 0, 0, 0);
    const localIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    const startsInput = document.getElementById("event-starts-at");
    if (startsInput && !startsInput.value) startsInput.value = localIso;
    modal.classList.add("open");
  });

  closeBtn?.addEventListener("click", closeModal);
  cancelBtn?.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  typeSelect?.addEventListener("change", () => {
    if (tournamentFields) {
      tournamentFields.style.display = typeSelect.value === "tournament" ? "grid" : "none";
    }
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = document.getElementById("event-title").value.trim();
    const description = document.getElementById("event-description").value.trim();
    const eventType = typeSelect.value;
    const gameSlug = gameSelect.value || null;
    const startsAtVal = document.getElementById("event-starts-at").value;
    const endsAtVal = document.getElementById("event-ends-at").value;
    const discord = document.getElementById("event-discord").value.trim();

    if (!title || !description || !startsAtVal) {
      if (errorMsg) {
        errorMsg.textContent = "Please fill in all required fields.";
        errorMsg.style.display = "block";
      }
      return;
    }

    const startsAtIso = new Date(startsAtVal).toISOString();
    const endsAtIso = endsAtVal ? new Date(endsAtVal).toISOString() : null;
    const submitBtn = document.getElementById("btn-submit-create-event");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Creating…";
    }
    if (errorMsg) errorMsg.style.display = "none";

    const payload = {
      title,
      description,
      eventType,
      gameSlug,
      startsAt: startsAtIso,
      endsAt: endsAtIso,
      discordInviteUrl: discord || null,
      status: "registration_open",
      ...(eventType === "tournament"
        ? {
            tournamentFormat: document.getElementById("event-tournament-format")?.value || "single_elim",
            teamSize: Number(document.getElementById("event-team-size")?.value) || 1,
            checkInRequired: true,
          }
        : {}),
    };

    const res = await window.playbound.createEvent(payload);
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Create Event";
    }

    if (res && res.ok) {
      closeModal();
      notifyStatus(`Event "${title}" created!`);
      await renderEventsView();
    } else {
      if (errorMsg) {
        errorMsg.textContent = res?.error || "Failed to create event. Make sure you are signed in from Settings.";
        errorMsg.style.display = "block";
      }
    }
  });

  const res = (await window.playbound.getEvents?.()) || { events: [] };
  const events = res.events || [];
  const list = document.getElementById("events-list");
  const banner = document.getElementById("events-banner");
  if (!events.length) {
    list.innerHTML = `<p class="view-sub">No upcoming events. Host one with + Create Event above!</p>`;
    return;
  }

  const live = events.find((ev) => ev.status === "live");
  const soon = events.find((ev) => {
    if (!ev.startsAt) return false;
    const ms = new Date(ev.startsAt).getTime() - Date.now();
    return ms > 0 && ms < 60 * 60 * 1000;
  });
  if (banner && (live || soon)) {
    const ev = live || soon;
    const href = ev.id
      ? `https://playbound.club/events/${encodeURIComponent(ev.id)}`
      : "https://playbound.club/events";
    banner.innerHTML = `
      <div class="event-row" style="border-color: var(--primary)">
        <div>
          <p class="event-when">${live ? "🔴 LIVE NOW" : "Starts within an hour"}</p>
          <p class="event-title">${escapeHtml(ev.title)}</p>
          <p class="event-desc">${escapeHtml(ev.gameSlug || "")}${
      ev.counts?.going != null ? ` · ${ev.counts.going} going` : ""
    }</p>
        </div>
        <button class="btn-primary btn-sm" type="button" id="btn-event-banner">${
          live ? "Join" : "View Event"
        }</button>
      </div>
    `;
    document.getElementById("btn-event-banner")?.addEventListener("click", () => {
      window.playbound.openExternal(href);
    });
  }

  list.replaceChildren();
  for (const ev of events) {
    const row = document.createElement("div");
    row.className = "event-row";
    const when =
      ev.when?.dateLine && ev.when?.timeLine
        ? `${ev.when.dateLine} · ${ev.when.timeLine}`
        : ev.startsAt
          ? new Date(ev.startsAt).toLocaleString()
          : "";
    const href = ev.id
      ? `https://playbound.club/events/${encodeURIComponent(ev.id)}`
      : "https://playbound.club/events";
    row.innerHTML = `
      <div>
        <p class="event-when">${escapeHtml(when)}${
      ev.status === "live" ? " · LIVE" : ""
    }</p>
        <p class="event-title">${escapeHtml(ev.title)}</p>
        <p class="event-desc">${escapeHtml(ev.description || "")}</p>
        ${
          ev.gameSlug
            ? `<p class="event-game">${escapeHtml(ev.gameSlug)}${
                ev.counts?.going != null ? ` · ${ev.counts.going} going` : ""
              }</p>`
            : ""
        }
      </div>
      <button class="btn-secondary btn-sm" type="button">View Event</button>
    `;
    row.querySelector("button")?.addEventListener("click", () => {
      window.playbound.openExternal(href);
    });
    list.appendChild(row);
  }
}

// ── Servers (Game + Mod dropdowns) ───────────────────────────

async function renderServersView() {
  const container = views.servers;
  container.innerHTML = `
    <div class="section-header" style="margin-top: 0">
      <div>
        <h1 class="view-title" style="margin: 0">Server Browser</h1>
        <p class="view-sub" style="margin: 4px 0 0 0">Live multiplayer for PlayBound titles — host ping from this PC.</p>
      </div>
      <button class="btn-secondary btn-sm" id="servers-refresh">Refresh</button>
    </div>

    <div class="servers-toolbar">
      <div class="servers-field">
        <span class="servers-field-label">Game</span>
        <select class="input-text" id="servers-game" aria-label="Base game"></select>
      </div>
      <div class="servers-field">
        <span class="servers-field-label">Mod</span>
        <select class="input-text" id="servers-mod" aria-label="Mod"></select>
      </div>
      <div class="servers-field servers-field-grow">
        <span class="servers-field-label">Search</span>
        <input type="search" class="input-text" id="servers-search" placeholder="Name, map, players…" value="${escapeHtml(serversState.search)}" />
      </div>
      <label class="filter-check servers-installed-check"><input type="checkbox" id="servers-installed-only" ${serversState.installedOnly ? "checked" : ""} /> Installed only</label>
    </div>
    <p class="view-sub" id="servers-note" style="margin-top: 8px"></p>
    <p class="servers-stats" id="servers-stats"></p>
    <div id="servers-table-wrap"><p class="view-sub">Loading…</p></div>
  `;

  document.getElementById("servers-refresh").addEventListener("click", () => {
    serversState.pingById = {};
    renderServersView();
  });
  document.getElementById("servers-search").addEventListener("input", (e) => {
    serversState.search = e.target.value;
    paintServersTable();
  });
  document.getElementById("servers-installed-only").addEventListener("change", (e) => {
    serversState.installedOnly = e.target.checked;
    serversState.pingById = {};
    void refreshServersPickersAndList();
  });

  await loadServersBrowser();
}

let _serversCache = { slug: null, servers: [], title: "", note: "", error: "" };

function fillModDropdown(baseSlug) {
  const modSelect = document.getElementById("servers-mod");
  if (!modSelect) return;
  let modsForGame = (_modsCatalog || []).filter(
    (m) =>
      m.baseGameSlug === baseSlug &&
      (m.baseSupported || m.baseHasServers) &&
      (compatibilityFilter !== "compatible" || isModDesktopCompatible(m))
  );
  if (serversState.installedOnly) {
    const installedModSlugs = new Set(
      (_installedModsList || []).filter((m) => m.baseGameSlug === baseSlug).map((m) => m.slug)
    );
    modsForGame = modsForGame.filter((m) => installedModSlugs.has(m.slug));
  }
  if (
    serversState.selectedModSlug &&
    !modsForGame.some((m) => m.slug === serversState.selectedModSlug)
  ) {
    serversState.selectedModSlug = "";
  }
  const options = [`<option value="">Base game</option>`].concat(
    modsForGame.map(
      (m) =>
        `<option value="${escapeHtml(m.slug)}" ${m.slug === serversState.selectedModSlug ? "selected" : ""}>${escapeHtml(m.title)}</option>`
    )
  );
  modSelect.innerHTML = options.join("");
  modSelect.value = serversState.selectedModSlug || "";
  enhanceSelect(modSelect);
  modSelect._syncCustomSelect?.();
}

function selectedModOrNull() {
  if (!serversState.selectedModSlug) return null;
  return (_modsCatalog || []).find((m) => m.slug === serversState.selectedModSlug) || null;
}

function gamesForServerPicker() {
  let list = _supportedServerGames.slice();
  if (serversState.installedOnly) {
    list = list.filter((g) => _installedGameSlugs.has(g.slug));
  }
  return list;
}

async function refreshServersPickersAndList() {
  const gameSelect = document.getElementById("servers-game");
  const note = document.getElementById("servers-note");
  const supported = gamesForServerPicker();

  if (!supported.length) {
    document.getElementById("servers-table-wrap").innerHTML = serversState.installedOnly
      ? `<p class="view-sub">No installed games have live server browsers. Install a multiplayer title, or turn off Installed only.</p>`
      : `<p class="view-sub">No server providers available right now.</p>`;
    if (gameSelect) {
      gameSelect.innerHTML = "";
      enhanceSelect(gameSelect);
      gameSelect._syncCustomSelect?.();
    }
    fillModDropdown("");
    if (note) {
      note.textContent = "";
      note.dataset.baseNote = "";
    }
    return;
  }

  if (!serversState.selectedSlug || !supported.some((g) => g.slug === serversState.selectedSlug)) {
    serversState.selectedSlug = "";
    serversState.selectedModSlug = "";
  }

  gameSelect.innerHTML =
    `<option value="" disabled ${!serversState.selectedSlug ? "selected" : ""}>Select a game...</option>` +
    supported
      .map(
        (g) =>
          `<option value="${escapeHtml(g.slug)}" ${g.slug === serversState.selectedSlug ? "selected" : ""}>${escapeHtml(g.title)}${g.testing ? " · Testing" : ""}</option>`
      )
      .join("");

  enhanceSelect(gameSelect);
  gameSelect._syncCustomSelect?.();

  fillModDropdown(serversState.selectedSlug);

  const totalSupported = _supportedServerGames.length;
  note.textContent = serversState.installedOnly
    ? `Showing ${supported.length} installed title(s) with live browsers.`
    : `${totalSupported} live browser(s).`;
  note.dataset.baseNote = note.textContent;

  await fetchAndShowServers(serversState.selectedSlug, selectedModOrNull());
}

async function loadServersBrowser() {
  const [index, modsRes, installed, installedMods] = await Promise.all([
    window.playbound.getServerIndex(),
    window.playbound.getModsCatalog(),
    window.playbound.getInstalled(),
    window.playbound.getInstalledMods?.() || Promise.resolve([]),
  ]);
  _modsCatalog = Array.isArray(modsRes.mods) ? modsRes.mods : [];
  _supportedServerGames = (Array.isArray(index.games) ? index.games : []).filter((g) => g.supported);
  _installedGameSlugs = new Set((installed || []).map((g) => g.slug));
  _installedModsList = installedMods || [];

  const gameSelect = document.getElementById("servers-game");
  gameSelect.onchange = () => {
    serversState.selectedSlug = gameSelect.value;
    serversState.selectedModSlug = "";
    serversState.pingById = {};
    fillModDropdown(serversState.selectedSlug);
    void fetchAndShowServers(serversState.selectedSlug, null);
  };

  document.getElementById("servers-mod").onchange = (e) => {
    serversState.selectedModSlug = e.target.value || "";
    serversState.pingById = {};
    void fetchAndShowServers(serversState.selectedSlug, selectedModOrNull());
  };

  await refreshServersPickersAndList();
}

async function fetchAndShowServers(baseSlug, mod) {
  const wrap = document.getElementById("servers-table-wrap");
  if (!wrap) return;

  if (!baseSlug) {
    wrap.innerHTML = `<div class="empty-hint">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-server">
          <rect width="20" height="8" x="2" y="2" rx="2" ry="2"/>
          <rect width="20" height="8" x="2" y="14" rx="2" ry="2"/>
          <line x1="6" x2="6.01" y1="6" y2="6"/>
          <line x1="6" x2="6.01" y1="18" y2="18"/>
        </svg>
        <p>Pick a game above to see who's playing right now.</p>
      </div>`;
    return;
  }

  wrap.innerHTML = `<p class="view-sub">Fetching servers…</p>`;

  const data = await window.playbound.getServers(baseSlug);
  let servers = Array.isArray(data.servers) ? data.servers : [];
  let noteExtra = "";

  if (mod) {
    const filtered = filterServersForMod(servers, mod);
    if (filtered.matched) {
      servers = filtered.servers;
      noteExtra = `Showing ${servers.length} server(s) matching ${mod.title}.`;
    } else {
      noteExtra = `No gameType match for ${mod.title} — showing all ${baseSlug} servers.`;
    }
  }

  if (!data.supported) {
    wrap.innerHTML = `<p class="view-sub">Server lists are not available for this title yet.</p>`;
    return;
  }

  _serversCache = {
    slug: baseSlug,
    servers,
    title: mod?.title || baseSlug,
    note: noteExtra,
    error: data.error || "",
  };

  const noteEl = document.getElementById("servers-note");
  if (noteEl) {
    const prev = (noteEl.dataset.baseNote || noteEl.textContent || "").trim();
    if (!noteEl.dataset.baseNote) noteEl.dataset.baseNote = prev;
    const errNote = data.error ? `Couldn’t refresh live list: ${data.error}` : "";
    noteEl.textContent = [noteEl.dataset.baseNote, noteExtra, errNote].filter(Boolean).join(" ").trim();
  }

  paintServersTable();
  void pingVisibleServers();
}

function filterServersForMod(servers, mod) {
  const needles = [mod.slug, mod.title]
    .map((s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, ""))
    .filter(Boolean);
  const matched = servers.filter((s) => {
    const gt = String(s.gameType || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (!gt) return false;
    return needles.some((n) => gt.includes(n) || n.includes(gt));
  });
  if (matched.length > 0) return { matched: true, servers: matched };
  return { matched: false, servers };
}

function filteredServerRows() {
  const q = serversState.search.trim().toLowerCase();
  let rows = _serversCache.servers || [];
  if (q) {
    rows = rows.filter((s) => {
      const blob = `${s.name || ""} ${s.map || ""} ${s.players ?? ""}/${s.maxPlayers ?? ""} ${s.gameType || ""}`.toLowerCase();
      return blob.includes(q);
    });
  }

  const { sort, sortDir } = serversState;
  const dir = sortDir === "asc" ? 1 : -1;
  return rows.slice().sort((a, b) => {
    if (sort === "players") {
      return dir * ((Number(a.players) || 0) - (Number(b.players) || 0));
    }
    if (sort === "ping") {
      const idA = `${a.host}:${a.port}`;
      const idB = `${b.host}:${b.port}`;
      const pa = serversState.pingById[idA];
      const pb = serversState.pingById[idB];
      const aMissing = pa === undefined || pa == null;
      const bMissing = pb === undefined || pb == null;
      if (aMissing && bMissing) return 0;
      if (aMissing) return 1;
      if (bMissing) return -1;
      return dir * (pa - pb);
    }
    let av = "";
    let bv = "";
    if (sort === "name") {
      av = a.name || "";
      bv = b.name || "";
    } else if (sort === "map") {
      av = a.map || a.gameType || "";
      bv = b.map || b.gameType || "";
    } else {
      av = formatServerLocation(a);
      bv = formatServerLocation(b);
    }
    return dir * String(av).localeCompare(String(bv), undefined, { sensitivity: "base" });
  });
}

function setServersSort(key) {
  if (serversState.sort === key) {
    serversState.sortDir = serversState.sortDir === "asc" ? "desc" : "asc";
  } else {
    serversState.sort = key;
    serversState.sortDir = SERVER_SORT_DEFAULT_DIR[key] || "asc";
  }
  paintServersTable();
}

function serverSortHeader(key, label, title) {
  const active = serversState.sort === key;
  const arrow = active ? (serversState.sortDir === "asc" ? " ↑" : " ↓") : "";
  const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
  return `<th class="sortable${active ? " sorted" : ""}" data-sort="${key}"${titleAttr}>${escapeHtml(label)}${arrow}</th>`;
}

function updateServersStats(rows) {
  const el = document.getElementById("servers-stats");
  if (!el) return;
  if (!_serversCache.slug) {
    el.textContent = "";
    return;
  }
  const totalPlayers = rows.reduce((sum, s) => sum + (Number(s.players) || 0), 0);
  el.textContent = `${totalPlayers} player${totalPlayers === 1 ? "" : "s"} · ${rows.length} server${rows.length === 1 ? "" : "s"}`;
}

function formatServerLocation(server) {
  const loc = server?.location;
  if (!loc) return "—";
  const code = String(loc.countryCode || "").toUpperCase();
  if (loc.region && String(loc.region).length > 2) return String(loc.region);
  if (code && code !== "ZZ" && code !== "XX") return code;
  return "—";
}

function paintServersTable() {
  const wrap = document.getElementById("servers-table-wrap");
  if (!wrap || !_serversCache.slug) return;

  const rows = filteredServerRows();
  updateServersStats(rows);

  if (!rows.length) {
    const err = _serversCache.error
      ? `<p class="view-sub" style="color: var(--danger, #f87171)">${escapeHtml(_serversCache.error)}</p>`
      : "";
    wrap.innerHTML = `${err}<p class="view-sub">No servers match.</p>`;
    return;
  }

  const table = document.createElement("table");
  table.className = "server-table";
  table.innerHTML = `
    <thead>
      <tr>
        ${serverSortHeader("name", "Server Name")}
        ${serverSortHeader("players", "Players")}
        ${serverSortHeader("map", "Map / Mode")}
        ${serverSortHeader("location", "Location")}
        ${serverSortHeader("ping", "Ping", "Host ping from this PC (ICMP, or TCP 443/80 fallback)")}
        <th>Action</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector("tbody");

  for (const s of rows) {
    const id = `${s.host}:${s.port}`;
    const ping = serversState.pingById[id];
    const pingLabel =
      ping === undefined ? "…" : ping == null ? "—" : `${ping} ms`;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${escapeHtml(s.name)}</strong>${s.gameType ? `<div class="server-meta">${escapeHtml(s.gameType)}</div>` : ""}</td>
      <td>${s.players == null ? "—" : `${s.players}/${s.maxPlayers ?? "—"}`}</td>
      <td>${escapeHtml(s.map || "—")}</td>
      <td>${escapeHtml(formatServerLocation(s))}</td>
      <td class="ping-cell" data-ping-id="${escapeHtml(id)}">${pingLabel}</td>
      <td>
        <button class="btn-primary btn-sm btn-join" data-slug="${escapeHtml(_serversCache.slug)}" data-host="${escapeHtml(s.host)}" data-port="${Number(s.port) || 0}">Join</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  wrap.replaceChildren(table);

  wrap.querySelectorAll("th.sortable").forEach((th) => {
    th.addEventListener("click", () => setServersSort(th.dataset.sort));
  });

  wrap.querySelectorAll(".btn-join").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const slug = btn.dataset.slug;
      const host = btn.dataset.host;
      const port = Number(btn.dataset.port);
      const installed = await window.playbound.getInstalled();
      const has = (installed || []).some((g) => g.slug === slug);
      if (!has) {
        const go = confirm(`${slug} is not installed. Install now?`);
        if (!go) return;
        setStatus(`Installing ${slug}…`);
        try {
          const res = await window.playbound.install(slug);
          if (res.status === "installer-opened") {
            setStatus("Installer opened — waiting for installer to finish…");
            setProgress(null);
            openGameDetail(slug, currentView);
            return;
          }
        } catch (err) {
          setStatus(err.message || String(err), true);
          return;
        }
      }
      setStatus(`Joining ${host}:${port}…`);
      try {
        await window.playbound.play(slug, { host, port });
        startGameSession(slug, slug);
      } catch (err) {
        setStatus(err.message || String(err), true);
      }
    });
  });
}

async function pingVisibleServers() {
  const servers = _serversCache.servers || [];
  if (!servers.length || !window.playbound.pingHosts) return;
  const hosts = servers.map((s) => ({
    id: `${s.host}:${s.port}`,
    host: s.host,
    port: s.port,
  }));
  try {
    const results = await window.playbound.pingHosts(hosts);
    for (const r of results || []) {
      if (r?.id != null) serversState.pingById[r.id] = r.ms;
    }
    paintServersTable();
  } catch {
    /* ignore */
  }
}

// ── Games catalog ────────────────────────────────────────────

async function renderGamesView() {
  const container = views.games;
  container.innerHTML = `
    <div class="section-header" style="margin-top: 0">
      <div>
        <h1 class="view-title" style="margin: 0">Games</h1>
        <p class="view-sub" style="margin: 4px 0 0 0">Browse free PC games you can install with PlayBound.</p>
      </div>
      <button class="btn-secondary btn-sm" id="btn-open-web">Open playbound.club</button>
    </div>

    <div class="games-filters" id="games-filters">
      <input type="search" class="input-text" id="games-search" placeholder="Search title, tagline, tags…" value="${escapeHtml(gamesFilters.query)}" />
      <select class="input-text" id="games-genre">
        <option value="">All genres</option>
      </select>
      <select class="input-text" id="games-sort">
        <option value="name" ${gamesFilters.sort === "name" ? "selected" : ""}>Sort: Name</option>
        <option value="size" ${gamesFilters.sort === "size" ? "selected" : ""}>Sort: Size</option>
      </select>
      <label class="filter-check"><input type="checkbox" id="games-mp" ${gamesFilters.multiplayerOnly ? "checked" : ""} /> Multiplayer</label>
      <label class="filter-check"><input type="checkbox" id="games-installable" ${gamesFilters.installableOnly ? "checked" : ""} /> Installable</label>
    </div>
    <p class="view-sub" id="games-count" style="margin: 10px 0 0 0"></p>
    <div id="games-grid" class="game-grid" style="margin-top: 16px"></div>
  `;

  document.getElementById("btn-open-web").addEventListener("click", () => {
    window.playbound.openExternal("https://playbound.club/discover");
  });

  const catalog = await window.playbound.getCatalog();
  const genreSet = new Set();
  for (const g of catalog) {
    for (const genre of g.genres || []) genreSet.add(genre);
  }
  const genreSelect = document.getElementById("games-genre");
  [...genreSet].sort().forEach((genre) => {
    const opt = document.createElement("option");
    opt.value = genre;
    opt.textContent = genre;
    if (gamesFilters.genre === genre) opt.selected = true;
    genreSelect.appendChild(opt);
  });
  enhanceSelect(genreSelect);
  genreSelect._syncCustomSelect?.();

  const apply = () => paintGamesGrid(catalog);
  document.getElementById("games-search").addEventListener("input", (e) => {
    gamesFilters.query = e.target.value;
    apply();
  });
  genreSelect.addEventListener("change", (e) => {
    gamesFilters.genre = e.target.value;
    apply();
  });
  document.getElementById("games-sort").addEventListener("change", (e) => {
    gamesFilters.sort = e.target.value;
    apply();
  });
  document.getElementById("games-mp").addEventListener("change", (e) => {
    gamesFilters.multiplayerOnly = e.target.checked;
    apply();
  });
  document.getElementById("games-installable").addEventListener("change", (e) => {
    gamesFilters.installableOnly = e.target.checked;
    apply();
  });

  paintGamesGrid(catalog);
}

function parseSizeMB(label) {
  if (!label) return 0;
  const m = String(label).match(/([\d.]+)\s*(GB|MB)/i);
  if (!m) return 0;
  const n = Number(m[1]);
  return /gb/i.test(m[2]) ? n * 1000 : n;
}

function paintGamesGrid(catalog) {
  const q = gamesFilters.query.trim().toLowerCase();
  let list = filterByCompatibility(catalog.slice());

  if (q) {
    list = list.filter((g) => {
      const blob = [
        g.title,
        g.blurb,
        ...(g.tags || []),
        ...(g.genres || []),
        g.slug,
      ]
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }
  if (gamesFilters.genre) {
    list = list.filter((g) => (g.genres || []).includes(gamesFilters.genre));
  }
  if (gamesFilters.multiplayerOnly) {
    list = list.filter((g) => g.multiplayer);
  }
  if (gamesFilters.installableOnly) {
    list = list.filter((g) => g.kind && g.kind !== "external");
  }

  if (gamesFilters.sort === "size") {
    list.sort((a, b) => parseSizeMB(b.approxSize) - parseSizeMB(a.approxSize));
  } else {
    list.sort((a, b) => String(a.title).localeCompare(String(b.title)));
  }

  const count = document.getElementById("games-count");
  if (count) count.textContent = `${list.length} game${list.length === 1 ? "" : "s"}`;

  const grid = document.getElementById("games-grid");
  if (!grid) return;
  if (!list.length) {
    grid.innerHTML = `<p class="view-sub" style="grid-column:1/-1">No games match your filters.</p>`;
    return;
  }
  grid.replaceChildren(...list.map(createGameCard));
}

async function renderSettingsView() {
  const container = views.settings;
  try {
    accountState = await window.playbound.getAccount();
  } catch {
    /* keep previous */
  }
  const settings = await window.playbound.getSettings();
  const ver = window.playbound.getAppVersion
    ? await window.playbound.getAppVersion()
    : { version: settings.version, packaged: settings.packaged };
  const version = ver?.version || settings.version || "—";
  const packaged = Boolean(ver?.packaged ?? settings.packaged);
  const ready = updateStatus.phase === "ready";
  const canUseAdminChannel = Boolean(
    accountState.canUseAdminChannel || settings.canUseAdminChannel
  );
  const channelPref = settings.updateChannelPref === "latest" ? "latest" : "admin";
  const activeChannel =
    settings.updateChannel === "latest" ? "latest" : canUseAdminChannel ? "admin" : "latest";
  const updateHint = !packaged
    ? "Auto-update runs in installed builds only."
    : ready
      ? `Version ${updateStatus.version} downloaded.`
      : updateStatus.phase === "downloading"
        ? `Downloading… ${updateStatus.percent || 0}%`
        : ver?.updateAvailable
          ? `Update ${ver.updateAvailable.version} available.`
          : "You're on the latest build (or check to confirm).";

  container.innerHTML = `
    <h1 class="view-title">Settings</h1>
    <p class="view-sub">Manage launcher preferences and site connection.</p>

    <div class="settings-group">
      <label class="settings-label">Account</label>
      <p class="settings-hint">Sign in once — installs sync to your playbound.club library automatically.</p>
      <div style="display: flex; gap: 10px; align-items: center;">
        <span class="dot ${accountState.connected ? "online" : ""}"></span>
        <span style="font-size: 13px; font-weight: 600;">${
          accountState.connected
            ? `Signed in${accountState.username || accountState.email ? ` · ${escapeHtml(accountState.username || accountState.email)}` : ""}`
            : "Not signed in"
        }</span>
      </div>
      <div style="margin-top: 14px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
        <button class="btn-primary btn-sm" id="set-btn-signin">${accountState.connected ? "Switch account" : "Sign in"}</button>
        ${accountState.connected ? '<button class="btn-danger btn-sm" id="set-btn-signout">Sign out</button>' : '<button type="button" class="btn-secondary btn-sm" id="set-btn-forgot">Forgot password</button>'}
      </div>
    </div>

    <div class="settings-group">
      <label class="settings-label">Default Installation Directory</label>
      <p class="settings-hint">Where games will be installed when using one-click downloads.</p>
      <input type="text" class="input-text" id="set-games-dir" value="${escapeHtml(settings.gamesDir)}" readonly />
      <div style="margin-top: 10px;">
        <button class="btn-secondary btn-sm" id="set-btn-dir">Change Directory</button>
      </div>
    </div>

    <div class="settings-group">
      <label class="settings-label">Updates</label>
      <p class="settings-hint">Current version: <strong>${escapeHtml(version)}</strong>. <span id="set-update-hint">${escapeHtml(updateHint)}</span> First install still uses Setup from the site; later updates install in-app. Unsigned builds may show SmartScreen.</p>
      ${
        canUseAdminChannel
          ? `<div style="margin-top: 12px;">
        <p class="settings-hint" style="margin-bottom: 8px;">Update channel for testers and admins — choose which feed Check for updates uses.</p>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button type="button" class="btn-sm ${channelPref === "admin" ? "btn-primary" : "btn-secondary"}" data-channel="admin" id="set-channel-admin">Unsigned (testing)</button>
          <button type="button" class="btn-sm ${channelPref === "latest" ? "btn-primary" : "btn-secondary"}" data-channel="latest" id="set-channel-latest">Signed (release)</button>
        </div>
        <p class="settings-hint" style="margin-top: 8px;">Active: <strong>${escapeHtml(activeChannel === "latest" ? "signed (latest)" : "unsigned (admin)")}</strong></p>
      </div>`
          : ""
      }
      <div style="margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap;">
        <button class="btn-secondary btn-sm" id="set-btn-check-update" ${packaged ? "" : "disabled"}>Check for updates</button>
        <button class="btn-primary btn-sm" id="set-btn-install-update" ${ready ? "" : "disabled"}>Install and restart</button>
      </div>
    </div>

    <div class="settings-group">
      <label class="settings-label">Your Gaming PC</label>
      <p class="settings-hint">Used to check game compatibility on playbound.club. Synced when you sign in.</p>
      <div id="set-hw-summary" style="margin-top: 8px; font-size: 13px; line-height: 1.5; color: var(--text-muted);">Loading…</div>
      <div style="margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap;">
        <button class="btn-secondary btn-sm" id="set-btn-hw-refresh" ${accountState.connected ? "" : "disabled"}>Sync now</button>
      </div>
    </div>

    <div class="settings-group">
      <label class="settings-label">Java runtime</label>
      <p class="settings-hint">Needed for jar games like Mindustry. PlayBound can install a private Temurin JDK 17, or use Java already on your system.</p>
      <div id="set-java-status" style="margin-top: 8px; font-size: 13px; color: var(--text-muted);">Checking…</div>
      <div style="margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap;">
        <button class="btn-secondary btn-sm" id="set-btn-java-install">Install / repair Java</button>
      </div>
    </div>

    <div class="settings-group">
      <label class="settings-label">Report a bug</label>
      <p class="settings-hint">Send a problem report to the PlayBound team. If you are signed in, it is linked to your account.</p>
      <input type="text" class="input-text" id="set-bug-title" placeholder="Short title" maxlength="160" />
      <textarea class="input-text" id="set-bug-msg" rows="4" placeholder="What happened? Steps to reproduce…" maxlength="8000"></textarea>
      <input type="email" class="input-text" id="set-bug-email" placeholder="Email (optional)" value="${escapeHtml(accountState.email || "")}" />
      <div style="margin-top: 10px;">
        <button class="btn-secondary btn-sm" id="set-btn-bug">Send report</button>
      </div>
    </div>
  `;

  document.getElementById("set-btn-signin").addEventListener("click", () => window.playbound.signIn());
  document.getElementById("set-btn-forgot")?.addEventListener("click", () => {
    const base = (accountState.apiBase || settings.apiBase || "https://playbound.club").replace(/\/$/, "");
    window.playbound.openExternal(`${base}/forgot-password`);
  });
  document.getElementById("set-btn-signout")?.addEventListener("click", async () => {
    await window.playbound.clearLauncherToken();
    renderSettingsView();
  });
  document.getElementById("set-btn-dir").addEventListener("click", async () => {
    const picked = await window.playbound.chooseDirectory(settings.gamesDir);
    if (picked) {
      await window.playbound.saveSettings({ gamesDir: picked });
      renderSettingsView();
    }
  });
  document.getElementById("set-channel-admin")?.addEventListener("click", async () => {
    await window.playbound.saveSettings({ updateChannel: "admin" });
    setStatus("Update channel: unsigned (testing)");
    renderSettingsView();
  });
  document.getElementById("set-channel-latest")?.addEventListener("click", async () => {
    await window.playbound.saveSettings({ updateChannel: "latest" });
    setStatus("Update channel: signed (release)");
    renderSettingsView();
  });

  const hwSummary = document.getElementById("set-hw-summary");
  const hwRefresh = document.getElementById("set-btn-hw-refresh");
  async function fillHwSummary() {
    if (!hwSummary || !window.playbound.getHardwareProfile) {
      if (hwSummary) hwSummary.textContent = "Hardware detection unavailable in this build.";
      return;
    }
    try {
      const res = await window.playbound.getHardwareProfile();
      const p = res?.profile || res?.cached;
      if (!p) {
        hwSummary.textContent = "Could not detect hardware.";
        return;
      }
      const gpu =
        p.gpus && p.primaryGpuIndex != null
          ? p.gpus[p.primaryGpuIndex]
          : p.gpus?.[0];
      const cpuLabel = p.cpu?.displayName || p.cpu?.rawName || "Unknown";
      const gpuLabel = gpu?.displayName || gpu?.rawName || "GPU not detected";
      const ram =
        p.memory?.totalMB != null
          ? p.memory.totalMB >= 1024
            ? `${Math.round(p.memory.totalMB / 1024)} GB`
            : `${p.memory.totalMB} MB`
          : "Unknown";
      const errs = Array.isArray(p.detectionErrors) ? p.detectionErrors.filter(Boolean) : [];
      hwSummary.innerHTML = `
        <div><strong>CPU</strong> ${escapeHtml(cpuLabel)}</div>
        <div><strong>GPU</strong> ${escapeHtml(gpuLabel)}</div>
        <div><strong>Memory</strong> ${escapeHtml(ram)}</div>
        <div><strong>OS</strong> ${escapeHtml([p.os?.name || p.os?.family, p.os?.version].filter(Boolean).join(" ") || "Unknown")}</div>
        ${res?.syncedAt ? `<div style="margin-top:6px;opacity:0.8;">Last synced: ${escapeHtml(String(res.syncedAt).slice(0, 19).replace("T", " "))}</div>` : ""}
        ${
          errs.length
            ? `<div style="margin-top:8px;font-size:12px;opacity:0.75;">Notes: ${escapeHtml(errs.slice(0, 3).join("; "))}</div>`
            : ""
        }
      `;
    } catch (err) {
      hwSummary.textContent = err?.message || "Detection failed.";
    }
  }
  void fillHwSummary();
  if (hwRefresh) {
    hwRefresh.onclick = async () => {
      hwRefresh.disabled = true;
      hwSummary.textContent = "Syncing…";
      try {
        const res = await window.playbound.syncHardwareProfile();
        if (res?.error) throw new Error(res.error);
        setStatus("Hardware profile synced.");
        await fillHwSummary();
      } catch (err) {
        setStatus(err?.message || "Hardware sync failed", true);
        await fillHwSummary();
      } finally {
        hwRefresh.disabled = !accountState.connected;
      }
    };
  }

  const javaStatus = document.getElementById("set-java-status");
  const javaBtn = document.getElementById("set-btn-java-install");
  async function fillJavaStatus() {
    if (!javaStatus) return;
    try {
      const st = window.playbound.getJavaStatus
        ? await window.playbound.getJavaStatus()
        : { managed: settings.javaRuntime, systemAvailable: false };
      const managed = st?.managed || settings.javaRuntime || {};
      if (managed.installed) {
        javaStatus.textContent = `PlayBound Java ${managed.version || "17"} installed`;
        if (javaBtn) javaBtn.textContent = "Reinstall Java";
      } else if (st?.systemAvailable || st?.usable) {
        javaStatus.textContent =
          "Using system Java (works for Mindustry). Optional: install PlayBound’s private JDK 17.";
        if (javaBtn) javaBtn.textContent = "Install PlayBound Java";
      } else {
        javaStatus.textContent = "Not found — install from here or Adoptium";
        if (javaBtn) javaBtn.textContent = "Install Java";
      }
    } catch {
      javaStatus.textContent = "Couldn’t check Java status";
    }
  }
  void fillJavaStatus();
  if (javaBtn && window.playbound.ensureManagedJava) {
    javaBtn.onclick = async () => {
      javaBtn.disabled = true;
      javaStatus.textContent = "Downloading Java 17…";
      setStatus("Installing Java 17…");
      try {
        const res = await window.playbound.ensureManagedJava({
          force: Boolean(settings.javaRuntime?.installed),
        });
        if (!res?.ok) throw new Error(res?.error || "Install failed");
        setStatus("Java 17 ready.");
        settings.javaRuntime = { installed: true, version: "17" };
        await fillJavaStatus();
      } catch (err) {
        setStatus(err?.message || "Java install failed", true);
        await fillJavaStatus();
      } finally {
        javaBtn.disabled = false;
      }
    };
  }

  document.getElementById("set-btn-check-update")?.addEventListener("click", async () => {
    setStatus("Checking for updates…");
    const res = await window.playbound.checkForUpdates();
    if (!res.ok) {
      setStatus(res.message || "Update check failed", true);
      return;
    }
    if (res.updateAvailable) {
      setStatus(`Update ${res.version} available — downloading…`);
      updateStatus = { phase: "available", version: res.version };
    } else if (res.behindChannel) {
      // Running ahead of the channel is not the same as being current, and
      // saying "up to date" here hides the fact that no update can ever
      // arrive — which is exactly how a tester ends up stranded.
      setStatus(res.message || "This build is newer than its update channel.", true);
      updateStatus = { phase: "none", version: res.version };
    } else {
      setStatus(
        res.channel === "admin"
          ? "You're up to date on the unsigned channel."
          : "You're up to date."
      );
      updateStatus = { phase: "none", version: res.version };
    }
    renderSettingsView();
  });
  document.getElementById("set-btn-install-update")?.addEventListener("click", async () => {
    setStatus("Installing update and restarting…");
    await window.playbound.installUpdate();
  });
  document.getElementById("set-btn-bug")?.addEventListener("click", async () => {
    const title = document.getElementById("set-bug-title")?.value?.trim() || "";
    const description = document.getElementById("set-bug-msg")?.value?.trim() || "";
    const contactEmail = document.getElementById("set-bug-email")?.value?.trim() || "";
    if (!window.playbound.reportBug) {
      setStatus("Update the app to report bugs from Settings.", true);
      return;
    }
    setStatus("Sending bug report…");
    const res = await window.playbound.reportBug({ title, description, contactEmail });
    if (!res?.ok) {
      setStatus(res?.error || "Couldn't send report", true);
      return;
    }
    setStatus("Thanks — bug report sent.");
    const titleEl = document.getElementById("set-bug-title");
    const msgEl = document.getElementById("set-bug-msg");
    if (titleEl) titleEl.value = "";
    if (msgEl) msgEl.value = "";
  });
}

/** Sort state for game-detail servers table */
const detailServersSort = { sort: "players", sortDir: "desc" };

const HW_VERDICT_LABEL = {
  excellent: "Runs Great",
  good: "Runs Well",
  playable: "Playable",
  limited: "Limited",
  unsupported: "Unsupported",
  unknown: "Unknown",
};

function formatHwRam(mb) {
  if (mb == null) return null;
  if (mb >= 1024) return `${Math.round(mb / 1024)} GB`;
  return `${mb} MB`;
}

async function fillGameHardwareCompat(slug) {
  const body = document.getElementById("detail-hw-compat-body");
  if (!body) return;
  if (!accountState.connected) {
    body.innerHTML =
      "Sign in to check this game against your PC. Sync hardware from Settings after signing in.";
    return;
  }
  try {
    const data = await window.playbound.getHardwareCompatibility?.(slug);
    if (!data || data.error) {
      body.textContent = data?.error || "Couldn’t check compatibility.";
      return;
    }
    if (!data.hasProfile || !data.result || data.result.verdict === "unknown") {
      body.innerHTML = `${escapeHtml(
        data.result?.summary ||
          "Sync your hardware from Settings (Your Gaming PC) to see whether this game will run well."
      )} <button type="button" class="btn-secondary btn-sm" id="detail-hw-sync" style="margin-left:8px">Sync now</button>`;
      document.getElementById("detail-hw-sync")?.addEventListener("click", async () => {
        body.textContent = "Syncing…";
        await window.playbound.syncHardwareProfile?.();
        fillGameHardwareCompat(slug);
      });
      return;
    }
    const r = data.result;
    const label = HW_VERDICT_LABEL[r.verdict] || "Unknown";
    const rec = r.compared?.required?.recommended || r.compared?.required?.min || {};
    const reasons = (r.reasons || [])
      .slice(0, 5)
      .map((x) => `<li>${escapeHtml(x.message)}</li>`)
      .join("");
    const ram = formatHwRam(r.compared?.user?.ramMB);
    body.innerHTML = `
      <p style="font-weight:800;margin:0 0 6px">${escapeHtml(label)}</p>
      <p class="view-sub" style="margin:0 0 10px">${escapeHtml(r.summary || "")}</p>
      ${reasons ? `<ul style="margin:0 0 12px;padding-left:18px;font-size:13px;color:var(--text-muted)">${reasons}</ul>` : ""}
      <div class="req-grid">
        <div class="req-card">
          <div class="req-label">Your PC</div>
          <p>${escapeHtml([r.compared?.user?.gpu, r.compared?.user?.cpu, ram ? `${ram} RAM` : null].filter(Boolean).join(" · ") || "—")}</p>
        </div>
        <div class="req-card">
          <div class="req-label">Game</div>
          <p>${escapeHtml(
            [
              rec.gpuText || rec.gpuTier ? `GPU: ${rec.gpuText || rec.gpuTier}` : null,
              rec.ramMB ? `RAM: ${formatHwRam(rec.ramMB)}` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "Requirements not fully specified"
          )}</p>
        </div>
      </div>
    `;
  } catch (err) {
    body.textContent = err?.message || "Couldn’t check compatibility.";
  }
}

function youtubeId(url) {
  try {
    const raw = String(url || "").trim();
    if (!raw) return null;
    const match = raw.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/i);
    if (match?.[1]) return match[1];
    const u = new URL(raw);
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.replace(/^\//, "").split("/")[0] || null;
    }
    if (u.hostname.includes("youtube.com")) {
      return u.searchParams.get("v") || u.pathname.split("/")[2] || null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function vimeoId(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("vimeo.com")) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    const id = parts.find((p) => /^\d+$/.test(p));
    return id || null;
  } catch {
    return null;
  }
}

function isPlayableVideo(url) {
  if (!url) return false;
  const s = String(url).trim();
  if (youtubeId(s) || vimeoId(s)) return true;
  return /\.(mp4|webm|m3u8)(\?|$)/i.test(s) || (s.includes("steamstatic.com") && (s.includes("movie") || s.includes(".webm") || s.includes(".mp4")));
}

function classifyMediaUrl(src) {
  const url = String(src || "").trim();
  const yt = youtubeId(url);
  if (yt) {
    return { kind: "youtube", src: url, embedUrl: `https://www.youtube-nocookie.com/embed/${yt}` };
  }
  const vim = vimeoId(url);
  if (vim) {
    return { kind: "vimeo", src: url, embedUrl: `https://player.vimeo.com/video/${vim}` };
  }
  return { kind: "direct", src: url };
}

async function renderGameDetailView(slug) {
  currentDetailSlug = slug;
  const container = views.gameDetail;
  container.innerHTML = `<p class="view-sub">Loading game details...</p>`;

  const detail = await window.playbound.getGameDetail(slug);
  if (!detail) {
    container.innerHTML = `<p class="view-sub">Game not found.</p>`;
    return;
  }

  const bgGrad =
    Array.isArray(detail.art) && detail.art.length >= 2
      ? `linear-gradient(135deg, ${detail.art[0]}, ${detail.art[1]})`
      : `linear-gradient(135deg, #312e81, #a78bfa)`;
  const coverUrl = detail.coverImage || "";
  const genreChips = (detail.genres || [])
    .map((g) => `<span class="chip">${escapeHtml(g)}</span>`)
    .join("");
  const featureItems = (detail.features || [])
    .map((f) => `<li>${escapeHtml(f)}</li>`)
    .join("");
  const shots = (detail.screenshots || [])
    .slice(0, 8)
    .map(
      (src) =>
        `<a class="shot-thumb" href="${escapeHtml(src)}" data-ext="${escapeHtml(src)}"><img src="${escapeHtml(src)}" alt="" loading="lazy" /></a>`
    )
    .join("");

  const coverHtml = coverUrl
    ? `<div class="detail-cover"><img src="${escapeHtml(coverUrl)}" alt="" loading="lazy" /></div>`
    : `<div class="detail-cover detail-cover-fallback" style="background:${bgGrad}"><span>${escapeHtml(
        (detail.title || "?").charAt(0)
      )}</span></div>`;

  const [liveStats, editionsRes] = await Promise.all([
    window.playbound.getLiveStats?.({ game: slug }) || Promise.resolve(null),
    window.playbound.getEditions?.(slug) || Promise.resolve({ editions: [] }),
  ]);
  const editions = Array.isArray(editionsRes?.editions) ? editionsRes.editions : [];
  const playingChip =
    liveStats && Number(liveStats.playingNow) > 0
      ? `<span class="playing-now-chip">${formatStatNumber(liveStats.playingNow)} playing now</span>`
      : liveStats
        ? `<span class="playing-now-chip">0 playing now</span>`
        : "";

  const faqHtml = (detail.faq || [])
    .map(
      (item) =>
        `<div class="faq-card"><h3>${escapeHtml(item.q || item.question || "FAQ")}</h3><p>${escapeHtml(item.a || item.answer || "")}</p></div>`
    )
    .join("");

  const whyHtml = detail.whyWePickedIt
    ? `<section class="detail-section">
        <h2 class="detail-section-title">Why we picked it</h2>
        <p class="detail-prose">${escapeHtml(detail.whyWePickedIt)}</p>
      </section>`
    : "";

  const bestForItems = (detail.bestFor || [])
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  const notForItems = (detail.notFor || [])
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  const fitHtml =
    bestForItems || notForItems
      ? `<section class="detail-section">
          <h2 class="detail-section-title">Best for</h2>
          <div class="fit-grid">
            ${
              bestForItems
                ? `<div><div class="req-label">Great when…</div><ul class="feature-list">${bestForItems}</ul></div>`
                : ""
            }
            ${
              notForItems
                ? `<div><div class="req-label">Skip if…</div><ul class="feature-list">${notForItems}</ul></div>`
                : ""
            }
          </div>
        </section>`
      : "";

  /*
   * No pre-selected edition when there is a real choice.
   *
   * Editions are not cosmetic — Project Quarm and EverQuest Live are different
   * servers, vanilla and Rat King Adventure are different games. Defaulting the
   * picker meant Install silently committed to whichever happened to be marked
   * default, which is the wrong call to make on someone's behalf.
   */
  const editionPickerOptions = [
    `<option value="" selected>Choose an edition…</option>`,
    ...editions.map(
      (ed) =>
        `<option value="${escapeHtml(ed.editionSlug)}">${escapeHtml(ed.editionName)}${
          ed.isDefault ? " (recommended)" : ""
        }</option>`
    ),
  ].join("");

  container.innerHTML = `
    <button class="btn-secondary btn-sm" id="detail-back" style="margin-bottom: 12px">← Back</button>

    <section class="detail-hero">
      ${coverHtml}
      <div class="detail-hero-copy">
        <div class="chip-row">${genreChips}${detail.multiplayer ? '<span class="chip chip-accent">Multiplayer</span>' : ""}${detail.testing ? '<span class="chip chip-accent">Testing</span>' : ""}${playingChip}</div>
        <h1 class="view-title detail-hero-title">${escapeHtml(detail.title)}</h1>
        <p class="view-sub detail-hero-sub">${escapeHtml(detail.blurb)} · ${escapeHtml(detail.approxSize || "")}${detail.version ? ` · v${escapeHtml(detail.version)}` : ""}</p>
        <div class="detail-hero-actions" id="detail-actions"></div>
      </div>
    </section>

    <nav class="detail-tabs" id="detail-tabs">
      <button type="button" class="detail-tab ${detailActiveTab === "overview" ? "active" : ""}" data-tab="overview">Overview</button>
      <button type="button" class="detail-tab ${detailActiveTab === "install" ? "active" : ""}" data-tab="install">Install</button>
      ${detail.multiplayer ? `<button type="button" class="detail-tab ${detailActiveTab === "servers" ? "active" : ""}" data-tab="servers">Servers</button>` : ""}
      ${detail.mods && detail.mods.length > 0 ? `<button type="button" class="detail-tab ${detailActiveTab === "mods" ? "active" : ""}" data-tab="mods">Mods</button>` : ""}
      <button type="button" class="detail-tab ${detailActiveTab === "guides" ? "active" : ""}" data-tab="guides">Guides</button>
      <button type="button" class="detail-tab ${detailActiveTab === "achievements" ? "active" : ""}" data-tab="achievements">Achievements</button>
      <button type="button" class="detail-tab ${detailActiveTab === "news" ? "active" : ""}" data-tab="news">News</button>
      <button type="button" class="detail-tab ${detailActiveTab === "discussion" ? "active" : ""}" data-tab="discussion">Discussion</button>
      <button type="button" class="detail-tab ${detailActiveTab === "reviews" ? "active" : ""}" data-tab="reviews">Reviews</button>
      <button type="button" class="detail-tab ${detailActiveTab === "media" ? "active" : ""}" data-tab="media">Media</button>
    </nav>

    <div class="detail-tab-panels">
      <div class="detail-tab-panel ${detailActiveTab === "overview" ? "active" : ""}" data-panel="overview">
        ${buildActivityPanelHtml(liveStats)}
        ${
          editions.length > 1
            ? `<section class="detail-section" id="detail-editions-sec">
                 <h2 class="detail-section-title">Editions</h2>
                 <div class="editions-list" id="detail-editions-list"></div>
               </section>`
            : ""
        }
        <section class="detail-section">
          <h2 class="detail-section-title">About</h2>
          <p class="detail-prose">${escapeHtml(detail.description || detail.blurb || "")}</p>
        </section>
        ${whyHtml}
        ${fitHtml}
        ${
          featureItems
            ? `<section class="detail-section"><h2 class="detail-section-title">Features</h2><ul class="feature-list">${featureItems}</ul></section>`
            : ""
        }
        <section class="detail-section" id="detail-hw-compat">
          <h2 class="detail-section-title">Will this run on your PC?</h2>
          <p class="view-sub" id="detail-hw-compat-body">Checking…</p>
        </section>
        ${
          detail.systemRequirements
            ? `<section class="detail-section"><h2 class="detail-section-title">System Requirements</h2>
            <div class="req-grid">
              <div class="req-card"><div class="req-label">Minimum</div><p>${escapeHtml(detail.systemRequirements.min || "—")}</p></div>
              <div class="req-card"><div class="req-label">Recommended</div><p>${escapeHtml(detail.systemRequirements.recommended || "—")}</p></div>
            </div></section>`
            : ""
        }
        ${shots ? `<section class="detail-section"><h2 class="detail-section-title">Screenshots</h2><div class="shot-row">${shots}</div></section>` : ""}
        <p class="view-sub"><a href="#" id="detail-open-site">Open full page on playbound.club</a></p>
      </div>
      <div class="detail-tab-panel ${detailActiveTab === "install" ? "active" : ""}" data-panel="install">
        <section class="detail-section">
          <h2 class="detail-section-title">Install</h2>
          ${
            editions.length > 1
              ? `<label class="view-sub" for="detail-edition-pick">Edition</label>
                 <select class="input-text" id="detail-edition-pick" style="max-width:320px;margin:8px 0 6px">${editionPickerOptions}</select>
                 <p class="view-sub edition-gate-hint" id="detail-edition-hint" style="margin:0 0 14px">This game has ${editions.length} editions — pick one to install.</p>`
              : ""
          }
          ${
            detail.addons && detail.addons.length > 0
              ? `<div class="detail-addons-picker" style="margin: 0.75rem 0;">
                 <p style="font-weight:600; margin-bottom:0.5rem; font-size:13px; color:#a1a1aa;">Optional Downloads</p>
                 ${detail.addons
                   .map(
                     (a) =>
                       `<label style="display:block; font-size:13px; margin-bottom:0.25rem; color:#e2e8f0; display:flex; align-items:flex-start; gap:0.5rem; cursor:pointer;">
                          <input type="checkbox" class="addon-checkbox" value="${escapeHtml(a.id)}" checked style="margin-top:2px;" />
                          <div>
                            <div>${escapeHtml(a.name)}</div>
                            <div style="font-size:11px; color:#a1a1aa;">${escapeHtml(a.description || "")}</div>
                          </div>
                        </label>`
                   )
                   .join("")}
               </div>`
              : ""
          }
          <div class="detail-hero-actions" style="margin-bottom:16px">
            <button class="btn-primary" type="button" id="install-tab-install">${editions.length > 1 ? "Install selected edition" : "Install Game"}</button>
            ${detail.website ? `<button class="btn-secondary" type="button" id="install-tab-website">Official website</button>` : ""}
          </div>
          ${gamePlayHintHtml(slug)}
          ${
            detail.systemRequirements
              ? `<div class="req-grid" style="margin-bottom:16px;margin-top:16px">
              <div class="req-card"><div class="req-label">Minimum</div><p>${escapeHtml(detail.systemRequirements.min || "—")}</p></div>
              <div class="req-card"><div class="req-label">Recommended</div><p>${escapeHtml(detail.systemRequirements.recommended || "—")}</p></div>
            </div>`
              : ""
          }
          ${faqHtml ? `<h3 class="detail-section-title">FAQ</h3><div class="faq-list">${faqHtml}</div>` : `<p class="view-sub">No FAQ yet for this title.</p>`}
        </section>
      </div>
      <div class="detail-tab-panel ${detailActiveTab === "servers" ? "active" : ""}" data-panel="servers" id="detail-servers-sec"></div>
      <div class="detail-tab-panel ${detailActiveTab === "mods" ? "active" : ""}" data-panel="mods" id="detail-mods-sec"></div>
      <div class="detail-tab-panel ${detailActiveTab === "guides" ? "active" : ""}" data-panel="guides" id="detail-guides-sec"><p class="view-sub">Loading guides…</p></div>
      <div class="detail-tab-panel ${detailActiveTab === "achievements" ? "active" : ""}" data-panel="achievements" id="detail-achievements-sec">
        <p class="view-sub">Platform-wide achievements are planned but not tracked yet.</p>
        <p class="view-sub"><a href="#" id="achievements-open-site">Open on playbound.club</a></p>
      </div>
      <div class="detail-tab-panel ${detailActiveTab === "news" ? "active" : ""}" data-panel="news" id="detail-news-sec"><p class="view-sub">Loading releases…</p></div>
      <div class="detail-tab-panel ${detailActiveTab === "discussion" ? "active" : ""}" data-panel="discussion" id="detail-discussion-sec"><p class="view-sub">Loading discussion…</p></div>
      <div class="detail-tab-panel ${detailActiveTab === "reviews" ? "active" : ""}" data-panel="reviews" id="detail-reviews-sec"><p class="view-sub">Loading reviews…</p></div>
      <div class="detail-tab-panel ${detailActiveTab === "media" ? "active" : ""}" data-panel="media" id="detail-media-sec"></div>
    </div>
  `;

  const editionsList = document.getElementById("detail-editions-list");
  if (editionsList && editions.length > 1) {
    for (const ed of editions) {
      const row = document.createElement("div");
      row.className = "edition-row";
      const cover = ed.coverImage || ed.heroImage || "";
      row.innerHTML = `
        <div class="edition-row-thumb">${
          cover ? "" : escapeHtml((ed.editionName || "?").charAt(0))
        }</div>
        <div class="edition-row-copy">
          <strong>${escapeHtml(ed.editionName)}${
            ed.isDefault ? ` <span class="edition-row-tag">Default</span>` : ""
          }</strong>
          <span>${escapeHtml(ed.editionType || "")}${ed.shortDescription ? ` · ${escapeHtml(ed.shortDescription)}` : ""}</span>
        </div>
        <button type="button" class="btn-secondary btn-sm">View</button>
      `;
      if (cover) {
        // Set via DOM rather than markup so a broken URL cannot inject, and so
        // a failed load falls back to the initial rather than an empty box.
        const thumb = row.querySelector(".edition-row-thumb");
        const img = document.createElement("img");
        img.src = cover;
        img.alt = "";
        img.loading = "lazy";
        img.addEventListener("error", () => {
          img.remove();
          thumb.textContent = (ed.editionName || "?").charAt(0);
        });
        thumb.appendChild(img);
      }
      row.querySelector("button")?.addEventListener("click", () => {
        openEditionDetail(slug, ed.editionSlug);
      });
      editionsList.appendChild(row);
    }
  }

  /**
   * Which edition to install, or null when the player has not chosen yet.
   *
   * Only falls back to a default when there is no real choice to make — with
   * one edition (or none) the picker is not shown, so there is nothing to ask.
   */
  function selectedEditionSlug() {
    const pick = document.getElementById("detail-edition-pick");
    if (pick) return pick.value || null;
    const def = editions.find((e) => e.isDefault) || editions[0];
    return def?.editionSlug || null;
  }

  /** Keep Install inert until an edition is picked, and say why. */
  function syncInstallGate() {
    const pick = document.getElementById("detail-edition-pick");
    const btn = document.getElementById("install-tab-install");
    if (!pick || !btn) return;
    const chosen = Boolean(pick.value);
    btn.disabled = !chosen;
    btn.title = chosen ? "" : "Choose an edition first";
    const hint = document.getElementById("detail-edition-hint");
    if (hint) hint.hidden = chosen;
  }

  function selectedAddons() {
    const checkboxes = document.querySelectorAll(".addon-checkbox");
    return Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
  }

  async function runInstall(editionSlug) {
    setStatus("Starting install...");
    try {
      const addons = selectedAddons();
      const res = await window.playbound.install(slug, null, editionSlug || null, addons);
      if (res.status === "installed") {
        setStatus("Install complete!");
        setProgress(null);
        renderGameDetailView(slug);
      } else if (res.status === "installer-opened") {
        setStatus("Installer opened — waiting for installer to finish…");
        setProgress(null);
        renderGameDetailView(slug);
      } else if (res.status === "external") {
        setStatus("Opened download page.");
        setProgress(null);
      }
    } catch (err) {
      setStatus(err.message || String(err), true);
      setProgress(null);
    }
  }

  /**
   * Install, but never without an explicit edition when one is owed.
   *
   * Shared by every install entry point on this page so the rule cannot be
   * bypassed by whichever button happens to be on screen.
   */
  async function runInstallGated() {
    const ed = selectedEditionSlug();
    if (editions.length > 1 && !ed) {
      setStatus("Choose which edition you want before installing.", true);
      const pick = document.getElementById("detail-edition-pick");
      if (pick) {
        // Send the player to the tab that actually holds the picker.
        document.getElementById("install-tab-install")?.click();
        pick.focus();
      }
      return;
    }
    await runInstall(ed);
  }

  document.getElementById("detail-edition-pick")?.addEventListener("change", syncInstallGate);
  syncInstallGate();

  document.getElementById("install-tab-install")?.addEventListener("click", () => {
    void runInstallGated();
  });
  document.getElementById("install-tab-website")?.addEventListener("click", () => {
    if (detail.website) {
      window.playbound.openExternal(detail.website, {
        campaign: "launcher_game_website",
        content: slug,
      });
    }
  });
  document.getElementById("achievements-open-site")?.addEventListener("click", (e) => {
    e.preventDefault();
    window.playbound.openExternal(
      `https://playbound.club/games/${encodeURIComponent(slug)}?tab=achievements`
    );
  });

  // Guides / news / media / discussion / reviews (lazy fill)
  void (async () => {
    const guidesSec = document.getElementById("detail-guides-sec");
    const newsSec = document.getElementById("detail-news-sec");
    const mediaSec = document.getElementById("detail-media-sec");
    const discussionSec = document.getElementById("detail-discussion-sec");
    const reviewsSec = document.getElementById("detail-reviews-sec");
    const [guidesRes, releasesRes, discussionsRes, reviewsRes] = await Promise.all([
      window.playbound.getGameGuides?.(slug) || Promise.resolve({ guides: [] }),
      window.playbound.getGameReleases?.(slug) || Promise.resolve({ releases: [] }),
      window.playbound.getGameDiscussions?.(slug) || Promise.resolve({ topics: [] }),
      window.playbound.getGameReviews?.(slug) || Promise.resolve({ reviews: [] }),
    ]);
    const guides = guidesRes?.guides || [];
    if (guidesSec) {
      if (!guides.length) {
        guidesSec.innerHTML = `<p class="view-sub">No guides yet. <a href="#" id="guides-open-site">Write one on playbound.club</a></p>`;
        document.getElementById("guides-open-site")?.addEventListener("click", (e) => {
          e.preventDefault();
          window.playbound.openExternal(
            `https://playbound.club/games/${encodeURIComponent(slug)}?tab=guides`
          );
        });
      } else {
        guidesSec.innerHTML = `<div class="guide-list">${guides
          .map(
            (g) =>
              `<button type="button" class="guide-card" data-url="${escapeHtml(g.url)}" style="text-align:left;cursor:pointer;width:100%;color:inherit;background:rgba(255,255,255,0.02)">
                <h3>${escapeHtml(g.title)}</h3>
                <p>${escapeHtml(g.excerpt || "")}</p>
                <p style="margin-top:6px;font-size:11px">${escapeHtml(g.username || "")} · ${escapeHtml(
                g.createdAt ? new Date(g.createdAt).toLocaleDateString() : ""
              )}</p>
              </button>`
          )
          .join("")}</div>`;
        guidesSec.querySelectorAll("[data-url]").forEach((el) => {
          el.addEventListener("click", () => window.playbound.openExternal(el.dataset.url));
        });
      }
    }
    const releases = releasesRes?.releases || [];
    if (newsSec) {
      if (!releases.length) {
        newsSec.innerHTML = `<p class="view-sub">No GitHub release notes available${
          detail.website
            ? `. <a href="#" id="news-website">Check the official site</a>`
            : "."
        }</p>`;
        document.getElementById("news-website")?.addEventListener("click", (e) => {
          e.preventDefault();
          window.playbound.openExternal(detail.website, {
            campaign: "launcher_game_website",
            content: slug,
          });
        });
      } else {
        newsSec.innerHTML = `<div class="release-list">${releases
          .map(
            (r) =>
              `<a class="release-card" href="${escapeHtml(r.url)}" data-ext="${escapeHtml(r.url)}" style="display:block;text-decoration:none;color:inherit">
                <h3>${escapeHtml(r.name || r.tagName)}</h3>
                <p>${escapeHtml(r.body || "")}</p>
                <p style="margin-top:6px;font-size:11px">${
                  r.publishedAt ? escapeHtml(new Date(r.publishedAt).toLocaleDateString()) : ""
                }</p>
              </a>`
          )
          .join("")}</div>`;
        newsSec.querySelectorAll("[data-ext]").forEach((a) => {
          a.addEventListener("click", (e) => {
            e.preventDefault();
            window.playbound.openExternal(a.dataset.ext, {
              campaign: "launcher_github",
              content: slug,
            });
          });
        });
      }
    }
    if (discussionSec) {
      const topics = discussionsRes?.topics || [];
      const boardUrl =
        discussionsRes?.boardUrl ||
        `https://playbound.club/games/${encodeURIComponent(slug)}?tab=discussion`;
      if (!topics.length) {
        discussionSec.innerHTML = `<p class="view-sub">No discussions yet. <a href="#" id="discussion-open-site">Start one on playbound.club</a></p>`;
      } else {
        discussionSec.innerHTML = `<div class="guide-list">${topics
          .map(
            (t) =>
              `<button type="button" class="guide-card" data-url="${escapeHtml(t.url)}" style="text-align:left;cursor:pointer;width:100%;color:inherit;background:rgba(255,255,255,0.02)">
                <h3>${t.isPinned ? "📌 " : ""}${escapeHtml(t.title)}</h3>
                <p style="margin-top:6px;font-size:11px">${escapeHtml(t.category || "")}${
                t.username ? ` · ${escapeHtml(t.username)}` : ""
              } · ${Number(t.replyCount) || 0} replies${t.isSolved ? " · Solved" : ""}</p>
              </button>`
          )
          .join(
            ""
          )}</div><p class="view-sub" style="margin-top:12px"><a href="#" id="discussion-open-site">Open discussion board on playbound.club</a></p>`;
        discussionSec.querySelectorAll("[data-url]").forEach((el) => {
          el.addEventListener("click", () => window.playbound.openExternal(el.dataset.url));
        });
      }
      document.getElementById("discussion-open-site")?.addEventListener("click", (e) => {
        e.preventDefault();
        window.playbound.openExternal(boardUrl);
      });
    }
    if (reviewsSec) {
      const reviews = reviewsRes?.reviews || [];
      if (!reviews.length) {
        reviewsSec.innerHTML = `<p class="view-sub">No reviews yet. <a href="#" id="reviews-open-site">Write one on playbound.club</a></p>`;
      } else {
        reviewsSec.innerHTML = `<div class="guide-list">${reviews
          .map(
            (r) =>
              `<button type="button" class="guide-card" data-url="${escapeHtml(r.url)}" style="text-align:left;cursor:pointer;width:100%;color:inherit;background:rgba(255,255,255,0.02)">
                <h3>${"★".repeat(Math.max(0, Math.min(5, Number(r.rating) || 0)))}${"☆".repeat(
                Math.max(0, 5 - (Number(r.rating) || 0))
              )} · ${escapeHtml(r.title || "Review")}</h3>
                <p>${escapeHtml(r.body || "")}</p>
                <p style="margin-top:6px;font-size:11px">${escapeHtml(r.username || "")}${
                r.createdAt ? ` · ${escapeHtml(new Date(r.createdAt).toLocaleDateString())}` : ""
              }</p>
              </button>`
          )
          .join(
            ""
          )}</div><p class="view-sub" style="margin-top:12px"><a href="#" id="reviews-open-site">Write or manage reviews on playbound.club</a></p>`;
        reviewsSec.querySelectorAll("[data-url]").forEach((el) => {
          el.addEventListener("click", () => window.playbound.openExternal(el.dataset.url));
        });
      }
      document.getElementById("reviews-open-site")?.addEventListener("click", (e) => {
        e.preventDefault();
        window.playbound.openExternal(
          `https://playbound.club/games/${encodeURIComponent(slug)}?tab=reviews`
        );
      });
    }
    if (mediaSec) {
      const vids = (Array.isArray(detail.videos) ? detail.videos : [])
        .filter(isPlayableVideo)
        .map(classifyMediaUrl);
      const shots = (Array.isArray(detail.screenshots) ? detail.screenshots : []).filter(Boolean);

      const countText = [
        vids.length > 0 ? `${vids.length} ${vids.length === 1 ? "video" : "videos"}` : "",
        shots.length > 0 ? `${shots.length} ${shots.length === 1 ? "screenshot" : "screenshots"}` : ""
      ].filter(Boolean).join(" · ");

      let videosHtml = "";
      if (vids.length > 0) {
        videosHtml = `
          <details open class="media-details-group">
            <summary class="media-details-summary">
              <span class="media-details-summary-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="20" x="2" y="2" rx="2.18" ry="2.18"/><line x1="7" x2="7" y1="2" y2="22"/><line x1="17" x2="17" y1="2" y2="22"/><line x1="2" x2="22" y1="12" y2="12"/><line x1="2" x2="7" y1="7" y2="7"/><line x1="2" x2="7" y1="17" y2="17"/><line x1="17" x2="22" y1="17" y2="17"/><line x1="17" x2="22" y1="7" y2="7"/></svg>
                <span>Videos</span>
                <span class="media-details-count-badge">${vids.length}</span>
              </span>
              <svg class="media-details-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </summary>
            <div class="media-grid-videos">
              ${vids
                .map((v) => {
                  if (v.kind === "youtube" || v.kind === "vimeo") {
                    return `
                      <div class="media-video-frame">
                        <iframe src="${escapeHtml(v.embedUrl)}" title="${escapeHtml(detail.title || "Game")} video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>
                      </div>
                    `;
                  }
                  return `
                    <div class="media-video-frame">
                      <video src="${escapeHtml(v.src)}" controls preload="metadata" poster="${escapeHtml(detail.coverImage || "")}">
                        <source src="${escapeHtml(v.src)}" />
                      </video>
                    </div>
                  `;
                })
                .join("")}
            </div>
          </details>
        `;
      }

      let screenshotsHtml = "";
      if (shots.length > 0) {
        screenshotsHtml = `
          <details open class="media-details-group">
            <summary class="media-details-summary">
              <span class="media-details-summary-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                <span>Screenshots</span>
                <span class="media-details-count-badge">${shots.length}</span>
              </span>
              <svg class="media-details-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </summary>
            <div class="media-grid-screenshots">
              ${shots
                .map(
                  (src) =>
                    `<a class="media-screenshot-card" href="${escapeHtml(src)}" data-ext="${escapeHtml(src)}">
                      <img src="${escapeHtml(src)}" alt="${escapeHtml(detail.title || "")} screenshot" loading="lazy" />
                    </a>`
                )
                .join("")}
            </div>
          </details>
        `;
      } else if (vids.length === 0) {
        screenshotsHtml = `
          <p class="view-sub">No screenshots uploaded for ${escapeHtml(detail.title || "this game")} yet.</p>
        `;
      }

      const footerHtml = `
        <p class="view-sub" style="font-size:12px; margin-top:12px">
          More screenshots and trailers live on ${
            detail.website
              ? `<a href="#" id="media-official-link" style="color:var(--accent-light);font-weight:600">the official ${escapeHtml(detail.title || "game")} site</a>`
              : `the official ${escapeHtml(detail.title || "game")} site`
          }.
        </p>
      `;

      mediaSec.innerHTML = `
        <div class="media-header">
          <h2>Media</h2>
          <span class="media-header-count">${escapeHtml(countText)}</span>
        </div>
        ${videosHtml}
        ${screenshotsHtml}
        ${footerHtml}
      `;

      document.getElementById("media-official-link")?.addEventListener("click", (e) => {
        e.preventDefault();
        if (detail.website) window.playbound.openExternal(detail.website);
      });

      mediaSec.querySelectorAll("a.media-screenshot-card").forEach((a) => {
        a.addEventListener("click", (e) => {
          e.preventDefault();
          window.playbound.openExternal(a.dataset.ext);
        });
      });
    }
  })();

  document.getElementById("detail-back").addEventListener("click", () => {
    const back = ["games", "library", "home", "servers"].includes(detailReturnView)
      ? detailReturnView
      : "games";
    navigateTo(back);
  });
  document.getElementById("detail-open-site")?.addEventListener("click", (e) => {
    e.preventDefault();
    window.playbound.openExternal(`https://playbound.club/games/${encodeURIComponent(slug)}`);
  });
  void fillGameHardwareCompat(slug);
  container.querySelectorAll("a.shot-thumb").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      window.playbound.openExternal(a.dataset.ext);
    });
  });
  document.getElementById("detail-tabs")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-tab]");
    if (!btn) return;
    detailActiveTab = btn.dataset.tab;
    container.querySelectorAll(".detail-tab").forEach((t) => {
      t.classList.toggle("active", t.dataset.tab === detailActiveTab);
    });
    container.querySelectorAll(".detail-tab-panel").forEach((p) => {
      p.classList.toggle("active", p.dataset.panel === detailActiveTab);
    });
  });

  const actions = document.getElementById("detail-actions");
  if (detail.installed) {
    actions.innerHTML = `
      <button class="btn-success" id="act-play">Play Now</button>
      ${window.playbound.platform.supportsDesktopShortcuts() ? `<button class="btn-secondary" id="act-shortcut">Create Shortcut</button>` : ""}
      <button class="btn-secondary" id="act-folder">${window.playbound.platform.getOS() === "macos" ? "Open in Finder" : "Open Folder"}</button>
      <button class="btn-danger" id="act-uninstall">Uninstall</button>
      ${gamePlayHintHtml(slug)}
    `;
    document.getElementById("act-play").addEventListener("click", async () => {
      try {
        setStatus("Checking Java / launching…");
        await window.playbound.play(slug);
        startGameSession(slug, detail.title || slug);
        setStatus(`Launched ${detail.title || slug}`);
      } catch (err) {
        setStatus(err.message || String(err), true);
      }
    });
    const btnShortcut = document.getElementById("act-shortcut");
    if (btnShortcut) {
      btnShortcut.addEventListener("click", async () => {
        try {
          const res = await window.playbound.createShortcut(slug);
          setStatus(`Desktop shortcut created for ${res.title}`);
        } catch (err) {
          setStatus(err.message || String(err), true);
        }
      });
    }
    document.getElementById("act-folder").addEventListener("click", () => {
      if (detail.installedPath) window.playbound.openFolder(detail.installedPath);
    });
    document.getElementById("act-uninstall").addEventListener("click", async () => {
      if (!confirm(`Uninstall ${detail.title}?`)) return;
      setStatus("Uninstalling...");
      try {
        await window.playbound.uninstall(slug);
        setStatus(`Uninstalled ${detail.title || slug}`);
        renderGameDetailView(slug);
      } catch (err) {
        setStatus(err.message || String(err), true);
      }
    });
  } else if (detail.pendingInstaller) {
    const locateLabel = selectExecutableLabel();
    actions.innerHTML = `
      <button class="btn-primary" id="act-locate">${locateLabel}</button>
      <button class="btn-secondary" id="act-dismiss-pending">Dismiss</button>
      <button class="btn-secondary" id="act-install">Re-run installer</button>
    `;
    setStatus(
      detail.scanning
        ? `Looking for ${detail.title}…`
        : `${detail.title} is in Library — ${selectExecutableLabel().toLowerCase()} if the scan missed it.`
    );
    document.getElementById("act-locate").addEventListener("click", async () => {
      setStatus("Looking for install…");
      try {
        const res = await window.playbound.locateExe(slug);
        if (res?.status === "cancelled") {
          setStatus("Locate cancelled.");
          return;
        }
        setStatus("Install located — added to library.");
        setProgress(null);
        renderGameDetailView(slug);
        if (currentView === "library") renderLibraryView();
      } catch (err) {
        setStatus(err.message || String(err), true);
        setProgress(null);
      }
    });
    document.getElementById("act-dismiss-pending").addEventListener("click", async () => {
      if (!confirm(`Remove ${detail.title} from Library? (Does not delete game files.)`)) return;
      await window.playbound.dismissPendingInstall?.(slug);
      renderGameDetailView(slug);
      if (currentView === "library") renderLibraryView();
    });
    document.getElementById("act-install").addEventListener("click", async () => {
      await runInstallGated();
    });
  } else {
    const showLocate =
      detail.isInstallerKind || Boolean(detail.knownExePaths?.length);
    actions.innerHTML = `
      <button class="btn-primary" id="act-install">Install Game</button>
      ${showLocate ? `<button class="btn-secondary" id="act-locate">I've finished installing</button>` : ""}
    `;
    document.getElementById("act-install").addEventListener("click", async () => {
      await runInstallGated();
    });
    document.getElementById("act-locate")?.addEventListener("click", async () => {
      setStatus("Looking for install…");
      try {
        const res = await window.playbound.locateExe(slug);
        if (res?.status === "cancelled") {
          setStatus("Locate cancelled.");
          return;
        }
        setStatus("Install located — added to library.");
        setProgress(null);
        renderGameDetailView(slug);
        if (currentView === "library") renderLibraryView();
      } catch (err) {
        setStatus(err.message || String(err), true);
        setProgress(null);
      }
    });
  }

  const modsSec = document.getElementById("detail-mods-sec");
  const mods = (Array.isArray(detail.mods) ? detail.mods : []).filter((m) =>
    compatibilityFilter === "compatible" ? isModDesktopCompatible(m) : true
  );
  if (mods.length) {
    modsSec.innerHTML = `<div class="mods-list"></div>`;
    const modsList = modsSec.querySelector(".mods-list");
    for (const mod of mods) {
      const row = document.createElement("div");
      row.className = "mod-row";
      const external = mod.downloadKind === "external";
      if (mod.installed && !external) {
        row.innerHTML = `
          <div>
            <div class="mod-row-title">${escapeHtml(mod.title)}</div>
            <div class="view-sub" style="margin:0">${escapeHtml(mod.tagline || "")}</div>
          </div>
          <div class="library-mod-actions">
            <button class="btn-primary btn-sm btn-mod-play" type="button">Play</button>
            ${
              mod.installedPath
                ? `<button class="btn-secondary btn-sm btn-mod-folder" type="button">Folder</button>`
                : ""
            }
            <button class="btn-danger btn-sm btn-mod-uninstall" type="button">Remove</button>
          </div>
        `;
        row.querySelector(".btn-mod-play")?.addEventListener("click", async () => {
          try {
            setStatus(`Launching ${mod.title}…`);
            await window.playbound.playMod(mod.slug);
            setStatus(`Launched ${mod.title}`);
          } catch (err) {
            setStatus(err.message || String(err), true);
          }
        });
        row.querySelector(".btn-mod-folder")?.addEventListener("click", () => {
          window.playbound.openFolder(mod.installedPath);
        });
        row.querySelector(".btn-mod-uninstall")?.addEventListener("click", async () => {
          if (!confirm(`Remove mod ${mod.title} from library tracking?`)) return;
          try {
            setStatus(`Removing ${mod.title}…`);
            await window.playbound.uninstallMod(mod.slug);
            setStatus(`Removed ${mod.title}`);
            renderGameDetailView(slug);
          } catch (err) {
            setStatus(err.message || String(err), true);
          }
        });
      } else {
        row.innerHTML = `
          <div>
            <div class="mod-row-title">${escapeHtml(mod.title)}</div>
            <div class="view-sub" style="margin:0">${escapeHtml(mod.tagline || "")}</div>
          </div>
          ${
            mod.installed && mod.installedPath
              ? `<div class="library-mod-actions">
            <button class="btn-secondary btn-sm btn-mod-folder" type="button">Folder</button>
            <button class="btn-danger btn-sm btn-mod-uninstall" type="button">Remove</button>
          </div>`
              : `<button class="btn-sm ${mod.installed ? "btn-secondary" : "btn-primary"}" type="button">
            ${
              mod.installed
                ? "Installed"
                : external
                  ? "Open download page"
                  : "Install"
            }
          </button>`
          }
        `;
        if (mod.installed && mod.installedPath) {
          row.querySelector(".btn-mod-folder")?.addEventListener("click", () => {
            window.playbound.openFolder(mod.installedPath);
          });
          row.querySelector(".btn-mod-uninstall")?.addEventListener("click", async () => {
            if (!confirm(`Remove mod ${mod.title} from library tracking?`)) return;
            try {
              setStatus(`Removing ${mod.title}…`);
              await window.playbound.uninstallMod(mod.slug);
              setStatus(`Removed ${mod.title}`);
              renderGameDetailView(slug);
            } catch (err) {
              setStatus(err.message || String(err), true);
            }
          });
        } else {
          const btn = row.querySelector("button");
          if (!mod.installed) {
            btn.addEventListener("click", async () => {
              setStatus(external ? `Opening download page for ${mod.title}…` : `Installing ${mod.title}…`);
              try {
                const res = await window.playbound.installMod(mod.slug);
                if (res?.status === "external") {
                  setStatus("Opened download page in browser.");
                  setProgress(null);
                } else if (res?.status === "waiting-base") {
                  setStatus("Installing base game first — finish the setup wizard…");
                  setProgress(null);
                } else {
                  setStatus("Mod install complete");
                  setProgress(null);
                  renderGameDetailView(slug);
                }
              } catch (err) {
                setStatus(err.message || String(err), true);
                setProgress(null);
              }
            });
          } else {
            btn.disabled = true;
          }
        }
      }
      modsList.appendChild(row);
      const titleEl = row.querySelector(".mod-row-title");
      if (titleEl) {
        titleEl.style.cursor = "pointer";
        titleEl.addEventListener("click", () => openModDetail(mod.slug, "gameDetail"));
      }
      void window.playbound.getLiveStats?.({ mod: mod.slug }).then((stats) => {
        if (!stats || !row.isConnected) return;
        const titleNode = row.querySelector(".mod-row-title");
        if (!titleNode) return;
        const chip = document.createElement("span");
        chip.className = "playing-now-chip";
        chip.style.marginLeft = "8px";
        chip.textContent = `${formatStatNumber(stats.playingNow)} playing now`;
        titleNode.appendChild(chip);
      });
    }
  } else {
    modsSec.innerHTML = `<p class="view-sub">No catalog mods for this title yet.</p>`;
  }

  async function loadDetailServers() {
    const sSec = document.getElementById("detail-servers-sec");
    if (!sSec) return;
    sSec.innerHTML = `<p class="view-sub">Loading live servers…</p>`;
    const serversRes = await window.playbound.getServers(slug);
    if (serversRes.supported && serversRes.servers?.length > 0) {
      const allServers = serversRes.servers.slice(0, 40);

      function paintDetailServers() {
        const { sort, sortDir } = detailServersSort;
        const dir = sortDir === "asc" ? 1 : -1;
        const sorted = allServers.slice().sort((a, b) => {
          if (sort === "players") {
            return dir * ((Number(a.players) || 0) - (Number(b.players) || 0));
          }
          const av = sort === "map" ? a.map || "" : a.name || "";
          const bv = sort === "map" ? b.map || "" : b.name || "";
          return dir * String(av).localeCompare(String(bv), undefined, { sensitivity: "base" });
        });
        const totalPlayers = sorted.reduce((n, s) => n + (Number(s.players) || 0), 0);
        const header = (key, label) => {
          const active = detailServersSort.sort === key;
          const arrow = active ? (detailServersSort.sortDir === "asc" ? " ↑" : " ↓") : "";
          return `<th class="sortable${active ? " sorted" : ""}" data-sort="${key}">${escapeHtml(label)}${arrow}</th>`;
        };
        sSec.innerHTML = `
          <div class="detail-servers-header">
            <p class="servers-stats">${totalPlayers} player${totalPlayers === 1 ? "" : "s"} · ${sorted.length} server${sorted.length === 1 ? "" : "s"}</p>
            <button class="btn-secondary btn-sm" id="detail-servers-refresh" type="button">Refresh</button>
          </div>
          <table class="server-table">
            <thead>
              <tr>
                ${header("name", "Server Name")}
                ${header("players", "Players")}
                ${header("map", "Map")}
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${sorted
                .map(
                  (s) => `
                <tr>
                  <td><strong>${escapeHtml(s.name)}</strong></td>
                  <td>${s.players == null ? "—" : `${s.players}/${s.maxPlayers ?? "—"}`}</td>
                  <td>${escapeHtml(s.map || "Standard")}</td>
                  <td>
                    <button class="btn-primary btn-sm btn-join-s" data-host="${escapeHtml(s.host)}" data-port="${Number(s.port) || 0}">Join</button>
                  </td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        `;
        document.getElementById("detail-servers-refresh")?.addEventListener("click", () => {
          loadDetailServers();
        });
        sSec.querySelectorAll("th.sortable").forEach((th) => {
          th.addEventListener("click", () => {
            const key = th.dataset.sort;
            if (detailServersSort.sort === key) {
              detailServersSort.sortDir = detailServersSort.sortDir === "asc" ? "desc" : "asc";
            } else {
              detailServersSort.sort = key;
              detailServersSort.sortDir = SERVER_SORT_DEFAULT_DIR[key] || "asc";
            }
            paintDetailServers();
          });
        });
        sSec.querySelectorAll(".btn-join-s").forEach((b) => {
          b.addEventListener("click", async () => {
            await window.playbound.play(slug, { host: b.dataset.host, port: Number(b.dataset.port) });
            startGameSession(slug, detail.title || slug);
          });
        });
      }

      paintDetailServers();
    } else if (detail.multiplayer) {
      sSec.innerHTML = `
        <div class="detail-servers-header">
          <p class="view-sub" style="margin:0">No live servers listed right now.</p>
          <button class="btn-secondary btn-sm" id="detail-servers-refresh" type="button">Refresh</button>
        </div>
      `;
      document.getElementById("detail-servers-refresh")?.addEventListener("click", () => {
        loadDetailServers();
      });
    } else {
      sSec.innerHTML = `<p class="view-sub">This title doesn't list dedicated servers.</p>`;
    }
  }

  void loadDetailServers();
}

function openGameDetail(slug, fromView) {
  const origin = fromView || currentView;
  detailReturnView = ["games", "library", "home", "servers", "mods"].includes(origin)
    ? origin
    : "games";
  detailActiveTab = "overview";
  navigateTo("gameDetail", { slug });
}

function openModDetail(slug, fromView) {
  const origin = fromView || currentView;
  detailReturnView = ["games", "library", "home", "servers", "mods", "gameDetail"].includes(origin)
    ? origin
    : "mods";
  modDetailActiveTab = "overview";
  navigateTo("modDetail", { slug });
}

async function renderModDetailView(slug) {
  currentModDetailSlug = slug;
  const container = views.modDetail;
  if (!container) return;
  container.innerHTML = `<p class="view-sub">Loading mod details...</p>`;

  const detail = await window.playbound.getModDetail?.(slug);
  if (!detail) {
    container.innerHTML = `<p class="view-sub">Mod not found.</p>`;
    return;
  }

  const bgGrad =
    Array.isArray(detail.art) && detail.art.length >= 2
      ? `linear-gradient(135deg, ${detail.art[0]}, ${detail.art[1]})`
      : `linear-gradient(135deg, #312e81, #a78bfa)`;
  const coverUrl = detail.coverImage || detail.baseGame?.coverImage || "";
  const coverHtml = coverUrl
    ? `<div class="detail-cover"><img src="${escapeHtml(coverUrl)}" alt="" loading="lazy" /></div>`
    : `<div class="detail-cover detail-cover-fallback" style="background:${bgGrad}"><span>${escapeHtml(
        (detail.title || "?").charAt(0)
      )}</span></div>`;

  const faqHtml = (detail.faq || [])
    .map(
      (item) =>
        `<div class="faq-card"><h3>${escapeHtml(item.q || item.question || "FAQ")}</h3><p>${escapeHtml(item.a || item.answer || "")}</p></div>`
    )
    .join("");

  const installSteps = (detail.installSteps || [])
    .map(
      (step, i) =>
        `<div class="faq-card"><h3>Step ${i + 1}</h3><p>${escapeHtml(step.text || "")}${
          step.command ? `<br/><code>${escapeHtml(step.command)}</code>` : ""
        }</p></div>`
    )
    .join("");

  const shots = (detail.screenshots || [])
    .slice(0, 12)
    .map(
      (src) =>
        `<a class="shot-thumb" href="${escapeHtml(src)}" data-ext="${escapeHtml(src)}"><img src="${escapeHtml(src)}" alt="" loading="lazy" /></a>`
    )
    .join("");

  const external = detail.downloadKind === "external";
  const baseTitle = detail.baseGame?.title || detail.baseGame?.slug || "";

  container.innerHTML = `
    <button class="btn-secondary btn-sm" id="mod-detail-back" style="margin-bottom: 12px">← Back</button>

    <section class="detail-hero">
      ${coverHtml}
      <div class="detail-hero-copy">
        <div class="chip-row"><span class="chip chip-accent">Mod</span>${
          baseTitle ? `<span class="chip">For ${escapeHtml(baseTitle)}</span>` : ""
        }</div>
        <h1 class="view-title detail-hero-title">${escapeHtml(detail.title)}</h1>
        <p class="view-sub detail-hero-sub">${escapeHtml(detail.tagline || "")}${
          detail.approxSize ? ` · ${escapeHtml(detail.approxSize)}` : ""
        }${detail.version ? ` · v${escapeHtml(detail.version)}` : ""}</p>
        <div class="detail-hero-actions" id="mod-detail-actions"></div>
      </div>
    </section>

    <nav class="detail-tabs" id="mod-detail-tabs">
      <button type="button" class="detail-tab ${modDetailActiveTab === "overview" ? "active" : ""}" data-tab="overview">Overview</button>
      <button type="button" class="detail-tab ${modDetailActiveTab === "install" ? "active" : ""}" data-tab="install">Install</button>
      <button type="button" class="detail-tab ${modDetailActiveTab === "media" ? "active" : ""}" data-tab="media">Media</button>
      <button type="button" class="detail-tab ${modDetailActiveTab === "faq" ? "active" : ""}" data-tab="faq">FAQ</button>
      <button type="button" class="detail-tab ${modDetailActiveTab === "guides" ? "active" : ""}" data-tab="guides">Guides</button>
    </nav>

    <div class="detail-tab-panels">
      <div class="detail-tab-panel ${modDetailActiveTab === "overview" ? "active" : ""}" data-panel="overview">
        ${
          detail.whatItChanges
            ? `<section class="detail-section"><h2 class="detail-section-title">What it changes</h2><p>${escapeHtml(
                detail.whatItChanges
              )}</p></section>`
            : ""
        }
        <section class="detail-section">
          <h2 class="detail-section-title">About</h2>
          <p style="white-space:pre-wrap">${escapeHtml(
            detail.longDescription || detail.description || detail.tagline || ""
          )}</p>
        </section>
        ${
          detail.compatibility
            ? `<section class="detail-section"><h2 class="detail-section-title">Compatibility</h2><p>${escapeHtml(
                detail.compatibility
              )}</p></section>`
            : ""
        }
        <div class="detail-hero-actions" style="margin-top:12px">
          <button type="button" class="btn-secondary btn-sm" data-web-tab="reviews">Reviews on site</button>
          <button type="button" class="btn-secondary btn-sm" data-web-tab="discussion">Discussion on site</button>
          <button type="button" class="btn-secondary btn-sm" id="mod-detail-open-site">Open on playbound.club</button>
        </div>
      </div>
      <div class="detail-tab-panel ${modDetailActiveTab === "install" ? "active" : ""}" data-panel="install">
        <section class="detail-section">
          <h2 class="detail-section-title">${external ? "Download" : "Install"}</h2>
          <p class="view-sub">${
            external
              ? "This mod opens an external download page. Place files in the game mods folder afterward."
              : `Installs into ${escapeHtml(detail.installRelativePath || "mods")} for ${escapeHtml(
                  baseTitle || "the base game"
                )}.`
          }</p>
          ${installSteps || "<p class=\"view-sub\">No extra install steps listed.</p>"}
        </section>
      </div>
      <div class="detail-tab-panel ${modDetailActiveTab === "media" ? "active" : ""}" data-panel="media">
        ${
          shots
            ? `<section class="detail-section"><h2 class="detail-section-title">Screenshots</h2><div class="shot-row">${shots}</div></section>`
            : `<p class="view-sub">No media yet.</p>`
        }
      </div>
      <div class="detail-tab-panel ${modDetailActiveTab === "faq" ? "active" : ""}" data-panel="faq">
        ${faqHtml || `<p class="view-sub">No FAQ yet.</p>`}
      </div>
      <div class="detail-tab-panel ${modDetailActiveTab === "guides" ? "active" : ""}" data-panel="guides" id="mod-detail-guides-sec"><p class="view-sub">Loading guides…</p></div>
    </div>
  `;

  const guidesSec = document.getElementById("mod-detail-guides-sec");
  void (async () => {
    const guidesRes =
      (await window.playbound.getModGuides?.(slug)) || { guides: [] };
    const guides = guidesRes?.guides || [];
    if (!guidesSec) return;
    if (!guides.length) {
      guidesSec.innerHTML = `<p class="view-sub">No guides yet. <a href="#" id="mod-guides-open-site">Write one on playbound.club</a></p>`;
      document.getElementById("mod-guides-open-site")?.addEventListener("click", (e) => {
        e.preventDefault();
        window.playbound.openExternal(
          `https://playbound.club/mods/${encodeURIComponent(slug)}?tab=guides`
        );
      });
    } else {
      guidesSec.innerHTML = `<div class="guide-list">${guides
        .map(
          (g) =>
            `<a class="guide-card" href="#" data-url="${escapeHtml(g.url || "")}"><strong>${escapeHtml(
              g.title
            )}</strong><span class="view-sub">${escapeHtml(g.username || "")}${
              g.createdAt ? ` · ${escapeHtml(String(g.createdAt).slice(0, 10))}` : ""
            }</span><p>${escapeHtml(g.excerpt || "")}</p></a>`
        )
        .join("")}</div>`;
      guidesSec.querySelectorAll("[data-url]").forEach((el) => {
        el.addEventListener("click", (e) => {
          e.preventDefault();
          if (el.dataset.url) window.playbound.openExternal(el.dataset.url);
        });
      });
    }
  })();

  document.getElementById("mod-detail-back")?.addEventListener("click", () => {
    const back = ["mods", "library", "home", "games", "gameDetail", "servers"].includes(
      detailReturnView
    )
      ? detailReturnView
      : "mods";
    if (back === "gameDetail" && currentDetailSlug) {
      navigateTo("gameDetail", { slug: currentDetailSlug });
    } else {
      navigateTo(back);
    }
  });

  document.getElementById("mod-detail-open-site")?.addEventListener("click", () => {
    window.playbound.openExternal(`https://playbound.club/mods/${encodeURIComponent(slug)}`);
  });
  container.querySelectorAll("[data-web-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.playbound.openExternal(
        `https://playbound.club/mods/${encodeURIComponent(slug)}?tab=${encodeURIComponent(
          btn.dataset.webTab
        )}`
      );
    });
  });
  container.querySelectorAll("a.shot-thumb").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      window.playbound.openExternal(a.dataset.ext);
    });
  });
  document.getElementById("mod-detail-tabs")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-tab]");
    if (!btn) return;
    modDetailActiveTab = btn.dataset.tab;
    container.querySelectorAll(".detail-tab").forEach((t) => {
      t.classList.toggle("active", t.dataset.tab === modDetailActiveTab);
    });
    container.querySelectorAll(".detail-tab-panel").forEach((p) => {
      p.classList.toggle("active", p.dataset.panel === modDetailActiveTab);
    });
  });

  const actions = document.getElementById("mod-detail-actions");
  if (!actions) return;

  if (detail.installed && !external) {
    actions.innerHTML = `
      <button class="btn-success" id="mod-act-play">Play</button>
      ${
        detail.installedPath
          ? `<button class="btn-secondary" id="mod-act-folder">${
              window.playbound.platform.getOS() === "macos" ? "Open in Finder" : "Open Folder"
            }</button>`
          : ""
      }
      <button class="btn-danger" id="mod-act-uninstall">Uninstall</button>
      <button class="btn-secondary" id="mod-act-reinstall">Reinstall</button>
    `;
    document.getElementById("mod-act-play")?.addEventListener("click", async () => {
      try {
        setStatus(`Launching ${detail.title}…`);
        await window.playbound.playMod(slug);
        setStatus(`Launched ${detail.title}`);
      } catch (err) {
        setStatus(err.message || String(err), true);
      }
    });
    document.getElementById("mod-act-folder")?.addEventListener("click", () => {
      if (detail.installedPath) window.playbound.openFolder(detail.installedPath);
    });
    document.getElementById("mod-act-uninstall")?.addEventListener("click", async () => {
      if (!confirm(`Remove mod ${detail.title}?`)) return;
      try {
        setStatus(`Removing ${detail.title}…`);
        await window.playbound.uninstallMod(slug);
        setStatus(`Removed ${detail.title}`);
        renderModDetailView(slug);
      } catch (err) {
        setStatus(err.message || String(err), true);
      }
    });
    document.getElementById("mod-act-reinstall")?.addEventListener("click", async () => {
      try {
        setStatus(`Installing ${detail.title}…`);
        await window.playbound.installMod(slug);
        setStatus(`Installed ${detail.title}`);
        setProgress(null);
        renderModDetailView(slug);
      } catch (err) {
        setStatus(err.message || String(err), true);
        setProgress(null);
      }
    });
  } else {
    actions.innerHTML = `
      <button class="btn-primary" id="mod-act-install">${
        external ? "Open download page" : "Install"
      }</button>
      ${
        detail.baseGame?.slug
          ? `<button class="btn-secondary" id="mod-act-base">View base game</button>`
          : ""
      }
    `;
    document.getElementById("mod-act-install")?.addEventListener("click", async () => {
      try {
        setStatus(external ? `Opening download page for ${detail.title}…` : `Installing ${detail.title}…`);
        const result = await window.playbound.installMod(slug);
        if (result?.status === "external") {
          setStatus("Opened download page in browser.");
          setProgress(null);
        } else if (result?.status === "waiting-base") {
          setStatus("Installing base game first — finish the setup wizard…");
          setProgress(null);
        } else {
          setStatus(`Installed ${detail.title}`);
          setProgress(null);
          renderModDetailView(slug);
        }
      } catch (err) {
        setStatus(err.message || String(err), true);
        setProgress(null);
      }
    });
    document.getElementById("mod-act-base")?.addEventListener("click", () => {
      if (detail.baseGame?.slug) openGameDetail(detail.baseGame.slug, "modDetail");
    });
  }
}

function openEditionDetail(gameSlug, editionSlug) {
  currentEditionDetail = { gameSlug, editionSlug };
  navigateTo("editionDetail", { gameSlug, editionSlug });
}

async function renderEditionDetailView(gameSlug, editionSlug) {
  const container = views.editionDetail;
  if (!container) return;
  container.innerHTML = `<p class="view-sub">Loading edition…</p>`;

  const [editionsRes, liveStats, gameDetail] = await Promise.all([
    window.playbound.getEditions?.(gameSlug) || Promise.resolve({ editions: [] }),
    window.playbound.getLiveStats?.({ game: gameSlug, edition: editionSlug }) ||
      Promise.resolve(null),
    window.playbound.getGameDetail(gameSlug),
  ]);
  const edition = (editionsRes?.editions || []).find((e) => e.editionSlug === editionSlug);
  if (!edition) {
    container.innerHTML = `
      <button class="btn-secondary btn-sm" id="edition-back">← Back to game</button>
      <p class="view-sub" style="margin-top:12px">Edition not found.</p>
    `;
    document.getElementById("edition-back")?.addEventListener("click", () =>
      openGameDetail(gameSlug, detailReturnView)
    );
    return;
  }

  const cover = edition.coverImage || gameDetail?.coverImage || "";
  const coverHtml = cover
    ? `<div class="detail-cover"><img src="${escapeHtml(cover)}" alt="" loading="lazy" /></div>`
    : `<div class="detail-cover detail-cover-fallback"><span>${escapeHtml(
        (edition.editionName || "?").charAt(0)
      )}</span></div>`;

  const links = edition.links || {};
  const linkButtons = [
    ["Website", links.website],
    ["Discord", links.discord],
    ["Wiki", links.wiki],
    ["GitHub", links.github],
    ["Forum", links.forum],
  ]
    .filter(([, url]) => url)
    .map(
      ([label, url]) =>
        `<button type="button" class="btn-secondary btn-sm" data-ext="${escapeHtml(url)}">${escapeHtml(label)}</button>`
    )
    .join("");

  const editionInstalled = Boolean(
    (gameDetail?.installedEditions || []).some(
      (e) => e.editionSlug === editionSlug && e.exe
    )
  );

  const playSteps = Array.isArray(edition.installAction?.steps)
    ? edition.installAction.steps
    : Array.isArray(edition.installConfig?.playbound_installer?.steps)
      ? edition.installConfig.playbound_installer.steps
      : [];
  const playStepsHtml = playSteps.length
    ? `<ol class="edition-play-steps">${playSteps
        .map(
          (step, i) =>
            `<li><span class="edition-step-n">${i + 1}</span><div><p>${escapeHtml(
              step.text || ""
            )}</p>${
              step.command
                ? `<code class="edition-step-cmd">${escapeHtml(step.command)}</code>`
                : ""
            }</div></li>`
        )
        .join("")}</ol>`
    : "";
  const installNote =
    edition.installAction?.note || edition.installConfig?.playbound_installer?.note || "";
  const reqNotes = edition.requirements?.notes || "";
  const faqHtml = (edition.faq || [])
    .map(
      (item) =>
        `<div class="faq-card"><h3>${escapeHtml(item.q || "FAQ")}</h3><p>${escapeHtml(
          item.a || ""
        )}</p></div>`
    )
    .join("");

  container.innerHTML = `
    <button class="btn-secondary btn-sm" id="edition-back" style="margin-bottom:12px">← ${escapeHtml(
      edition.gameTitle || gameSlug
    )}</button>
    <section class="detail-hero">
      ${coverHtml}
      <div class="detail-hero-copy">
        <div class="chip-row">
          <span class="chip">${escapeHtml(edition.editionType || "edition")}</span>
          ${
            liveStats
              ? `<span class="playing-now-chip">${formatStatNumber(liveStats.playingNow)} playing now</span>`
              : ""
          }
        </div>
        <h1 class="view-title detail-hero-title">${escapeHtml(edition.editionName)}</h1>
        <p class="view-sub detail-hero-sub">${escapeHtml(edition.shortDescription || "")}</p>
        <div class="detail-hero-actions">
          <button class="btn-primary" id="edition-install">${
            editionInstalled ? "Reinstall this edition" : "Install this edition"
          }</button>
          ${
            editionInstalled
              ? `<button class="btn-success" id="edition-play">Play</button>
                 <button class="btn-danger" id="edition-uninstall">Uninstall</button>
                 ${gamePlayHintHtml(gameSlug)}`
              : ""
          }
        </div>
      </div>
    </section>
    ${buildActivityPanelHtml(liveStats, "Edition activity")}
    <section class="detail-section">
      <h2 class="detail-section-title">About</h2>
      ${(edition.description || edition.shortDescription || "")
        .split(/\n\n+/)
        .filter(Boolean)
        .map((para) => `<p class="detail-prose">${escapeHtml(para)}</p>`)
        .join("")}
    </section>
    ${
      playStepsHtml
        ? `<section class="detail-section"><h2 class="detail-section-title">How to get playing</h2>${playStepsHtml}${
            installNote ? `<p class="view-sub" style="margin-top:10px">${escapeHtml(installNote)}</p>` : ""
          }${
            reqNotes
              ? `<p class="edition-req-note">${escapeHtml(reqNotes)}</p>`
              : ""
          }</section>`
        : ""
    }
    ${
      edition.requirements && (edition.requirements.min || edition.requirements.recommended)
        ? `<section class="detail-section"><h2 class="detail-section-title">System Requirements</h2>
        <div class="req-grid">
          <div class="req-card"><div class="req-label">Minimum</div><p>${escapeHtml(edition.requirements.min || "—")}</p></div>
          <div class="req-card"><div class="req-label">Recommended</div><p>${escapeHtml(edition.requirements.recommended || "—")}</p></div>
        </div></section>`
        : ""
    }
    ${
      faqHtml
        ? `<section class="detail-section"><h2 class="detail-section-title">FAQ</h2><div class="faq-list">${faqHtml}</div></section>`
        : ""
    }
    ${
      linkButtons
        ? `<section class="detail-section"><h2 class="detail-section-title">Community</h2><div class="detail-web-tabs">${linkButtons}</div></section>`
        : ""
    }
  `;

  document.getElementById("edition-back")?.addEventListener("click", () =>
    openGameDetail(gameSlug, detailReturnView)
  );
  document.getElementById("edition-install")?.addEventListener("click", async () => {
    setStatus("Starting install...");
    try {
      const res = await window.playbound.install(gameSlug, null, editionSlug);
      if (res.status === "installed") {
        setStatus(res.note || "Install complete!");
        setProgress(null);
        renderEditionDetailView(gameSlug, editionSlug);
      } else if (res.status === "installer-opened") {
        setStatus("Installer opened — waiting for installer to finish…");
        setProgress(null);
        openGameDetail(gameSlug, "editionDetail");
      } else if (res.status === "external") {
        setStatus("Opened download page.");
        setProgress(null);
      } else if (res.status === "cancelled") {
        setStatus(res.note || "Install cancelled.");
        setProgress(null);
      }
    } catch (err) {
      setStatus(err.message || String(err), true);
      setProgress(null);
    }
  });
  document.getElementById("edition-play")?.addEventListener("click", async () => {
    try {
      setStatus("Checking Java / launching…");
      await window.playbound.play(gameSlug, null, editionSlug);
      startGameSession(gameSlug, edition.gameTitle || gameSlug);
      setStatus(`Launched ${edition.editionName || edition.gameTitle || gameSlug}`);
    } catch (err) {
      setStatus(err.message || String(err), true);
    }
  });
  document.getElementById("edition-uninstall")?.addEventListener("click", async () => {
    if (!confirm(`Uninstall ${edition.editionName}? Other editions stay installed.`)) return;
    try {
      await window.playbound.uninstall(gameSlug, editionSlug);
      setStatus(`Uninstalled ${edition.editionName}`);
      renderEditionDetailView(gameSlug, editionSlug);
    } catch (err) {
      setStatus(err.message || String(err), true);
    }
  });
  container.querySelectorAll("[data-ext]").forEach((btn) => {
    btn.addEventListener("click", () =>
      window.playbound.openExternal(btn.dataset.ext, {
        campaign: "launcher_edition_link",
        content: `${gameSlug}:${editionSlug}`,
      })
    );
  });
}

function renderDeepLinkView(ctx) {
  if (!ctx) return;
  deepLinkCtx = ctx;
  navigateTo("deepLink");

  const container = views.deepLink;
  const entry = ctx.entry;
  const title = entry?.title || ctx.mod?.title || ctx.slug || "Action";
  const blurb =
    entry?.blurb ||
    (ctx.action === "join" && ctx.join?.host
      ? `Join ${ctx.join.name || `${ctx.join.host}:${ctx.join.port}`}`
      : ctx.modError
        ? String(ctx.modError)
        : "");

  container.innerHTML = `
    <h1 class="view-title">PlayBound Action</h1>
    <p class="view-sub">Requested action from playbound.club</p>

    <div class="settings-group">
      <h2 style="font-size: 20px; font-weight: 800; margin-bottom: 8px">${escapeHtml(title)}</h2>
      <p class="settings-hint">${escapeHtml(blurb)}</p>
      
      <div style="margin-top: 20px; display: flex; gap: 10px; flex-wrap: wrap;" id="dl-actions"></div>
      ${
        entry?.addons && entry.addons.length > 0 && ctx.action === "install"
          ? `<div class="detail-addons-picker" style="margin: 0.75rem 0;">
               <p style="font-weight:600; margin-bottom:0.5rem; font-size:13px; color:#a1a1aa;">Optional Downloads</p>
               ${entry.addons
                 .map(
                   (a) =>
                     `<label style="display:block; font-size:13px; margin-bottom:0.25rem; color:#e2e8f0; display:flex; align-items:flex-start; gap:0.5rem; cursor:pointer;">
                        <input type="checkbox" class="addon-checkbox" value="${escapeHtml(a.id)}" checked style="margin-top:2px;" />
                        <div>
                          <div>${escapeHtml(a.name)}</div>
                          <div style="font-size:11px; color:#a1a1aa;">${escapeHtml(a.description || "")}</div>
                        </div>
                      </label>`
                 )
                 .join("")}
             </div>`
          : ""
      }
    </div>
  `;

  const actions = document.getElementById("dl-actions");
  if (ctx.action === "install") {
    actions.innerHTML = `
      <button class="btn-primary" id="dl-act-run" disabled>Installing…</button>
      <button class="btn-secondary" id="dl-act-cancel">Cancel</button>
    `;

    const startInstall = async () => {
      setStatus(`Installing ${title}…`);
      try {
        const checkboxes = document.querySelectorAll(".addon-checkbox");
        const addons = Array.from(checkboxes).filter((cb) => cb.checked).map((cb) => cb.value);
        const res = await window.playbound.install(ctx.slug, null, ctx.editionSlug || null, addons);
        if (res.status === "installer-opened") {
          setStatus("Installer opened — waiting for installer to finish…");
          setProgress(null);
          openGameDetail(ctx.slug, "deepLink");
          return;
        }
        if (res.status === "installed") {
          setStatus("Install complete!");
          setProgress(null);
        }
        navigateTo("library");
      } catch (err) {
        setStatus(err.message || String(err), true);
        setProgress(null);
        const btn = document.getElementById("dl-act-run");
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Retry Install";
        }
      }
    };

    document.getElementById("dl-act-run")?.addEventListener("click", () => {
      void startInstall();
    });

    // Auto-start install immediately
    void startInstall();
  } else if (ctx.action === "play") {
    actions.innerHTML = `
      <button class="btn-success" id="dl-act-run">Launch Game</button>
      <button class="btn-secondary" id="dl-act-cancel">Cancel</button>
    `;
    document.getElementById("dl-act-run").addEventListener("click", async () => {
      try {
        await window.playbound.play(ctx.slug, ctx.join, ctx.editionSlug || null);
        startGameSession(ctx.slug, title);
        navigateTo("home");
      } catch (err) {
        setStatus(err.message || String(err), true);
      }
    });
  } else if (ctx.action === "join") {
    const host = ctx.join?.host || "";
    const port = Number(ctx.join?.port || 0);
    actions.innerHTML = `
      <button class="btn-success" id="dl-act-run" ${host && port ? "" : "disabled"}>Join Server</button>
      <button class="btn-secondary" id="dl-act-cancel">Cancel</button>
    `;
    document.getElementById("dl-act-run")?.addEventListener("click", async () => {
      try {
        setStatus(`Joining ${host}:${port}…`);
        await window.playbound.play(
          ctx.slug,
          { host, port, name: ctx.join?.name || "" },
          ctx.editionSlug || null
        );
        startGameSession(ctx.slug, title);
        navigateTo("home");
      } catch (err) {
        setStatus(err.message || String(err), true);
      }
    });
  } else if (ctx.action === "install-mod") {
    if (ctx.modError) {
      actions.innerHTML = `
        <p class="settings-hint" style="flex-basis:100%;color:#f87171;">${escapeHtml(ctx.modError)}</p>
        <button class="btn-secondary" id="dl-act-cancel">Close</button>
      `;
    } else {
      actions.innerHTML = `
        <button class="btn-primary" id="dl-act-run" disabled>Installing Mod…</button>
        <button class="btn-secondary" id="dl-act-cancel">Cancel</button>
      `;

      const startModInstall = async () => {
        try {
          setStatus(`Installing mod ${title}…`);
          const res = await window.playbound.installMod(ctx.slug);
          if (res?.status === "needs-base-game") {
            setStatus(`Install ${res.baseGameSlug || "the base game"} first, then retry the mod.`, true);
            const btn = document.getElementById("dl-act-run");
            if (btn) {
              btn.disabled = false;
              btn.textContent = "Retry Mod Install";
            }
            return;
          }
          setStatus("Mod installed.");
          navigateTo("library");
        } catch (err) {
          setStatus(err.message || String(err), true);
          const btn = document.getElementById("dl-act-run");
          if (btn) {
            btn.disabled = false;
            btn.textContent = "Retry Mod Install";
          }
        }
      };

      document.getElementById("dl-act-run")?.addEventListener("click", () => {
        void startModInstall();
      });

      // Auto-start mod install immediately
      void startModInstall();
    }
  } else if (ctx.action === "uninstall" || ctx.action === "uninstall-mod") {
    const isMod = ctx.action === "uninstall-mod";
    actions.innerHTML = `
      <button class="btn-danger" id="dl-act-run">${isMod ? "Remove Mod" : "Uninstall"}</button>
      <button class="btn-secondary" id="dl-act-cancel">Cancel</button>
    `;
    document.getElementById("dl-act-run")?.addEventListener("click", async () => {
      try {
        setStatus(isMod ? "Removing…" : "Uninstalling…");
        if (isMod) await window.playbound.uninstallMod(ctx.slug);
        else await window.playbound.uninstall(ctx.slug, ctx.editionSlug || null);
        setStatus(isMod ? `Removed ${title}.` : `Uninstalled ${title}.`);
        await window.playbound.clearContext();
        navigateTo("library");
      } catch (err) {
        setStatus(err.message || String(err), true);
      }
    });
  } else {
    actions.innerHTML = `
      <p class="settings-hint" style="flex-basis:100%;">This action (${escapeHtml(
        String(ctx.action || "unknown")
      )}) isn't supported in this panel. Close and try again from the launcher library.</p>
      <button class="btn-secondary" id="dl-act-cancel">Close</button>
    `;
  }

  document.getElementById("dl-act-cancel")?.addEventListener("click", async () => {
    await window.playbound.clearContext();
    navigateTo("home");
  });
}

function createGameCard(game) {
  const card = document.createElement("div");
  card.className = "game-card";

  const bgGrad =
    Array.isArray(game.art) && game.art.length >= 2
      ? `linear-gradient(135deg, ${game.art[0]}, ${game.art[1]})`
      : `linear-gradient(135deg, #312e81, #a78bfa)`;

  const banner = document.createElement("div");
  banner.className = "card-banner";
  banner.style.background = bgGrad;
  banner.textContent = (game.title || "?").charAt(0);

  if (game.coverImage) {
    const img = document.createElement("img");
    img.className = "card-cover";
    img.src = game.coverImage;
    img.alt = "";
    img.loading = "lazy";
    img.addEventListener("error", () => {
      img.remove();
      banner.textContent = (game.title || "?").charAt(0);
    });
    banner.textContent = "";
    banner.appendChild(img);
  }

  card.appendChild(banner);

  const body = document.createElement("div");
  body.className = "card-body";
  body.innerHTML = `
      <div class="card-title"><span class="card-title-text">${escapeHtml(game.title)}</span>${
        game.testing || game.status === "testing"
          ? `<span class="badge card-testing-badge">Testing</span>`
          : ""
      }</div>
      <div class="card-blurb">${escapeHtml(game.blurb || "")}</div>
      <div class="card-footer">
        <span style="font-size: 11px; color: var(--text-dim);">${escapeHtml(game.approxSize || "")}</span>
        <button class="btn-secondary btn-sm" type="button">View</button>
      </div>
  `;
  card.appendChild(body);

  card.addEventListener("click", () => openGameDetail(game.slug, currentView));
  return card;
}

function formatOfferExpiration(endDate) {
  if (!endDate) return null;
  const end = new Date(endDate);
  const diffMs = end.getTime() - Date.now();
  if (diffMs <= 0) return null;
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffHours < 24) {
    const hours = Math.floor(diffHours);
    return hours <= 1 ? "Ends today" : `${hours}h left`;
  }
  if (diffDays < 2) return "Ends tomorrow";
  if (diffDays < 7) {
    return `Ends ${end.toLocaleDateString("en-US", { weekday: "short" })}`;
  }
  return `${Math.floor(diffDays)}d left`;
}

function storeDisplayName(store) {
  const names = {
    epic: "Epic Games",
    steam: "Steam",
    gog: "GOG",
    prime_gaming: "Prime Gaming",
  };
  return names[store] || store;
}

function offerTypeBadgeLabel(type, store) {
  if (type === "free_to_keep") return "FREE TO KEEP";
  if (type === "free_weekend") return "FREE WEEKEND";
  if (type === "free_trial") return "FREE TRIAL";
  if (type === "free_with_subscription") return store === "prime_gaming" ? "PRIME" : "SUBSCRIPTION";
  return "FREE";
}

function createFreeOfferCard(offer) {
  const card = document.createElement("div");
  card.className = "free-offer-card";

  const displayTitle = (offer.metadata && offer.metadata.title) || offer.unmatchedTitle || offer.externalId || "Free Game";
  const storeName = storeDisplayName(offer.store);
  const typeLabel = offerTypeBadgeLabel(offer.offerType, offer.store);
  const expiry = formatOfferExpiration(offer.endDate);

  const banner = document.createElement("div");
  banner.className = "free-offer-banner";
  if (offer.coverImage) {
    const img = document.createElement("img");
    img.className = "free-offer-cover";
    img.src = offer.coverImage;
    img.alt = "";
    img.loading = "lazy";
    img.addEventListener("error", () => {
      img.remove();
      banner.textContent = displayTitle.charAt(0);
    });
    banner.appendChild(img);
  } else {
    banner.textContent = displayTitle.charAt(0);
  }

  const storeBadge = document.createElement("span");
  storeBadge.className = `store-badge store-badge-${escapeHtml(offer.store)}`;
  storeBadge.textContent = storeName;
  banner.appendChild(storeBadge);

  const typeBadge = document.createElement("span");
  typeBadge.className = "offer-type-badge";
  typeBadge.textContent = typeLabel;
  banner.appendChild(typeBadge);

  card.appendChild(banner);

  const body = document.createElement("div");
  body.className = "free-offer-body";
  body.innerHTML = `
    <div class="free-offer-title" title="${escapeHtml(displayTitle)}">${escapeHtml(displayTitle)}</div>
    <div class="free-offer-meta">
      ${offer.retailPrice ? `<span class="free-offer-price-old">${escapeHtml(offer.retailPrice)}</span>` : ""}
      <span class="free-offer-free-label">FREE</span>
      ${expiry ? `<span class="free-offer-expiry">⏱ ${escapeHtml(expiry)}</span>` : ""}
    </div>
    <div class="free-offer-actions">
      <button class="btn-primary btn-sm btn-claim" type="button">Claim on ${escapeHtml(storeName)}</button>
    </div>
  `;

  body.querySelector(".btn-claim")?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (offer.claimUrl) {
      window.playbound.openExternal(offer.claimUrl);
    }
  });

  card.addEventListener("click", () => {
    if (offer.gameSlug) {
      openGameDetail(offer.gameSlug, currentView);
    } else if (offer.claimUrl) {
      window.playbound.openExternal(offer.claimUrl);
    }
  });

  card.appendChild(body);
  return card;
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Every attribute we build today is double-quoted, so this is not currently
    // reachable — it is here so that writing a single-quoted one later cannot
    // quietly open an injection point in catalog-driven markup.
    .replace(/'/g, "&#39;");
}

window.playbound.onProgress(({ phase, received, total, addon, message }) => {
  if (phase === "resolving") setStatus("Resolving download package...");
  else if (phase === "java") setStatus(message || "Installing Java…");
  else if (phase === "downloading") {
    const pct = total ? Math.round((received / total) * 100) : null;
    const prefix = addon ? `Downloading ${addon}...` : "Downloading...";
    setStatus(`${prefix} ${fmtBytes(received)}${total ? ` of ${fmtBytes(total)} (${pct}%)` : ""}`);
    setProgress(pct);
  } else if (phase === "extracting") {
    setStatus("Extracting game files...");
    setProgress(100);
  } else if (phase === "installer-ready") {
    setStatus("Installer opened — finish the setup wizard…");
    setProgress(null);
  } else if (phase === "installing-base") {
    setStatus("Installing required base game…");
    setProgress(null);
  } else if (phase === "done") {
    setStatus("Complete!");
    setProgress(null);
  }
});

window.playbound.onInstallDetected((data) => {
  setProgress(null);
  if (data?.slug) {
    setStatus("Install detected — added to library.");
  } else if (data?.scanned != null) {
    setStatus(`Library scan found ${data.scanned} install(s).`);
  } else {
    setStatus("Installs updated.");
  }
  if (currentView === "library") renderLibraryView();
  else if (currentView === "home") renderHomeView();
  else if (currentView === "gameDetail" && data?.slug && currentDetailSlug === data.slug) {
    renderGameDetailView(data.slug);
  }
});

window.playbound.onInstallScan?.((data) => {
  const phase = data?.phase;
  if (phase === "scanning" || phase === "waiting") {
    // Progress only — do not rebuild Library/Home/Detail (causes flicker).
    if (data.message) setStatus(data.message);
    else if (data.slug) setStatus(`Searching for ${data.slug}…`);
    return;
  }
  if (phase === "pending") {
    if (data.message) setStatus(data.message);
    else if (data.slug) setStatus(`Waiting for ${data.slug} install…`);
  } else if (phase === "needs-locate") {
    setStatus(
      data.slug
        ? `Couldn't find ${data.slug} automatically — ${selectExecutableLabel().toLowerCase()} in Library.`
        : `Couldn't find the install — ${selectExecutableLabel().toLowerCase()} in Library.`,
      true
    );
  } else if (phase === "dismissed") {
    setStatus("Removed from Library.");
  }
  // Re-render only on state-changing phases (pending / needs-locate / dismissed).
  if (currentView === "library") renderLibraryView();
  else if (currentView === "home") renderHomeView();
  else if (currentView === "gameDetail" && data?.slug && currentDetailSlug === data.slug) {
    renderGameDetailView(data.slug);
  }
});

window.playbound.onInstallDetectFailed?.((data) => {
  const name = data?.slug || "the game";
  setStatus(
    `Couldn't auto-detect ${name}. Open Library and click ${selectExecutableLabel()} to locate it.`,
    true
  );
  if (currentView === "library") renderLibraryView();
  else if (currentView === "gameDetail" && data?.slug && currentDetailSlug === data.slug) {
    renderGameDetailView(data.slug);
  }
});

window.playbound.onContext((data) => {
  if (data) renderDeepLinkView(data);
  else if (currentView === "deepLink") navigateTo("home");
});

refreshAccountStatus();
window.playbound.getContext().then((data) => {
  if (data) renderDeepLinkView(data);
  else navigateTo("home");
});

// --- ADD FRIENDS LOGIC ---
let _addFriendsMode = "username";
let _addFriendsSent = {};

async function toggleAddFriendsPanel(forceShow) {
  const panel = document.getElementById("add-friends-panel");
  if (!panel) return;
  const isHidden = panel.style.display === "none";
  if (isHidden || forceShow) {
    panel.style.display = "block";
    if (!panel.dataset.initialized) {
      panel.dataset.initialized = "true";
      initAddFriendsPanel();
    }
  } else {
    panel.style.display = "none";
  }
}

async function initAddFriendsPanel() {
  const tabUser = document.getElementById("add-friends-tab-username");
  const tabPlayers = document.getElementById("add-friends-tab-players");
  const tabEmail = document.getElementById("add-friends-tab-email");
  const formUser = document.getElementById("add-friends-form-username");
  const formPlayers = document.getElementById("add-friends-form-players");
  const formEmail = document.getElementById("add-friends-form-email");
  const msg = document.getElementById("add-friends-message");
  const resultsDiv = document.getElementById("add-friends-results");

  const styleInactiveTab = (el) => {
    el.className = "btn-secondary btn-sm";
    el.style.background = "transparent";
    el.style.border = "none";
    el.style.color = "var(--text-muted)";
  };
  const styleActiveTab = (el) => {
    el.className = "btn-primary btn-sm";
    el.style.background = "";
    el.style.color = "";
    el.style.border = "";
  };

  const setMode = (mode) => {
    _addFriendsMode = mode;
    msg.style.display = "none";
    resultsDiv.innerHTML = "";
    styleInactiveTab(tabUser);
    styleInactiveTab(tabPlayers);
    styleInactiveTab(tabEmail);
    formUser.style.display = "none";
    formPlayers.style.display = "none";
    formEmail.style.display = "none";
    if (mode === "username") {
      styleActiveTab(tabUser);
      formUser.style.display = "flex";
    } else if (mode === "players") {
      styleActiveTab(tabPlayers);
      formPlayers.style.display = "flex";
    } else {
      styleActiveTab(tabEmail);
      formEmail.style.display = "flex";
    }
  };

  tabUser.onclick = () => setMode("username");
  tabPlayers.onclick = () => setMode("players");
  tabEmail.onclick = () => setMode("email");

  const catalog = await window.playbound.getCatalog().catch(() => []);
  const gamesList = Array.isArray(catalog) ? catalog : catalog?.games || [];
  const gameSelect = document.getElementById("add-friends-game-select");
  const genreSelect = document.getElementById("add-friends-genre-select");
  
  gamesList.forEach(g => {
    const opt = document.createElement("option");
    opt.value = g.slug;
    opt.textContent = g.title;
    gameSelect.appendChild(opt);
  });
  
  const genres = Array.from(new Set(gamesList.flatMap(g => g.tags || []))).sort();
  genres.forEach(g => {
    const opt = document.createElement("option");
    opt.value = g;
    opt.textContent = g;
    genreSelect.appendChild(opt);
  });
  
  gameSelect.onchange = () => { if (gameSelect.value) genreSelect.value = ""; };
  genreSelect.onchange = () => { if (genreSelect.value) gameSelect.value = ""; };

  const renderResults = (users) => {
    if (!users || users.length === 0) {
      msg.textContent = _addFriendsMode === "username" ? "Nobody matched that." : "Nobody else has that in their library yet.";
      msg.style.display = "block";
      resultsDiv.innerHTML = "";
      return;
    }
    
    msg.style.display = "none";
    resultsDiv.innerHTML = users.map(u => {
      const isSent = _addFriendsSent[u.id];
      let btnHtml = "";
      if (u.friendStatus === "friends") {
        btnHtml = `<span style="font-size: 12px; font-weight: bold; color: var(--text-muted);">✓ Friends</span>`;
      } else if (u.friendStatus === "incoming_request") {
        btnHtml = `<span style="font-size: 12px; font-weight: bold; color: var(--primary);">Wants to be friends</span>`;
      } else if (u.friendStatus === "outgoing_request" || isSent) {
        btnHtml = `<span style="font-size: 12px; font-weight: bold; color: var(--text-muted);">🕒 Requested</span>`;
      } else {
        btnHtml = `<button type="button" class="btn-primary btn-sm btn-send-request" data-id="${escapeHtml(u.id)}" style="border-radius: 16px; padding: 4px 12px; font-size: 12px;">+ Add</button>`;
      }
      
      const extra = u.sharedGames && u.sharedGames.length > 0 
        ? `<div style="font-size: 11px; color: var(--text-muted); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
            ${escapeHtml(u.sharedGames.join(", "))}${(u.sharedCount || 0) > u.sharedGames.length ? ` +${(u.sharedCount || 0) - u.sharedGames.length} more` : ""}
           </div>`
        : "";

      return `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: rgba(255,255,255,0.05); border-radius: 8px; margin-bottom: 8px;">
          <div style="min-width: 0; padding-right: 12px;">
            <div style="font-weight: bold; font-size: 14px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${escapeHtml(u.username)}</div>
            ${extra}
          </div>
          <div style="flex-shrink: 0;" id="request-btn-wrap-${escapeHtml(u.id)}">
            ${btnHtml}
          </div>
        </div>
      `;
    }).join("");
    
    resultsDiv.querySelectorAll(".btn-send-request").forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.id;
        _addFriendsSent[id] = true;
        const wrap = document.getElementById(`request-btn-wrap-${id}`);
        wrap.innerHTML = `<span style="font-size: 12px; font-weight: bold; color: var(--text-muted);">🕒 Requested</span>`;
        
        try {
          const res = await window.playbound.sendFriendRequest(id);
          if (res.error) throw new Error(res.error);
          void refreshFriendsData();
        } catch (err) {
          _addFriendsSent[id] = false;
          wrap.innerHTML = `<button type="button" class="btn-primary btn-sm btn-send-request" data-id="${escapeHtml(id)}" style="border-radius: 16px; padding: 4px 12px; font-size: 12px;">+ Add</button>`;
          msg.textContent = err.message || "Couldn't send request.";
          msg.style.color = "var(--danger)";
          msg.style.display = "block";
          // Re-bind click on failure
          const newBtn = wrap.querySelector(".btn-send-request");
          if (newBtn) newBtn.onclick = btn.onclick;
        }
      };
    });
  };

  const doSearch = async (promise) => {
    msg.textContent = "Searching...";
    msg.style.color = "var(--text-muted)";
    msg.style.display = "block";
    resultsDiv.innerHTML = "";
    document.getElementById("btn-search-username").disabled = true;
    document.getElementById("btn-search-players").disabled = true;
    
    try {
      const res = await promise;
      if (res.error) throw new Error(res.error);
      renderResults(res.users || []);
    } catch (err) {
      msg.textContent = err.message || "Couldn't reach the server.";
      msg.style.color = "var(--danger)";
      msg.style.display = "block";
    } finally {
      document.getElementById("btn-search-username").disabled = false;
      document.getElementById("btn-search-players").disabled = false;
    }
  };

  formUser.onsubmit = (e) => {
    e.preventDefault();
    const q = document.getElementById("add-friends-username-input").value.trim();
    if (q.length < 3) {
      msg.textContent = "Enter at least 3 characters.";
      msg.style.color = "var(--danger)";
      msg.style.display = "block";
      resultsDiv.innerHTML = "";
      return;
    }
    doSearch(window.playbound.searchUsers(q));
  };

  formPlayers.onsubmit = (e) => {
    e.preventDefault();
    const g = gameSelect.value;
    const gn = genreSelect.value;
    if (!g && !gn) {
      msg.textContent = "Pick a game or a genre.";
      msg.style.color = "var(--danger)";
      msg.style.display = "block";
      resultsDiv.innerHTML = "";
      return;
    }
    const params = g ? { game: g } : { genre: gn };
    doSearch(window.playbound.discoverPlayers(params));
  };

  formEmail.onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById("add-friends-email-input").value.trim();
    if (!email.includes("@")) {
      msg.textContent = "Enter a valid email address.";
      msg.style.color = "var(--danger)";
      msg.style.display = "block";
      return;
    }
    const btn = document.getElementById("btn-invite-email");
    btn.disabled = true;
    msg.textContent = "Sending…";
    msg.style.color = "var(--text-muted)";
    msg.style.display = "block";
    resultsDiv.innerHTML = "";
    try {
      const res = await window.playbound.inviteFriendByEmail(email);
      if (res.error) throw new Error(res.error);
      msg.textContent = res.message || "Invite sent.";
      msg.style.color = "var(--primary)";
      document.getElementById("add-friends-email-input").value = "";
      if (res.mode === "existing") void refreshFriendsData();
    } catch (err) {
      msg.textContent = err.message || "Couldn't send invite.";
      msg.style.color = "var(--danger)";
    } finally {
      btn.disabled = false;
    }
  };
}
function enhanceSelect(selectEl) {
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
  icon.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
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
    span.textContent = selectedOpt ? (selectedOpt.textContent || selectedOpt.label || selectedOpt.value) : "Select…";

    Array.from(selectEl.options).forEach((opt) => {
      const isSelected = opt === selectedOpt || String(opt.value) === String(selectEl.value);
      const item = document.createElement("div");
      item.className = "premium-select-item" + (isSelected ? " selected" : "") + (opt.disabled ? " disabled" : "");
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
        check.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
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
    document.querySelectorAll(".premium-select.open").forEach(p => {
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
  selectEl.appendChild = function(child) {
    const res = origAppendChild(child);
    renderOptions();
    return res;
  };
  const origInsertBefore = selectEl.insertBefore.bind(selectEl);
  selectEl.insertBefore = function(newNode, refNode) {
    const res = origInsertBefore(newNode, refNode);
    renderOptions();
    return res;
  };
  const origRemoveChild = selectEl.removeChild.bind(selectEl);
  selectEl.removeChild = function(child) {
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
        configurable: true
      });
    }
  } catch {}
  
  try {
    const protoVal = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
    if (protoVal && protoVal.set) {
      Object.defineProperty(selectEl, "value", {
        get() { return protoVal.get.call(this); },
        set(v) { protoVal.set.call(this, v); renderOptions(); },
        configurable: true
      });
    }
  } catch {
    /* ignore descriptor errors */
  }

  const observer = new MutationObserver(() => renderOptions());
  observer.observe(selectEl, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "value"] });
  
  renderOptions();
}

document.addEventListener("click", (e) => {
  document.querySelectorAll(".premium-select.open").forEach(p => {
    if (!p.contains(e.target)) {
      p.classList.remove("open");
      p.querySelector(".premium-select-btn")?.setAttribute("aria-expanded", "false");
    }
  });
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.querySelectorAll(".premium-select.open").forEach(p => {
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
