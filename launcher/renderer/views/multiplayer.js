import {
  api,
  CACHE_TTL,
  cacheInvoke,
  escapeHtml,
  markViewReady,
  setStatus,
  state,
  views,
} from "../shared.js";
import {
  buildServersBrowserHtml,
  refreshServersPickersAndList,
  wireServersBrowser,
} from "./servers.js";

let _cachedActivity = null;
let _cachedParties = [];
let _cachedEvents = [];
let _cachedMyLfg = { active: false, gameSlugs: [] };
let _activeParty = null;
let _refreshTimer = null;

function formatEventDate(isoStr) {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return String(isoStr);
  }
}

async function loadMultiplayerData() {
  const [actRes, lfgRes, partiesRes, eventsRes] = await Promise.all([
    window.playbound.getMultiplayerActivity?.().catch(() => null),
    window.playbound.getLfg?.().catch(() => null),
    window.playbound.getParties?.({ includeDiscoverable: true }).catch(() => null),
    window.playbound.getEvents?.().catch(() => null),
  ]);

  if (actRes && !actRes.error) {
    _cachedActivity = actRes;
  }
  if (lfgRes && !lfgRes.error) {
    if (lfgRes.myLfg) {
      _cachedMyLfg = lfgRes.myLfg;
      state.multiplayerState.ltpActive = Boolean(lfgRes.myLfg.active);
      state.multiplayerState.ltpSelectedSlugs = Array.isArray(lfgRes.myLfg.gameSlugs)
        ? lfgRes.myLfg.gameSlugs
        : lfgRes.myLfg.gameSlug
        ? [lfgRes.myLfg.gameSlug]
        : [];
    }
    if (Array.isArray(lfgRes.discoverableParties)) {
      _cachedParties = lfgRes.discoverableParties;
    }
  }
  if (partiesRes && !partiesRes.error) {
    if (Array.isArray(partiesRes.parties)) {
      _cachedParties = partiesRes.parties;
    }
    _activeParty = partiesRes.activeParty || null;
  }
  if (eventsRes && Array.isArray(eventsRes.events)) {
    _cachedEvents = eventsRes.events;
  }
}

export async function renderMultiplayerView(params = {}) {
  const container = views.multiplayer;
  if (!container) return;

  if (params.tab) {
    state.multiplayerState.activeTab = params.tab;
  }
  if (params.game) {
    state.serversState.selectedSlug = params.game;
    state.serversState.selectedModSlug = "";
  }

  // Initial paint with shell / cached state
  paintMultiplayerView(container);

  // Fetch live multiplayer data
  await loadMultiplayerData();

  // Repaint with live data
  paintMultiplayerView(container);
  markViewReady(container);

  // Set up periodic background refresh every 30s while view is active
  if (_refreshTimer) clearInterval(_refreshTimer);
  _refreshTimer = setInterval(async () => {
    if (state.currentView === "multiplayer") {
      await loadMultiplayerData();
      paintStatsBarOnly();
      if (state.multiplayerState.activeTab === "overview" || state.multiplayerState.activeTab === "games") {
        paintTabContent();
      }
    } else {
      clearInterval(_refreshTimer);
      _refreshTimer = null;
    }
  }, 30_000);
}

function getFilteredGames() {
  const games = _cachedActivity?.games || [];
  const search = (state.multiplayerState.gameSearch || "").trim().toLowerCase();
  const filter = state.multiplayerState.filterType || "all";

  return games.filter((g) => {
    // Installed only filter
    if (state.multiplayerState.installedOnly && state._installedGameSlugs) {
      if (!state._installedGameSlugs.has(g.gameSlug)) return false;
    }
    if (search) {
      const matchTitle = (g.gameTitle || "").toLowerCase().includes(search);
      const matchGenre = (g.genre || "").toLowerCase().includes(search);
      const matchTags = Array.isArray(g.tags) && g.tags.some((t) => t.toLowerCase().includes(search));
      if (!matchTitle && !matchGenre && !matchTags) return false;
    }
    if (filter === "parties") return (g.openPartyCount || 0) > 0;
    if (filter === "looking") return (g.usersLookingCount || 0) > 0;
    if (filter === "servers") return (g.serverPlayerCount || 0) > 0 || (g.serversOnline || 0) > 0;
    return true;
  });
}

function paintMultiplayerView(container) {
  const summary = _cachedActivity?.summary || {
    totalServerPlayers: 0,
    totalServersOnline: 0,
    totalOpenParties: 0,
    totalUsersLooking: 0,
  };
  const activeTab = state.multiplayerState.activeTab || "overview";
  const ltpActive = state.multiplayerState.ltpActive;
  const ltpDrawerOpen = state.multiplayerState.ltpDrawerOpen;
  const createPartyOpen = state.multiplayerState.createPartyOpen;
  const filteredGames = getFilteredGames();

  container.innerHTML = `
    <div class="mp-hub-container">
      <!-- Header Banner -->
      <div class="mp-hub-banner">
        <div class="mp-hub-banner-top">
          <div class="mp-hub-banner-text">
            <div class="mp-hub-badge">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5 14.5 17.5"></polyline>
                <line x1="13" y1="19" x2="19" y2="13"></line>
                <line x1="16" y1="16" x2="20" y2="20"></line>
                <line x1="19" y1="21" x2="21" y2="19"></line>
                <polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5 14.5 6.5"></polyline>
                <line x1="5" y1="14" x2="9" y2="18"></line>
                <line x1="7" y1="17" x2="4" y2="20"></line>
                <line x1="3" y1="19" x2="5" y2="21"></line>
              </svg>
              <span>Multiplayer Hub</span>
            </div>
            <h1 class="mp-hub-title">Multiplayer</h1>
            <p class="mp-hub-desc">
              Join open parties, jump into live community game servers, or raise your hand with Looking to Party to get matched.
            </p>
          </div>

          <div class="mp-hub-actions">
            <button type="button" id="mp-btn-start-party" class="btn-primary mp-action-btn">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              ${createPartyOpen ? "Close Party Panel" : "Start Party"}
            </button>
            <button type="button" id="mp-btn-ltp" class="btn-secondary mp-action-btn ${ltpActive ? "mp-ltp-active" : ""}">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="2"></circle><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"></path></svg>
              ${ltpActive ? "Looking to Party (Active)" : "Looking to Party"}
            </button>
          </div>
        </div>

        <!-- Real-Time Metrics Bar -->
        <div class="mp-hub-stat-grid" id="mp-hub-stat-grid">
          <div class="mp-hub-stat-card">
            <div class="mp-hub-stat-label">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#22d3ee" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
              <span>Tracked Server Players</span>
            </div>
            <div class="mp-hub-stat-val text-cyan">${(summary.totalServerPlayers || 0).toLocaleString()}</div>
          </div>

          <div class="mp-hub-stat-card">
            <div class="mp-hub-stat-label">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--accent-light)" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              <span>Open Parties</span>
            </div>
            <div class="mp-hub-stat-val text-primary">${summary.totalOpenParties || 0}</div>
          </div>

          <div class="mp-hub-stat-card">
            <div class="mp-hub-stat-label">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fbbf24" stroke-width="2"><circle cx="12" cy="12" r="2"></circle><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49"></path></svg>
              <span>Users Looking to Party</span>
            </div>
            <div class="mp-hub-stat-val text-amber">${summary.totalUsersLooking || 0}</div>
          </div>

          <div class="mp-hub-stat-card">
            <div class="mp-hub-stat-label">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--text-muted)" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/></svg>
              <span>Servers Online</span>
            </div>
            <div class="mp-hub-stat-val">${(summary.totalServersOnline || 0).toLocaleString()}</div>
          </div>
        </div>
      </div>

      <!-- Active Party Alert Banner -->
      ${
        _activeParty
          ? `<div class="mp-active-party-bar">
              <div class="mp-active-party-info">
                <span class="chip chip-accent" style="font-weight: 800;">PARTY</span>
                <div>
                  <strong>You are in an active party for ${escapeHtml(_activeParty.gameTitle || _activeParty.gameSlug || "Game")}</strong>
                  <span class="mp-party-sub">${_activeParty.members?.length || 1} / ${_activeParty.maxSize || 8} players · Status: ${_activeParty.status || "ready"}</span>
                </div>
              </div>
              <button type="button" class="btn-primary btn-sm" id="mp-btn-go-party">Open Party View →</button>
            </div>`
          : ""
      }

      <!-- Expandable Start Party Drawer -->
      <div id="mp-create-party-drawer" class="mp-drawer ${createPartyOpen ? "open" : "hidden"}">
        <div class="mp-drawer-head">
          <div>
            <h3>Start a PlayBound Party</h3>
            <p>Parties coordinate players, sync game editions &amp; mods, and launch directly together into servers or host sessions.</p>
          </div>
          <button type="button" class="mp-drawer-close" id="mp-close-party-drawer">✕</button>
        </div>
        <div class="mp-drawer-body">
          <div class="mp-form-row">
            <div class="mp-form-field">
              <label>Game</label>
              <select id="mp-party-game-select" class="input-text">
                <option value="">Choose a game (optional)…</option>
                ${(_cachedActivity?.games || []).map((g) => `<option value="${escapeHtml(g.gameSlug)}" ${g.gameSlug === state.multiplayerState.selectedGameForParty ? "selected" : ""}>${escapeHtml(g.gameTitle)}</option>`).join("")}
              </select>
            </div>
            <div class="mp-form-field">
              <label>Visibility</label>
              <select id="mp-party-vis-select" class="input-text">
                <option value="public" selected>Public (Show in Hub &amp; Parties list)</option>
                <option value="friends">Friends Only</option>
                <option value="invite">Invite Only</option>
              </select>
            </div>
          </div>
          <div class="mp-drawer-actions">
            <button type="button" id="mp-submit-create-party" class="btn-primary">Create &amp; Open Party</button>
          </div>
        </div>
      </div>

      <!-- Expandable Looking to Party Drawer -->
      <div id="mp-ltp-drawer" class="mp-drawer ${ltpDrawerOpen ? "open" : "hidden"}">
        <div class="mp-drawer-head">
          <div>
            <div class="chip chip-amber" style="display:inline-flex; align-items:center; gap:4px; font-size:11px; margin-bottom:4px;">
              <span class="dot" style="background:#fbbf24;"></span> Looking to Party Matchmaking
            </div>
            <h3>What games do you want to play right now?</h3>
            <p>Select games you want to play. PlayBound will match you with players searching for overlapping games or direct you into open parties.</p>
          </div>
          <button type="button" class="mp-drawer-close" id="mp-close-ltp-drawer">✕</button>
        </div>

        <div class="mp-drawer-body">
          <div class="mp-ltp-selected-wrap">
            <span class="mp-ltp-selected-label">Selected (${state.multiplayerState.ltpSelectedSlugs.length}):</span>
            <div class="mp-ltp-chips-row" id="mp-ltp-chips-row">
              ${
                state.multiplayerState.ltpSelectedSlugs.length === 0
                  ? `<span class="mp-ltp-empty-hint">No games selected (you will match for any game)</span>`
                  : state.multiplayerState.ltpSelectedSlugs
                      .map((slug) => {
                        const g = (_cachedActivity?.games || []).find((x) => x.gameSlug === slug);
                        return `
                          <span class="mp-ltp-selected-chip">
                            ${escapeHtml(g?.gameTitle || slug)}
                            <button type="button" class="mp-chip-remove" data-slug="${escapeHtml(slug)}">✕</button>
                          </span>
                        `;
                      })
                      .join("")
              }
            </div>
          </div>

          <div class="mp-ltp-search-wrap">
            <input type="search" id="mp-ltp-search-input" class="input-text" placeholder="Search multiplayer games to add…" />
            <div class="mp-ltp-picker-grid" id="mp-ltp-picker-grid">
              ${renderLtpGameChips("")}
            </div>
          </div>

          <div class="mp-drawer-actions" style="justify-content: space-between;">
            <span class="view-sub" style="margin:0">Expires automatically after 60 minutes.</span>
            <div style="display:flex; gap:8px;">
              ${
                ltpActive
                  ? `<button type="button" id="mp-stop-ltp-btn" class="btn-secondary btn-danger-soft">Stop Looking</button>`
                  : ""
              }
              <button type="button" id="mp-save-ltp-btn" class="btn-primary" style="background: #f59e0b; color: #000; font-weight: 800;">
                ${ltpActive ? "Update Looking Status" : "Start Looking to Party"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Main Navigation Tabs -->
      <div class="mp-tabs-bar">
        <div class="mp-tabs-nav">
          <button type="button" class="mp-tab-btn ${activeTab === "overview" ? "active" : ""}" data-tab="overview">
            All Activity
          </button>
          <button type="button" class="mp-tab-btn ${activeTab === "games" ? "active" : ""}" data-tab="games">
            Games (${filteredGames.length})
          </button>
          <button type="button" class="mp-tab-btn ${activeTab === "servers" ? "active" : ""}" data-tab="servers">
            Live Server Browser
          </button>
          <button type="button" class="mp-tab-btn ${activeTab === "events" ? "active" : ""}" data-tab="events">
            Events (${_cachedEvents.length})
          </button>
          <div class="mp-tabs-divider"></div>
          <label class="mp-global-filter-toggle" id="mp-installed-filter-label" title="Filter to installed games">
            <input type="checkbox" id="mp-installed-filter" ${state.multiplayerState.installedOnly ? "checked" : ""} />
            <span>Installed only</span>
          </label>
        </div>

        ${
          activeTab === "games"
            ? `<div class="mp-tab-search-box">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                <input type="search" id="mp-games-search" placeholder="Search games, tags…" value="${escapeHtml(state.multiplayerState.gameSearch || "")}" />
              </div>`
            : ""
        }
      </div>

      <!-- Tab Content Area -->
      <div id="mp-tab-content-area" class="mp-tab-content-area"></div>
    </div>
  `;

  bindHeaderListeners();
  paintTabContent();
}

function renderLtpGameChips(query) {
  const q = (query || "").trim().toLowerCase();
  const allGames = _cachedActivity?.games || [];
  const selected = new Set(state.multiplayerState.ltpSelectedSlugs);
  const installed = state._installedGameSlugs || new Set();

  const filtered = allGames.filter((g) => {
    if (!q) return true;
    return (
      (g.gameTitle || "").toLowerCase().includes(q) ||
      (g.genre || "").toLowerCase().includes(q) ||
      (Array.isArray(g.tags) && g.tags.some((t) => t.toLowerCase().includes(q)))
    );
  });

  // Prioritize installed multiplayer games first
  filtered.sort((a, b) => {
    const aInstalled = installed.has(a.gameSlug) ? 1 : 0;
    const bInstalled = installed.has(b.gameSlug) ? 1 : 0;
    if (aInstalled !== bInstalled) {
      return bInstalled - aInstalled;
    }
    return (a.gameTitle || "").localeCompare(b.gameTitle || "");
  });

  return filtered.slice(0, 32).map((g) => {
    const isSel = selected.has(g.gameSlug);
    const isInst = installed.has(g.gameSlug);
    return `
      <button type="button" class="mp-ltp-toggle-btn ${isSel ? "selected" : ""} ${isInst && !isSel ? "installed" : ""}" data-slug="${escapeHtml(g.gameSlug)}" title="${isInst ? "Installed · " + escapeHtml(g.gameTitle) : escapeHtml(g.gameTitle)}">
        ${isInst && !isSel ? `<span class="mp-ltp-inst-dot" title="Installed"></span>` : ""}
        ${escapeHtml(g.gameTitle)}
      </button>
    `;
  }).join("");
}

function bindHeaderListeners() {
  document.getElementById("mp-btn-start-party")?.addEventListener("click", () => {
    state.multiplayerState.createPartyOpen = !state.multiplayerState.createPartyOpen;
    state.multiplayerState.ltpDrawerOpen = false;
    paintMultiplayerView(views.multiplayer);
  });

  document.getElementById("mp-btn-ltp")?.addEventListener("click", () => {
    state.multiplayerState.ltpDrawerOpen = !state.multiplayerState.ltpDrawerOpen;
    state.multiplayerState.createPartyOpen = false;
    paintMultiplayerView(views.multiplayer);
  });

  document.getElementById("mp-close-party-drawer")?.addEventListener("click", () => {
    state.multiplayerState.createPartyOpen = false;
    paintMultiplayerView(views.multiplayer);
  });

  document.getElementById("mp-close-ltp-drawer")?.addEventListener("click", () => {
    state.multiplayerState.ltpDrawerOpen = false;
    paintMultiplayerView(views.multiplayer);
  });

  document.getElementById("mp-btn-go-party")?.addEventListener("click", () => {
    api.navigateTo?.("friends");
  });

  // Create party submit
  document.getElementById("mp-submit-create-party")?.addEventListener("click", async () => {
    const gameSelect = document.getElementById("mp-party-game-select");
    const visSelect = document.getElementById("mp-party-vis-select");
    const gameSlug = gameSelect?.value || null;
    const visibility = visSelect?.value || "public";

    setStatus("Creating party…");
    try {
      const res = await window.playbound.createParty?.({
        gameSlug,
        visibility,
        maxSize: 8,
      });
      if (res?.error) {
        setStatus(res.error, true);
        return;
      }
      setStatus("Party created!");
      state.multiplayerState.createPartyOpen = false;
      api.navigateTo?.("friends");
    } catch (err) {
      setStatus(err?.message || "Failed to create party", true);
    }
  });

  // LTP Search
  const ltpInput = document.getElementById("mp-ltp-search-input");
  if (ltpInput) {
    ltpInput.oninput = (e) => {
      const picker = document.getElementById("mp-ltp-picker-grid");
      if (picker) {
        picker.innerHTML = renderLtpGameChips(e.target.value);
        wireLtpChipListeners();
      }
    };
  }

  wireLtpChipListeners();

  // Save LTP
  document.getElementById("mp-save-ltp-btn")?.addEventListener("click", async () => {
    setStatus("Updating looking for players status…");
    try {
      const slugs = state.multiplayerState.ltpSelectedSlugs;
      const res = await window.playbound.setLfg?.(true, slugs);
      if (res?.error) {
        setStatus(res.error, true);
        return;
      }
      state.multiplayerState.ltpActive = true;
      state.multiplayerState.ltpDrawerOpen = false;
      setStatus("Looking to Party active!");
      await loadMultiplayerData();
      paintMultiplayerView(views.multiplayer);
    } catch (err) {
      setStatus(err?.message || "Failed to update Looking to Party", true);
    }
  });

  // Stop LTP
  document.getElementById("mp-stop-ltp-btn")?.addEventListener("click", async () => {
    setStatus("Stopping looking status…");
    try {
      await window.playbound.setLfg?.(false, []);
      state.multiplayerState.ltpActive = false;
      state.multiplayerState.ltpDrawerOpen = false;
      setStatus("Looking to Party disabled.");
      await loadMultiplayerData();
      paintMultiplayerView(views.multiplayer);
    } catch (err) {
      setStatus(err?.message || "Failed to stop Looking to Party", true);
    }
  });

  // Tabs switching
  document.querySelectorAll(".mp-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      state.multiplayerState.activeTab = tab;
      document.querySelectorAll(".mp-tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
      paintTabContent();
    });
  });

  // Games search
  const gamesSearch = document.getElementById("mp-games-search");
  if (gamesSearch) {
    gamesSearch.oninput = (e) => {
      state.multiplayerState.gameSearch = e.target.value;
      paintTabContent();
    };
  }

  // Global Installed Only Filter
  const installedFilter = document.getElementById("mp-installed-filter");
  if (installedFilter) {
    installedFilter.onchange = (e) => {
      const checked = Boolean(e.target.checked);
      state.multiplayerState.installedOnly = checked;
      state.serversState.installedOnly = checked;
      state.serversState.pingById = {};
      paintMultiplayerView(views.multiplayer);
      if (typeof refreshServersPickersAndList === "function") {
        void refreshServersPickersAndList();
      }
    };
  }
}

function wireLtpChipListeners() {
  document.querySelectorAll(".mp-ltp-toggle-btn").forEach((btn) => {
    btn.onclick = () => {
      const slug = btn.dataset.slug;
      const cur = state.multiplayerState.ltpSelectedSlugs;
      if (cur.includes(slug)) {
        state.multiplayerState.ltpSelectedSlugs = cur.filter((s) => s !== slug);
      } else {
        state.multiplayerState.ltpSelectedSlugs = [...cur, slug];
      }
      // Re-render chips row and buttons
      const chipsRow = document.getElementById("mp-ltp-chips-row");
      if (chipsRow) {
        chipsRow.innerHTML =
          state.multiplayerState.ltpSelectedSlugs.length === 0
            ? `<span class="mp-ltp-empty-hint">No games selected (you will match for any game)</span>`
            : state.multiplayerState.ltpSelectedSlugs
                .map((s) => {
                  const g = (_cachedActivity?.games || []).find((x) => x.gameSlug === s);
                  return `
                    <span class="mp-ltp-selected-chip">
                      ${escapeHtml(g?.gameTitle || s)}
                      <button type="button" class="mp-chip-remove" data-slug="${escapeHtml(s)}">✕</button>
                    </span>
                  `;
                })
                .join("");
        wireLtpChipRemoveListeners();
      }
      document.querySelectorAll(`.mp-ltp-toggle-btn[data-slug="${slug}"]`).forEach((b) => {
        b.classList.toggle("selected", state.multiplayerState.ltpSelectedSlugs.includes(slug));
      });
    };
  });
  wireLtpChipRemoveListeners();
}

function wireLtpChipRemoveListeners() {
  document.querySelectorAll(".mp-chip-remove").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const slug = btn.dataset.slug;
      state.multiplayerState.ltpSelectedSlugs = state.multiplayerState.ltpSelectedSlugs.filter((s) => s !== slug);
      const chipsRow = document.getElementById("mp-ltp-chips-row");
      if (chipsRow) {
        chipsRow.innerHTML =
          state.multiplayerState.ltpSelectedSlugs.length === 0
            ? `<span class="mp-ltp-empty-hint">No games selected (you will match for any game)</span>`
            : state.multiplayerState.ltpSelectedSlugs
                .map((s) => {
                  const g = (_cachedActivity?.games || []).find((x) => x.gameSlug === s);
                  return `
                    <span class="mp-ltp-selected-chip">
                      ${escapeHtml(g?.gameTitle || s)}
                      <button type="button" class="mp-chip-remove" data-slug="${escapeHtml(s)}">✕</button>
                    </span>
                  `;
                })
                .join("");
        wireLtpChipRemoveListeners();
      }
      document.querySelectorAll(`.mp-ltp-toggle-btn[data-slug="${slug}"]`).forEach((b) => {
        b.classList.remove("selected");
      });
    };
  });
}

function paintStatsBarOnly() {
  const summary = _cachedActivity?.summary;
  if (!summary) return;
  const grid = document.getElementById("mp-hub-stat-grid");
  if (!grid) return;
  const vals = grid.querySelectorAll(".mp-hub-stat-val");
  if (vals.length >= 4) {
    vals[0].textContent = (summary.totalServerPlayers || 0).toLocaleString();
    vals[1].textContent = summary.totalOpenParties || 0;
    vals[2].textContent = summary.totalUsersLooking || 0;
    vals[3].textContent = (summary.totalServersOnline || 0).toLocaleString();
  }
}

function paintTabContent() {
  const container = document.getElementById("mp-tab-content-area");
  if (!container) return;

  const tab = state.multiplayerState.activeTab || "overview";

  if (tab === "overview") {
    paintOverviewTab(container);
  } else if (tab === "games") {
    paintGamesTab(container);
  } else if (tab === "servers") {
    paintServersTab(container);
  } else if (tab === "events") {
    paintEventsTab(container);
  }
}

function paintOverviewTab(container) {
  const allFiltered = getFilteredGames();
  const activeSpotlight = allFiltered.filter(
    (g) => (g.openPartyCount || 0) > 0 || (g.usersLookingCount || 0) > 0 || (g.serverPlayerCount || 0) > 0 || (g.serversOnline || 0) > 0
  );
  const spotlightGames = (activeSpotlight.length > 0 ? activeSpotlight : allFiltered).slice(0, 6);

  let openParties = _cachedParties.filter((p) => p.visibility === "public" && p.status !== "closed");
  if (state.multiplayerState.installedOnly && state._installedGameSlugs) {
    openParties = openParties.filter((p) => state._installedGameSlugs.has(p.gameSlug));
  }

  container.innerHTML = `
    <!-- Open Parties Section -->
    <div class="mp-section">
      <div class="section-header">
        <div>
          <h2 class="view-title" style="font-size: 1.25rem; margin:0">Open Parties (${openParties.length})</h2>
          <p class="view-sub" style="margin: 2px 0 0">Join players coordinating together with automatic game and mod launching.</p>
        </div>
        <button type="button" class="btn-secondary btn-sm" id="mp-start-party-sec-btn">+ Start Party</button>
      </div>

      ${
        openParties.length === 0
          ? `<div class="mp-empty-card">
              <p>${state.multiplayerState.installedOnly ? "No open parties for your installed games. Try turning off 'Installed only' or start a party!" : "No open parties right now. Start the first one and invite players!"}</p>
            </div>`
          : `<div class="mp-parties-grid">${openParties.map(renderPartyCard).join("")}</div>`
      }
    </div>

    <!-- Active Right Now Spotlight Shelf -->
    <div class="mp-section" style="margin-top: 32px;">
      <div class="section-header">
        <div>
          <h2 class="view-title" style="font-size: 1.25rem; margin:0">Active Right Now</h2>
          <p class="view-sub" style="margin: 2px 0 0">Multiplayer games with live parties, players looking to play, or active servers.</p>
        </div>
        <button type="button" class="btn-secondary btn-sm" id="mp-see-all-games-btn">Browse All Games (${allFiltered.length}) →</button>
      </div>

      ${
        spotlightGames.length === 0
          ? `<div class="mp-empty-card">
              <p>${state.multiplayerState.installedOnly ? "No installed multiplayer games found with active players. Try turning off 'Installed only'." : "No active multiplayer games right now. Start a party or check the server browser below!"}</p>
            </div>`
          : `<div class="mp-games-grid">${spotlightGames.map(renderMultiplayerGameCard).join("")}</div>`
      }
    </div>

    <!-- Live Server Browser Teaser / Embed -->
    <div class="mp-section" style="margin-top: 32px;" id="mp-overview-servers-sec">
      ${buildServersBrowserHtml("Pick a game to see who&apos;s playing.")}
    </div>
  `;

  bindGameCardActions(container);
  bindPartyCardActions(container);

  document.getElementById("mp-see-all-games-btn")?.addEventListener("click", () => {
    state.multiplayerState.activeTab = "games";
    document.querySelectorAll(".mp-tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === "games"));
    paintTabContent();
  });

  document.getElementById("mp-start-party-sec-btn")?.addEventListener("click", () => {
    state.multiplayerState.createPartyOpen = true;
    paintMultiplayerView(views.multiplayer);
  });

  // Wire embedded server browser
  void wireServersBrowser(null, state.serversState.selectedSlug);
}

function paintGamesTab(container) {
  const filtered = getFilteredGames();
  const curFilter = state.multiplayerState.filterType || "all";

  container.innerHTML = `
    <div class="section-header" style="margin-top: 0">
      <div>
        <h2 class="view-title" style="font-size: 1.25rem; margin:0">Multiplayer Games Directory (${filtered.length})</h2>
        <p class="view-sub" style="margin: 2px 0 0">Explore all multiplayer-supported titles, community servers, and matchmaking.</p>
      </div>
    </div>

    <div class="mp-games-tab-head">
      <div class="mp-filter-chips-row">
        <button type="button" class="mp-filter-chip ${curFilter === "all" ? "active" : ""}" data-filter="all">All</button>
        <button type="button" class="mp-filter-chip ${curFilter === "parties" ? "active" : ""}" data-filter="parties">With Parties</button>
        <button type="button" class="mp-filter-chip ${curFilter === "looking" ? "active" : ""}" data-filter="looking">Looking for Players</button>
        <button type="button" class="mp-filter-chip ${curFilter === "servers" ? "active" : ""}" data-filter="servers">Live Servers</button>
      </div>
    </div>

    ${
      filtered.length === 0
        ? `<div class="mp-empty-card">
            <p>${state.multiplayerState.installedOnly ? "No installed multiplayer games match your current filter. Try turning off 'Installed only'." : "No multiplayer games match your filter or search."}</p>
          </div>`
        : `<div class="mp-games-grid">${filtered.map(renderMultiplayerGameCard).join("")}</div>`
    }
  `;

  container.querySelectorAll(".mp-filter-chip").forEach((btn) => {
    btn.onclick = () => {
      state.multiplayerState.filterType = btn.dataset.filter;
      paintGamesTab(container);
    };
  });

  bindGameCardActions(container);
}

function paintServersTab(container) {
  container.innerHTML = buildServersBrowserHtml("Real-time community servers with 1-click launch and ping.");
  void wireServersBrowser(container, state.serversState.selectedSlug);
}

function paintEventsTab(container) {
  const events = _cachedEvents || [];

  container.innerHTML = `
    <div class="section-header" style="margin-top:0">
      <div>
        <h2 class="view-title" style="font-size:1.25rem; margin:0">Community Multiplayer Events</h2>
        <p class="view-sub" style="margin:2px 0 0">Tournaments, game nights, and organized play sessions.</p>
      </div>
      <button type="button" class="btn-secondary btn-sm" id="mp-browse-all-events">See Full Events Hub →</button>
    </div>

    ${
      events.length === 0
        ? `<div class="mp-empty-card"><p>No upcoming events scheduled right now.</p></div>`
        : `<div class="mp-events-grid">${events.map(renderEventCard).join("")}</div>`
    }
  `;

  document.getElementById("mp-browse-all-events")?.addEventListener("click", () => {
    api.navigateTo?.("events");
  });

  container.querySelectorAll(".mp-btn-view-ev").forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.id;
      api.navigateTo?.("eventDetail", { eventId: id });
    };
  });
}

function renderMultiplayerGameCard(g) {
  const coverUrl = g.coverImage || "";
  const serverPlayers = g.serverPlayerCount || 0;
  const openParties = g.openPartyCount || 0;
  const usersLooking = g.usersLookingCount || 0;
  const serversOnline = g.serversOnline || 0;

  return `
    <div class="mp-game-card" data-slug="${escapeHtml(g.gameSlug)}">
      <div class="mp-game-card-cover-wrap">
        ${
          coverUrl
            ? `<img src="${escapeHtml(coverUrl)}" class="mp-game-card-cover" alt="${escapeHtml(g.gameTitle)}" />`
            : `<div class="mp-game-card-no-cover">${escapeHtml(g.gameTitle)}</div>`
        }
        <div class="mp-game-card-overlay"></div>
        <div class="mp-game-card-badges">
          ${g.isFree ? `<span class="chip chip-accent" style="font-size:10px;">Free</span>` : ""}
          ${g.genre ? `<span class="chip" style="font-size:10px;">${escapeHtml(g.genre)}</span>` : ""}
        </div>
      </div>

      <div class="mp-game-card-body">
        <h3 class="mp-game-card-title">${escapeHtml(g.gameTitle)}</h3>

        <div class="mp-game-card-metrics">
          ${
            serverPlayers > 0
              ? `<span class="mp-metric-pill cyan"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/></svg> ${serverPlayers.toLocaleString()} playing</span>`
              : serversOnline > 0
              ? `<span class="mp-metric-pill muted">${serversOnline} servers</span>`
              : ""
          }
          ${
            openParties > 0
              ? `<span class="mp-metric-pill purple"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg> ${openParties} ${openParties === 1 ? "party" : "parties"}</span>`
              : ""
          }
          ${
            usersLooking > 0
              ? `<span class="mp-metric-pill amber"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="2"/></svg> ${usersLooking} LFG</span>`
              : ""
          }
          ${
            serverPlayers === 0 && openParties === 0 && usersLooking === 0 && serversOnline === 0
              ? `<span class="mp-metric-pill muted">Online Multiplayer</span>`
              : ""
          }
        </div>

        <div class="mp-game-card-actions">
          <button type="button" class="btn-secondary btn-sm mp-btn-browse-servers" data-slug="${escapeHtml(g.gameSlug)}" title="View community servers for ${escapeHtml(g.gameTitle)}">
            Servers
          </button>
          <button type="button" class="btn-secondary btn-sm mp-btn-card-party" data-slug="${escapeHtml(g.gameSlug)}" title="Start party for ${escapeHtml(g.gameTitle)}">
            + Party
          </button>
          <button type="button" class="btn-primary btn-sm mp-btn-card-play" data-slug="${escapeHtml(g.gameSlug)}">
            Play
          </button>
        </div>
      </div>
    </div>
  `;
}

function bindGameCardActions(container) {
  container.querySelectorAll(".mp-btn-browse-servers").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const slug = btn.dataset.slug;
      state.serversState.selectedSlug = slug;
      state.serversState.selectedModSlug = "";
      state.multiplayerState.activeTab = "servers";
      document.querySelectorAll(".mp-tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === "servers"));
      paintTabContent();
      const embed = document.querySelector(".servers-browser-embedded");
      if (embed) embed.scrollIntoView({ behavior: "smooth" });
    };
  });

  container.querySelectorAll(".mp-btn-card-party").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const slug = btn.dataset.slug;
      state.multiplayerState.selectedGameForParty = slug;
      state.multiplayerState.createPartyOpen = true;
      state.multiplayerState.ltpDrawerOpen = false;
      paintMultiplayerView(views.multiplayer);
      const drawer = document.getElementById("mp-create-party-drawer");
      if (drawer) drawer.scrollIntoView({ behavior: "smooth" });
    };
  });

  container.querySelectorAll(".mp-btn-card-play").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const slug = btn.dataset.slug;
      api.openGameDetail?.(slug, "multiplayer");
    };
  });

  container.querySelectorAll(".mp-game-card").forEach((card) => {
    card.onclick = () => {
      const slug = card.dataset.slug;
      api.openGameDetail?.(slug, "multiplayer");
    };
  });
}

function renderPartyCard(p) {
  const leaderName = p.leader?.username || "Player";
  const gameTitle = p.gameTitle || p.gameSlug || "Custom Game";
  const memberCount = p.members?.length || 1;
  const maxSize = p.maxSize || 8;

  return `
    <div class="mp-party-card">
      <div class="mp-party-card-head">
        <span class="mp-party-game-title">${escapeHtml(gameTitle)}</span>
        <span class="chip chip-accent" style="font-size:10px;">${memberCount}/${maxSize}</span>
      </div>
      <p class="mp-party-leader">Hosted by <strong>${escapeHtml(leaderName)}</strong></p>
      ${p.name ? `<p class="mp-party-custom-name">${escapeHtml(p.name)}</p>` : ""}
      <div class="mp-party-card-foot">
        <span class="mp-party-status-dot">● ${escapeHtml(p.status || "Open")}</span>
        <button type="button" class="btn-primary btn-sm mp-btn-join-party" data-id="${escapeHtml(p.id)}">Join Party</button>
      </div>
    </div>
  `;
}

function bindPartyCardActions(container) {
  container.querySelectorAll(".mp-btn-join-party").forEach((btn) => {
    btn.onclick = async () => {
      const partyId = btn.dataset.id;
      setStatus("Joining party…");
      try {
        const res = await window.playbound.joinParty?.(partyId);
        if (res?.error) {
          setStatus(res.error, true);
          return;
        }
        setStatus("Joined party!");
        api.navigateTo?.("friends");
      } catch (err) {
        setStatus(err?.message || "Failed to join party", true);
      }
    };
  });
}

function renderEventCard(ev) {
  const isLive = ev.status === "live";
  const going = ev.counts?.going ?? 0;
  const whenStr = formatEventDate(ev.startsAt);

  return `
    <div class="mp-event-card">
      ${
        ev.coverImage
          ? `<div class="mp-event-cover-wrap"><img src="${escapeHtml(ev.coverImage)}" class="mp-event-cover" alt="" /></div>`
          : ""
      }
      <div class="mp-event-body">
        <div style="display:flex; gap:6px; margin-bottom:6px;">
          ${isLive ? `<span class="chip chip-danger" style="font-size:10px;">Live Now</span>` : ""}
          <span class="chip" style="font-size:10px;">${escapeHtml(ev.eventType || "Event")}</span>
        </div>
        <h4 class="mp-event-title">${escapeHtml(ev.title)}</h4>
        <p class="mp-event-date">${escapeHtml(whenStr)}</p>
        <div class="mp-event-foot">
          <span class="view-sub" style="margin:0">${going} attending</span>
          <button type="button" class="btn-secondary btn-sm mp-btn-view-ev" data-id="${escapeHtml(ev.id)}">View Event</button>
        </div>
      </div>
    </div>
  `;
}

api.renderMultiplayerView = renderMultiplayerView;
