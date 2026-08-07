// State
let currentView = "home";
let accountState = { connected: false };
let deepLinkCtx = null;
let currentDetailSlug = null;
let detailReturnView = "games";
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

const DISCORD_INVITE = "https://discord.gg/yc7WdxATar";
const PODIUM_MEDALS = ["🥇", "🥈", "🥉"];

function normalizePlatform(value) {
  const t = String(value || "")
    .trim()
    .toLowerCase();
  if (t === "browser" || t === "web") return "web";
  if (t === "mac os" || t === "macos" || t === "osx" || t === "mac") return "macos";
  if (t === "iphone" || t === "ipad") return "ios";
  return t;
}

function isGameDesktopCompatible(game) {
  if (game?.browserPlayable) return true;
  
  const currentOS = window.playbound.platform.getOS();
  if (currentOS !== "macos" && game?.steamDeck) return true;
  
  const platforms = (game?.platforms || []).map(normalizePlatform).filter(Boolean);
  if (platforms.length === 0) return true;
  
  const allowed = currentOS === "macos" 
    ? new Set(["macos", "web", "browser"]) 
    : new Set(["windows", "macos", "linux", "web"]);
    
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
        ${cell("Active Players")}
      </dl>
      <div class="catalog-stats-popular">
        <h3>Most Popular Right Now</h3>
        <ol>${popularRow.repeat(3)}</ol>
      </div>
      <p class="catalog-stats-footer">Across supported games • Updated every 15 min</p>
    </aside>`;
}

function buildCatalogStatsCardHtml(live) {
  if (!live) {
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
        <div><dt>Active Players</dt><dd>${formatStatNumber(live.playingNow)}</dd></div>
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
  mods: document.getElementById("view-mods"),
  servers: document.getElementById("view-servers"),
  events: document.getElementById("view-events"),
  library: document.getElementById("view-library"),
  friends: document.getElementById("view-friends"),
  settings: document.getElementById("view-settings"),
  gameDetail: document.getElementById("view-game-detail"),
  editionDetail: document.getElementById("view-edition-detail"),
  deepLink: document.getElementById("view-deep-link"),
};
const connectionDot = document.getElementById("connection-dot");
const connectionLabel = document.getElementById("connection-label");
const statusMsg = document.getElementById("statusbar-msg");
const statusProgress = document.getElementById("statusbar-progress");
const statusBar = document.getElementById("statusbar-bar");

const fmtBytes = (n) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(0)} MB` : `${Math.round(n / 1e3)} KB`;

function navigateTo(viewName, params = {}) {
  currentView = viewName;
  const navKey =
    viewName === "gameDetail" || viewName === "editionDetail" ? null : viewName;
  navBtns.forEach((btn) => {
    btn.classList.toggle("active", Boolean(navKey) && btn.dataset.view === navKey);
  });
  Object.keys(views).forEach((k) => {
    views[k]?.classList.toggle("active", k === viewName);
  });

  if (viewName === "home") renderHomeView();
  else if (viewName === "games") renderGamesView();
  else if (viewName === "mods") renderModsView();
  else if (viewName === "servers") renderServersView();
  else if (viewName === "events") renderEventsView();
  else if (viewName === "library") renderLibraryView();
  else if (viewName === "friends") renderFriendsView();
  else if (viewName === "settings") renderSettingsView();
  else if (viewName === "gameDetail") renderGameDetailView(params.slug);
  else if (viewName === "editionDetail") {
    renderEditionDetailView(params.gameSlug, params.editionSlug);
  }
}

navBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.dataset.view) navigateTo(btn.dataset.view);
  });
});

document.getElementById("sidebar-discord")?.addEventListener("click", (e) => {
  e.preventDefault();
  window.playbound.openExternal(DISCORD_INVITE);
});

document.querySelectorAll('input[name="compat-filter"]').forEach((input) => {
  input.addEventListener("change", () => {
    if (input.checked) void setCompatibilityFilter(input.value);
  });
});

void loadCompatibilitySetting();

function setStatus(text, isError = false) {
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
    setStatus(`Update ${data.version} available…`);
    setProgress(null);
    patchSettingsHint(`Update ${data.version} available.`);
  } else if (phase === "downloading") {
    const pct = Math.max(0, Math.min(100, Number(data.percent) || 0));
    setStatus(`Downloading update… ${pct}%`);
    setProgress(pct);
    patchSettingsHint(`Downloading… ${pct}%`);
  } else if (phase === "ready") {
    setStatus(`Update ${data.version} ready — install from Settings`);
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

    <div class="section-header">Installed Games</div>
    <div id="home-installed-grid" class="game-grid"></div>

    <div class="section-header">
      <span>Featured Catalog</span>
      <button class="btn-secondary btn-sm" id="home-browse-games">Browse Games</button>
    </div>
    <div id="home-catalog-grid" class="game-grid"></div>
  `;

  document.getElementById("home-browse-games")?.addEventListener("click", () => navigateTo("games"));

  /**
   * Local data only. Recently-played, installed and the catalog are all read
   * from memory or disk in the main process, so these resolve immediately.
   *
   * Live stats are deliberately NOT awaited here. That call goes over the
   * network, and having it inside this Promise.all meant the entire homepage —
   * including three lists already sitting in memory — stayed blank until it
   * came back. On a slow or unreachable connection that was the whole 5+
   * second wait for any content at all.
   */
  const [recent, installed, catalog] = await Promise.all([
    window.playbound.getRecentlyPlayed(),
    window.playbound.getInstalled(),
    window.playbound.getCatalog(),
  ]);

  // Reserve the card's space up front so the header does not jump when the
  // real numbers arrive.
  const statsSlot = document.getElementById("home-stats-slot");
  if (statsSlot) statsSlot.innerHTML = buildCatalogStatsSkeletonHtml();

  void (async () => {
    const now = Date.now();
    if (!_liveStatsPromise || now - _liveStatsTime > 60_000) {
      _liveStatsPromise = window.playbound.getLiveStats?.() ?? Promise.resolve(null);
      _liveStatsTime = now;
    }
    
    const live = await _liveStatsPromise;
    // The user may have navigated away while this was in flight, in which case
    // the slot no longer exists — or has been replaced by a newer render.
    if (!statsSlot || !statsSlot.isConnected) return;
    statsSlot.innerHTML = buildCatalogStatsCardHtml(live);
    statsSlot.querySelectorAll("[data-popular-slug]").forEach((btn) => {
      btn.addEventListener("click", () => openGameDetail(btn.dataset.popularSlug, "home"));
    });
  })();

  const recentSec = document.getElementById("home-recent-section");
  const recentGrid = document.getElementById("home-recent-grid");
  if (recent && recent.length > 0) {
    recentSec.classList.remove("hidden");
    recentGrid.replaceChildren(...filterByCompatibility(recent).map(createGameCard));
  }

  const installedGrid = document.getElementById("home-installed-grid");
  const installedFiltered = filterByCompatibility(installed || []);
  if (installedFiltered.length > 0) {
    installedGrid.replaceChildren(...installedFiltered.map(createGameCard));
  } else {
    installedGrid.innerHTML = `<p class="view-sub">No games installed yet. <a href="#" id="home-empty-games">Browse Games</a></p>`;
    document.getElementById("home-empty-games")?.addEventListener("click", (e) => {
      e.preventDefault();
      navigateTo("games");
    });
  }

  const catalogGrid = document.getElementById("home-catalog-grid");
  catalogGrid.replaceChildren(
    ...filterByCompatibility(catalog).slice(0, 4).map(createGameCard)
  );
}

async function renderLibraryView() {
  const container = views.library;
  container.innerHTML = `
    <div class="section-header" style="margin-top: 0">
      <div>
        <h1 class="view-title" style="margin: 0">Library</h1>
        <p class="view-sub" style="margin: 4px 0 0 0">Games and mods on this PC — install or add an existing .exe.</p>
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
        <button class="btn-secondary btn-sm" id="btn-add-friend" onclick="window.playbound.openExternal('https://playbound.club/friends')">Add Friend</button>
      </div>
      <div id="friends-content-area" style="margin-top: 20px;">
        <p class="view-sub">Loading friends...</p>
      </div>
    `;
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

    const playing = friends.filter(f => f.presence?.status === "playing");
    const online = friends.filter(f => ["online", "browsing", "away"].includes(f.presence?.status));
    const offline = friends.filter(f => f.presence?.status === "offline");

    let html = "";

    if (incomingRequests.length > 0) {
      html += `
        <div class="friends-section">
          <div class="section-header" style="margin-bottom: 12px">Pending Requests</div>
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

    if (playing.length > 0) {
      html += buildFriendsSectionHtml("Playing", playing, "playing");
    }
    if (online.length > 0) {
      html += buildFriendsSectionHtml("Online", online, "online");
    }
    if (offline.length > 0) {
      html += buildFriendsSectionHtml("Offline", offline, "offline");
    }

    if (!friends.length && !incomingRequests.length) {
      html = `
        <div style="text-align: center; padding: 40px 0; border: 1px dashed var(--border); border-radius: 8px;">
          <p class="view-sub">You don't have any friends yet.</p>
          <button class="btn-primary" style="margin-top: 12px" onclick="window.playbound.openExternal('https://playbound.club/friends')">Find Friends</button>
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

    content.querySelectorAll(".btn-remove-friend").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!confirm("Are you sure you want to remove this friend?")) return;
        btn.disabled = true;
        await window.playbound.removeFriend(btn.dataset.id);
        refreshFriendsData();
      });
    });

  } catch (err) {
    content.innerHTML = `<p class="view-sub" style="color: var(--danger)">Failed to load friends: ${escapeHtml(err.message)}</p>`;
  }
}

function buildFriendsSectionHtml(title, list, type) {
  let listHtml = "";
  for (const f of list) {
    let statusText = "Offline";
    let statusDot = "";
    
    if (type === "playing") {
      statusText = `<span style="color: var(--primary)">Playing ${escapeHtml(f.presence.currentGameId || "a game")}</span>`;
      statusDot = `<span class="status-dot dot-playing"></span>`;
    } else if (type === "online") {
      statusText = escapeHtml(f.presence.status === "browsing" ? "Browsing" : f.presence.status);
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
      <input type="search" id="library-add-search" class="library-add-search" placeholder="Search games…" autocomplete="off" />
      <button type="button" class="btn-secondary btn-sm" id="library-add-close">Close</button>
    </div>
    <p class="view-sub" style="margin:8px 0">Pick a catalog game, then select its .exe on disk.</p>
    <div id="library-add-list" class="library-add-list"></div>
  `;

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
        <span class="library-add-row-hint">Select .exe</span>`;
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

function buildLibraryGameBlock(game, gameMods, modTitles, opts = {}) {
  const block = document.createElement("div");
  block.className = "library-game-block";

  if (opts.orphan) {
    const card = document.createElement("div");
    card.className = "game-card library-orphan-card";
    card.innerHTML = `
      <div class="card-banner" style="background:linear-gradient(135deg,#312e81,#a78bfa)">${escapeHtml((game.title || "?").charAt(0))}</div>
      <div class="card-body">
        <div class="card-title">${escapeHtml(game.title)}</div>
        <div class="card-blurb">Installed mods only</div>
      </div>
    `;
    block.appendChild(card);
  } else if (game.pending) {
    const card = document.createElement("div");
    card.className = "game-card library-pending-card";
    const bgGrad =
      Array.isArray(game.art) && game.art.length >= 2
        ? `linear-gradient(135deg, ${game.art[0]}, ${game.art[1]})`
        : `linear-gradient(135deg, #312e81, #a78bfa)`;
    card.innerHTML = `
      <div class="card-banner" style="background:${bgGrad}">${escapeHtml((game.title || "?").charAt(0))}</div>
      <div class="card-body">
        <div class="card-title">${escapeHtml(game.title)}</div>
        <div class="card-blurb">${
          game.scanning ? "Scanning drives for install…" : "Install not found yet — select the .exe"
        }</div>
      </div>
    `;
    card.addEventListener("click", () => openGameDetail(game.slug, "library"));
    block.appendChild(card);
  } else {
    block.appendChild(createGameCard(game));
  }

  const actions = document.createElement("div");
  actions.className = "library-card-actions";
  if (game.pending) {
    actions.innerHTML = `
      <button class="btn-primary btn-sm btn-lib-locate" type="button">Select .exe</button>
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
    block.appendChild(actions);
  } else if (!opts.orphan && (game.exe || game.dir)) {
    actions.innerHTML = `
      <button class="btn-success btn-sm btn-lib-play" type="button">Play</button>
      ${game.dir ? `<button class="btn-secondary btn-sm btn-lib-folder" type="button">Folder</button>` : ""}
      <button class="btn-danger btn-sm btn-lib-uninstall" type="button">Remove</button>
    `;
    actions.querySelector(".btn-lib-play")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        setStatus(`Launching ${game.title}…`);
        await window.playbound.play(game.slug);
        startGameSession(game.slug, game.title);
        setStatus(`Launched ${game.title}`);
      } catch (err) {
        setStatus(err.message || String(err), true);
      }
    });
    actions.querySelector(".btn-lib-folder")?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (game.dir) window.playbound.openFolder(game.dir);
    });
    actions.querySelector(".btn-lib-uninstall")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm(`Uninstall ${game.title}?`)) return;
      try {
        await window.playbound.uninstall(game.slug);
        setStatus(`Uninstalled ${game.title}`);
        renderLibraryView();
      } catch (err) {
        setStatus(err.message || String(err), true);
      }
    });
    block.appendChild(actions);
  }

  if (gameMods.length) {
    block.appendChild(buildModsDisclosure(gameMods, modTitles));
  }
  return block;
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
    row.innerHTML = `
      <span class="library-mod-title">${escapeHtml(title)}</span>
      <div class="library-mod-actions">
        <button class="btn-primary btn-sm btn-mod-play" type="button">Play</button>
        ${mod.dir ? `<button class="btn-secondary btn-sm btn-mod-folder" type="button">Folder</button>` : ""}
        <button class="btn-danger btn-sm btn-mod-uninstall" type="button">Remove</button>
      </div>
    `;
    row.querySelector(".btn-mod-play")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        setStatus(`Launching ${title}…`);
        await window.playbound.playMod(mod.slug);
        setStatus(`Launched ${title}`);
      } catch (err) {
        setStatus(err.message || String(err), true);
      }
    });
    row.querySelector(".btn-mod-folder")?.addEventListener("click", (e) => {
      e.stopPropagation();
      window.playbound.openFolder(mod.dir);
    });
    row.querySelector(".btn-mod-uninstall")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm(`Remove mod ${title} from library tracking?`)) return;
      await window.playbound.uninstallMod(mod.slug);
      renderLibraryView();
    });
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
    <input type="search" class="input-text" id="mods-search" placeholder="Search mods…" style="margin-top: 16px; max-width: 360px" />
    <p class="view-sub" id="mods-count" style="margin: 10px 0 0 0"></p>
    <div id="mods-grid" class="game-grid" style="margin-top: 16px"></div>
  `;

  document.getElementById("btn-open-mods-web")?.addEventListener("click", () => {
    window.playbound.openExternal("https://playbound.club/mods");
  });

  const res = await window.playbound.getModsCatalog();
  const mods = res.mods || [];
  const search = document.getElementById("mods-search");
  const paint = () => {
    const q = (search.value || "").trim().toLowerCase();
    let list = mods.slice();
    if (q) {
      list = list.filter((m) =>
        [m.title, m.tagline, m.slug, m.baseGameSlug].join(" ").toLowerCase().includes(q)
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
            <div class="card-blurb">${escapeHtml(mod.tagline || mod.baseGameSlug || "")}</div>
            <div class="card-footer">
              <span style="font-size: 11px; color: var(--text-dim);">${escapeHtml(mod.approxSize || "")}</span>
              <button class="btn-primary btn-sm btn-mod-install" type="button">Install</button>
            </div>
          </div>
        `;
        // Cascade: mod cover → art gradient (already on banner) → base-game cover
        const coverUrl = mod.coverImage || mod.baseGameCoverImage || "";
        const useBaseFallback = !mod.coverImage && Boolean(mod.baseGameCoverImage);
        const hasArt =
          Array.isArray(mod.art) && mod.art.length >= 2 && mod.art[0] && mod.art[1];
        if (mod.coverImage || (!hasArt && mod.baseGameCoverImage)) {
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
            if (result?.status === "external-opened") {
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
          window.playbound.openExternal(`https://playbound.club/mods/${mod.slug}`);
        });
        return card;
      })
    );
  };
  search.addEventListener("input", paint);
  paint();
}

async function renderEventsView() {
  const container = views.events;
  container.innerHTML = `
    <div class="section-header" style="margin-top: 0">
      <div>
        <h1 class="view-title" style="margin: 0">Events</h1>
        <p class="view-sub" style="margin: 4px 0 0 0">Tournaments and community nights on PlayBound.</p>
      </div>
      <button class="btn-secondary btn-sm" id="btn-open-events-web">Open playbound.club/events</button>
    </div>
    <div id="events-list" class="events-list" style="margin-top: 20px"></div>
  `;

  document.getElementById("btn-open-events-web")?.addEventListener("click", () => {
    window.playbound.openExternal("https://playbound.club/events");
  });

  const res = (await window.playbound.getEvents?.()) || { events: [] };
  const events = res.events || [];
  const list = document.getElementById("events-list");
  if (!events.length) {
    list.innerHTML = `<p class="view-sub">No upcoming events. Check playbound.club/events for updates.</p>`;
    return;
  }
  list.replaceChildren();
  for (const ev of events) {
    const row = document.createElement("div");
    row.className = "event-row";
    const when = ev.startsAt ? new Date(ev.startsAt).toLocaleString() : "";
    row.innerHTML = `
      <div>
        <p class="event-when">${escapeHtml(when)}</p>
        <p class="event-title">${escapeHtml(ev.title)}</p>
        <p class="event-desc">${escapeHtml(ev.description || "")}</p>
        ${ev.gameSlug ? `<p class="event-game">${escapeHtml(ev.gameSlug)}</p>` : ""}
      </div>
      <button class="btn-secondary btn-sm" type="button">View on site</button>
    `;
    row.querySelector("button")?.addEventListener("click", () => {
      window.playbound.openExternal("https://playbound.club/events");
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
      <label class="servers-field">
        <span class="servers-field-label">Game</span>
        <select class="input-text" id="servers-game" aria-label="Base game"></select>
      </label>
      <label class="servers-field">
        <span class="servers-field-label">Mod</span>
        <select class="input-text" id="servers-mod" aria-label="Mod"></select>
      </label>
      <label class="servers-field servers-field-grow">
        <span class="servers-field-label">Search</span>
        <input type="search" class="input-text" id="servers-search" placeholder="Name, map, players…" value="${escapeHtml(serversState.search)}" />
      </label>
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
    (m) => m.baseGameSlug === baseSlug && (m.baseSupported || m.baseHasServers)
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
    if (gameSelect) gameSelect.innerHTML = "";
    fillModDropdown("");
    if (note) {
      note.textContent = "";
      note.dataset.baseNote = "";
    }
    return;
  }

  if (!serversState.selectedSlug || !supported.some((g) => g.slug === serversState.selectedSlug)) {
    serversState.selectedSlug = supported[0].slug;
    serversState.selectedModSlug = "";
  }

  gameSelect.innerHTML = supported
    .map(
      (g) =>
        `<option value="${escapeHtml(g.slug)}" ${g.slug === serversState.selectedSlug ? "selected" : ""}>${escapeHtml(g.title)}</option>`
    )
    .join("");

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
      <div style="margin-top: 14px; display: flex; gap: 8px;">
        <button class="btn-primary btn-sm" id="set-btn-signin">${accountState.connected ? "Switch account" : "Sign in"}</button>
        ${accountState.connected ? '<button class="btn-danger btn-sm" id="set-btn-signout">Sign out</button>' : ""}
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
      <div style="margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap;">
        <button class="btn-secondary btn-sm" id="set-btn-check-update" ${packaged ? "" : "disabled"}>Check for updates</button>
        <button class="btn-primary btn-sm" id="set-btn-install-update" ${ready ? "" : "disabled"}>Install and restart</button>
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
    } else {
      setStatus("You're up to date.");
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

let detailActiveTab = "overview";
/** Sort state for game-detail servers table */
const detailServersSort = { sort: "players", sortDir: "desc" };

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

  const editionPickerOptions = editions
    .map(
      (ed) =>
        `<option value="${escapeHtml(ed.editionSlug)}" ${ed.isDefault ? "selected" : ""}>${escapeHtml(ed.editionName)}${ed.isDefault ? " (default)" : ""}</option>`
    )
    .join("");

  container.innerHTML = `
    <button class="btn-secondary btn-sm" id="detail-back" style="margin-bottom: 12px">← Back</button>

    <section class="detail-hero">
      ${coverHtml}
      <div class="detail-hero-copy">
        <div class="chip-row">${genreChips}${detail.multiplayer ? '<span class="chip chip-accent">Multiplayer</span>' : ""}${playingChip}</div>
        <h1 class="view-title detail-hero-title">${escapeHtml(detail.title)}</h1>
        <p class="view-sub detail-hero-sub">${escapeHtml(detail.blurb)} · ${escapeHtml(detail.approxSize || "")}${detail.version ? ` · v${escapeHtml(detail.version)}` : ""}</p>
        <div class="detail-hero-actions" id="detail-actions"></div>
      </div>
    </section>

    <nav class="detail-tabs" id="detail-tabs">
      <button type="button" class="detail-tab ${detailActiveTab === "overview" ? "active" : ""}" data-tab="overview">Overview</button>
      <button type="button" class="detail-tab ${detailActiveTab === "install" ? "active" : ""}" data-tab="install">Install</button>
      <button type="button" class="detail-tab ${detailActiveTab === "servers" ? "active" : ""}" data-tab="servers">Servers</button>
      <button type="button" class="detail-tab ${detailActiveTab === "mods" ? "active" : ""}" data-tab="mods">Mods</button>
      <button type="button" class="detail-tab ${detailActiveTab === "guides" ? "active" : ""}" data-tab="guides">Guides</button>
      <button type="button" class="detail-tab ${detailActiveTab === "news" ? "active" : ""}" data-tab="news">News</button>
      <button type="button" class="detail-tab ${detailActiveTab === "media" ? "active" : ""}" data-tab="media">Media</button>
    </nav>

    <div class="detail-tab-panels">
      <div class="detail-tab-panel ${detailActiveTab === "overview" ? "active" : ""}" data-panel="overview">
        ${buildActivityPanelHtml(liveStats)}
        <section class="detail-section" id="detail-editions-sec">
          <h2 class="detail-section-title">Editions</h2>
          <div class="editions-list" id="detail-editions-list"></div>
        </section>
        <section class="detail-section">
          <h2 class="detail-section-title">About</h2>
          <p class="detail-prose">${escapeHtml(detail.description || detail.blurb || "")}</p>
        </section>
        ${
          featureItems
            ? `<section class="detail-section"><h2 class="detail-section-title">Features</h2><ul class="feature-list">${featureItems}</ul></section>`
            : ""
        }
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
        <div class="detail-web-tabs">
          <button type="button" class="btn-secondary btn-sm" data-web-tab="discussion">Discussion on site</button>
          <button type="button" class="btn-secondary btn-sm" data-web-tab="reviews">Reviews on site</button>
          <button type="button" class="btn-secondary btn-sm" data-web-tab="achievements">Achievements on site</button>
        </div>
        <p class="view-sub"><a href="#" id="detail-open-site">Open full page on playbound.club</a></p>
      </div>
      <div class="detail-tab-panel ${detailActiveTab === "install" ? "active" : ""}" data-panel="install">
        <section class="detail-section">
          <h2 class="detail-section-title">Install</h2>
          ${
            editions.length > 1
              ? `<label class="view-sub" for="detail-edition-pick">Edition</label>
                 <select class="input-text" id="detail-edition-pick" style="max-width:320px;margin:8px 0 14px">${editionPickerOptions}</select>`
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
            <button class="btn-primary" type="button" id="install-tab-install">Install selected edition</button>
            ${detail.website ? `<button class="btn-secondary" type="button" id="install-tab-website">Official website</button>` : ""}
          </div>
          ${
            detail.systemRequirements
              ? `<div class="req-grid" style="margin-bottom:16px">
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
      <div class="detail-tab-panel ${detailActiveTab === "news" ? "active" : ""}" data-panel="news" id="detail-news-sec"><p class="view-sub">Loading releases…</p></div>
      <div class="detail-tab-panel ${detailActiveTab === "media" ? "active" : ""}" data-panel="media" id="detail-media-sec"></div>
    </div>
  `;

  const editionsList = document.getElementById("detail-editions-list");
  if (editionsList) {
    if (!editions.length) {
      editionsList.innerHTML = `<p class="view-sub">No editions listed — install uses the default recipe.</p>`;
    } else {
      for (const ed of editions) {
        const row = document.createElement("div");
        row.className = "edition-row";
        row.innerHTML = `
          <div class="edition-row-copy">
            <strong>${escapeHtml(ed.editionName)}</strong>
            <span>${escapeHtml(ed.editionType || "")}${ed.shortDescription ? ` · ${escapeHtml(ed.shortDescription)}` : ""}</span>
          </div>
          <button type="button" class="btn-secondary btn-sm">View</button>
        `;
        row.querySelector("button")?.addEventListener("click", () => {
          openEditionDetail(slug, ed.editionSlug);
        });
        editionsList.appendChild(row);
      }
    }
  }

  function selectedEditionSlug() {
    const pick = document.getElementById("detail-edition-pick");
    if (pick?.value) return pick.value;
    const def = editions.find((e) => e.isDefault) || editions[0];
    return def?.editionSlug || null;
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

  document.getElementById("install-tab-install")?.addEventListener("click", () => {
    void runInstall(selectedEditionSlug());
  });
  document.getElementById("install-tab-website")?.addEventListener("click", () => {
    if (detail.website) window.playbound.openExternal(detail.website);
  });
  container.querySelectorAll("[data-web-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-web-tab");
      window.playbound.openExternal(
        `https://playbound.club/games/${encodeURIComponent(slug)}?tab=${encodeURIComponent(tab)}`
      );
    });
  });

  // Guides / news / media (lazy fill)
  void (async () => {
    const guidesSec = document.getElementById("detail-guides-sec");
    const newsSec = document.getElementById("detail-news-sec");
    const mediaSec = document.getElementById("detail-media-sec");
    const [guidesRes, releasesRes] = await Promise.all([
      window.playbound.getGameGuides?.(slug) || Promise.resolve({ guides: [] }),
      window.playbound.getGameReleases?.(slug) || Promise.resolve({ releases: [] }),
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
          window.playbound.openExternal(detail.website);
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
            window.playbound.openExternal(a.dataset.ext);
          });
        });
      }
    }
    if (mediaSec) {
      const vids = Array.isArray(detail.videos) ? detail.videos.filter(Boolean) : [];
      const mediaShots = (detail.screenshots || [])
        .map(
          (src) =>
            `<a class="shot-thumb" href="${escapeHtml(src)}" data-ext="${escapeHtml(src)}"><img src="${escapeHtml(src)}" alt="" loading="lazy" /></a>`
        )
        .join("");
      mediaSec.innerHTML = `
        ${
          vids.length
            ? `<section class="detail-section"><h2 class="detail-section-title">Videos</h2><div class="media-video-list">${vids
                .map(
                  (url, i) =>
                    `<a href="${escapeHtml(url)}" data-ext="${escapeHtml(url)}">Video ${i + 1}</a>`
                )
                .join("")}</div></section>`
            : ""
        }
        ${
          mediaShots
            ? `<section class="detail-section"><h2 class="detail-section-title">Screenshots</h2><div class="shot-row">${mediaShots}</div></section>`
            : `<p class="view-sub">No media yet.</p>`
        }
      `;
      mediaSec.querySelectorAll("[data-ext]").forEach((a) => {
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
    `;
    document.getElementById("act-play").addEventListener("click", async () => {
      try {
        setStatus("Launching...");
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
      await window.playbound.uninstall(slug);
      renderGameDetailView(slug);
    });
  } else if (detail.pendingInstaller) {
    const locateLabel = detail.scanning ? "Select .exe" : "Select .exe";
    actions.innerHTML = `
      <button class="btn-primary" id="act-locate">${locateLabel}</button>
      <button class="btn-secondary" id="act-dismiss-pending">Dismiss</button>
      <button class="btn-secondary" id="act-install">Re-run installer</button>
    `;
    setStatus(
      detail.scanning
        ? `Scanning drives for ${detail.title}…`
        : `${detail.title} is in Library — select the .exe if the scan missed it.`
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
      await runInstall(selectedEditionSlug());
    });
  } else {
    const showLocate =
      detail.isInstallerKind || Boolean(detail.knownExePaths?.length);
    actions.innerHTML = `
      <button class="btn-primary" id="act-install">Install Game</button>
      ${showLocate ? `<button class="btn-secondary" id="act-locate">I've finished installing</button>` : ""}
    `;
    document.getElementById("act-install").addEventListener("click", async () => {
      await runInstall(selectedEditionSlug());
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
  const mods = Array.isArray(detail.mods) ? detail.mods : [];
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
      void window.playbound.getLiveStats?.({ mod: mod.slug }).then((stats) => {
        if (!stats || !row.isConnected) return;
        const titleEl = row.querySelector(".mod-row-title");
        if (!titleEl) return;
        const chip = document.createElement("span");
        chip.className = "playing-now-chip";
        chip.style.marginLeft = "8px";
        chip.textContent = `${formatStatNumber(stats.playingNow)} playing now`;
        titleEl.appendChild(chip);
      });
    }
  } else {
    modsSec.innerHTML = `<p class="view-sub">No catalog mods for this title yet.</p>`;
  }

  const serversRes = await window.playbound.getServers(slug);
  const sSec = document.getElementById("detail-servers-sec");
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
        <p class="servers-stats" style="margin-top:0">${totalPlayers} players · ${sorted.length} servers</p>
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
    sSec.innerHTML = `<p class="view-sub">No live servers listed right now — try the Servers view.</p>`;
  } else {
    sSec.innerHTML = `<p class="view-sub">This title doesn't list dedicated servers.</p>`;
  }
}

function openGameDetail(slug, fromView) {
  const origin = fromView || currentView;
  detailReturnView = ["games", "library", "home", "servers"].includes(origin) ? origin : "games";
  detailActiveTab = "overview";
  navigateTo("gameDetail", { slug });
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
          <button class="btn-primary" id="edition-install">Install this edition</button>
          ${
            gameDetail?.installed
              ? `<button class="btn-success" id="edition-play">Play</button>`
              : ""
          }
        </div>
      </div>
    </section>
    ${buildActivityPanelHtml(liveStats, "Edition activity")}
    <section class="detail-section">
      <h2 class="detail-section-title">About</h2>
      <p class="detail-prose">${escapeHtml(edition.shortDescription || "")}</p>
    </section>
    ${
      edition.requirements
        ? `<section class="detail-section"><h2 class="detail-section-title">System Requirements</h2>
        <div class="req-grid">
          <div class="req-card"><div class="req-label">Minimum</div><p>${escapeHtml(edition.requirements.min || "—")}</p></div>
          <div class="req-card"><div class="req-label">Recommended</div><p>${escapeHtml(edition.requirements.recommended || "—")}</p></div>
        </div></section>`
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
        setStatus("Install complete!");
        setProgress(null);
        renderEditionDetailView(gameSlug, editionSlug);
      } else if (res.status === "installer-opened") {
        setStatus("Installer opened — waiting for installer to finish…");
        setProgress(null);
        openGameDetail(gameSlug, "editionDetail");
      } else if (res.status === "external") {
        setStatus("Opened download page.");
        setProgress(null);
      }
    } catch (err) {
      setStatus(err.message || String(err), true);
      setProgress(null);
    }
  });
  document.getElementById("edition-play")?.addEventListener("click", async () => {
    try {
      setStatus("Launching...");
      await window.playbound.play(gameSlug);
      startGameSession(gameSlug, edition.gameTitle || gameSlug);
      setStatus(`Launched ${edition.gameTitle || gameSlug}`);
    } catch (err) {
      setStatus(err.message || String(err), true);
    }
  });
  container.querySelectorAll("[data-ext]").forEach((btn) => {
    btn.addEventListener("click", () => window.playbound.openExternal(btn.dataset.ext));
  });
}

function renderDeepLinkView(ctx) {
  if (!ctx) return;
  deepLinkCtx = ctx;
  navigateTo("deepLink");

  const container = views.deepLink;
  const entry = ctx.entry;
  const title = entry?.title || ctx.slug || "Action";

  container.innerHTML = `
    <h1 class="view-title">PlayBound Action</h1>
    <p class="view-sub">Requested action from playbound.club</p>

    <div class="settings-group">
      <h2 style="font-size: 20px; font-weight: 800; margin-bottom: 8px">${escapeHtml(title)}</h2>
      <p class="settings-hint">${escapeHtml(entry?.blurb || "")}</p>
      
      <div style="margin-top: 20px; display: flex; gap: 10px;" id="dl-actions"></div>
      ${
        entry?.addons && entry.addons.length > 0
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
      <button class="btn-primary" id="dl-act-run">Install Now</button>
      <button class="btn-secondary" id="dl-act-cancel">Cancel</button>
    `;
    document.getElementById("dl-act-run").addEventListener("click", async () => {
      setStatus("Installing...");
      try {
        const checkboxes = document.querySelectorAll(".addon-checkbox");
        const addons = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
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
      }
    });
  } else if (ctx.action === "play") {
    actions.innerHTML = `
      <button class="btn-success" id="dl-act-run">Launch Game</button>
      <button class="btn-secondary" id="dl-act-cancel">Cancel</button>
    `;
    document.getElementById("dl-act-run").addEventListener("click", async () => {
      await window.playbound.play(ctx.slug, ctx.join);
      startGameSession(ctx.slug, title);
      navigateTo("home");
    });
  } else {
    actions.innerHTML = `<button class="btn-secondary" id="dl-act-cancel">Close</button>`;
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
      <div class="card-title">${escapeHtml(game.title)}${
        game.testing || game.status === "testing"
          ? ` <span class="badge" style="font-size:10px;background:rgba(245,158,11,.2);color:#f59e0b">Testing</span>`
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

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

window.playbound.onProgress(({ phase, received, total, addon }) => {
  if (phase === "resolving") setStatus("Resolving download package...");
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
        ? `Couldn't find ${data.slug} automatically — select the .exe in Library.`
        : "Couldn't find the install — select the .exe in Library.",
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
    `Couldn't auto-detect ${name}. Open Library and click Select .exe to locate it.`,
    true
  );
  if (currentView === "library") renderLibraryView();
  else if (currentView === "gameDetail" && data?.slug && currentDetailSlug === data.slug) {
    renderGameDetailView(data.slug);
  }
});

window.playbound.onContext((data) => {
  if (data) renderDeepLinkView(data);
});

refreshAccountStatus();
window.playbound.getContext().then((data) => {
  if (data) renderDeepLinkView(data);
  else navigateTo("home");
});
