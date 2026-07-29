// State
let currentView = "home";
let accountState = { connected: false };
let deepLinkCtx = null;
let currentDetailSlug = null;
let updateStatus = { phase: "idle" };

/** Games catalog filter state (persists across re-renders of the view). */
const gamesFilters = {
  query: "",
  genre: "",
  multiplayerOnly: false,
  installableOnly: false,
  sort: "name",
};

/** Servers browser state */
const serversState = {
  mode: "games", // games | mods
  selectedSlug: null,
  selectedModSlug: null,
  search: "",
  pingById: {},
};

// DOM Elements
const navBtns = document.querySelectorAll(".nav-btn");
const views = {
  home: document.getElementById("view-home"),
  library: document.getElementById("view-library"),
  servers: document.getElementById("view-servers"),
  games: document.getElementById("view-games"),
  settings: document.getElementById("view-settings"),
  gameDetail: document.getElementById("view-game-detail"),
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
  const navKey = viewName === "gameDetail" ? null : viewName;
  navBtns.forEach((btn) => {
    btn.classList.toggle("active", Boolean(navKey) && btn.dataset.view === navKey);
  });
  Object.keys(views).forEach((k) => {
    views[k].classList.toggle("active", k === viewName);
  });

  if (viewName === "home") renderHomeView();
  else if (viewName === "library") renderLibraryView();
  else if (viewName === "servers") renderServersView();
  else if (viewName === "games") renderGamesView();
  else if (viewName === "settings") renderSettingsView();
  else if (viewName === "gameDetail") renderGameDetailView(params.slug);
}

navBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.dataset.view) navigateTo(btn.dataset.view);
  });
});

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
      connectionLabel.textContent = "Connected";
    } else {
      connectionDot.className = "dot";
      connectionLabel.textContent = "Not connected";
    }
  } catch {
    connectionDot.className = "dot";
    connectionLabel.textContent = "Offline";
  }
}

window.playbound.onAccount((data) => {
  if (data?.message) setStatus(data.message, data.connected === false);
  refreshAccountStatus();
  if (currentView === "settings") renderSettingsView();
});

window.playbound.onUpdateStatus?.((data) => {
  updateStatus = data || { phase: "idle" };
  if (data?.phase === "available") setStatus(`Update ${data.version} available…`);
  if (data?.phase === "downloading") setStatus(`Downloading update… ${data.percent || 0}%`);
  if (data?.phase === "ready") {
    setStatus(`Update ${data.version} ready — install from Settings`);
    if (currentView === "settings") renderSettingsView();
  }
  if (data?.phase === "error") setStatus(data.message || "Update error", true);
});

// ── Views ────────────────────────────────────────────────────

async function renderHomeView() {
  const container = views.home;
  container.innerHTML = `
    <h1 class="view-title">Welcome back</h1>
    <p class="view-sub">Play your favorite titles or browse free games on PlayBound.</p>
    
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

  const [recent, installed, catalog] = await Promise.all([
    window.playbound.getRecentlyPlayed(),
    window.playbound.getInstalled(),
    window.playbound.getCatalog(),
  ]);

  const recentSec = document.getElementById("home-recent-section");
  const recentGrid = document.getElementById("home-recent-grid");
  if (recent && recent.length > 0) {
    recentSec.classList.remove("hidden");
    recentGrid.replaceChildren(...recent.map(createGameCard));
  }

  const installedGrid = document.getElementById("home-installed-grid");
  if (installed && installed.length > 0) {
    installedGrid.replaceChildren(...installed.map(createGameCard));
  } else {
    installedGrid.innerHTML = `<p class="view-sub">No games installed yet. <a href="#" id="home-empty-games">Browse Games</a></p>`;
    document.getElementById("home-empty-games")?.addEventListener("click", (e) => {
      e.preventDefault();
      navigateTo("games");
    });
  }

  const catalogGrid = document.getElementById("home-catalog-grid");
  catalogGrid.replaceChildren(...catalog.slice(0, 4).map(createGameCard));
}

async function renderLibraryView() {
  const container = views.library;
  container.innerHTML = `
    <div class="section-header" style="margin-top: 0">
      <div>
        <h1 class="view-title" style="margin: 0">My Library</h1>
        <p class="view-sub" style="margin: 4px 0 0 0">Games installed on this PC.</p>
      </div>
      <button class="btn-secondary btn-sm" id="btn-sync-lib">Sync with Site</button>
    </div>
    <div id="library-grid" class="game-grid" style="margin-top: 20px"></div>
  `;

  document.getElementById("btn-sync-lib").addEventListener("click", async () => {
    setStatus("Syncing library with playbound.club...");
    await window.playbound.openDeepLink("playbound://sync");
  });

  const installed = await window.playbound.getInstalled();
  const grid = document.getElementById("library-grid");

  if (!installed || installed.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px 0;">
        <p class="view-sub">You don't have any games installed yet.</p>
        <button class="btn-primary" id="btn-go-games">Browse Games</button>
      </div>
    `;
    document.getElementById("btn-go-games")?.addEventListener("click", () => navigateTo("games"));
    return;
  }

  grid.replaceChildren(...installed.map(createGameCard));
}

// ── Servers (Games | Mods) ───────────────────────────────────

async function renderServersView() {
  const container = views.servers;
  container.innerHTML = `
    <div class="section-header" style="margin-top: 0">
      <div>
        <h1 class="view-title" style="margin: 0">Server Browser</h1>
        <p class="view-sub" style="margin: 4px 0 0 0">Live multiplayer for all PlayBound titles — TCP ping from this PC.</p>
      </div>
      <button class="btn-secondary btn-sm" id="servers-refresh">Refresh</button>
    </div>

    <div class="mode-toggle" id="servers-mode">
      <button type="button" class="mode-btn ${serversState.mode === "games" ? "active" : ""}" data-mode="games">Games</button>
      <button type="button" class="mode-btn ${serversState.mode === "mods" ? "active" : ""}" data-mode="mods">Mods</button>
    </div>

    <div class="servers-toolbar">
      <input type="search" class="input-text" id="servers-search" placeholder="Filter by name, map, players…" value="${escapeHtml(serversState.search)}" />
      <select class="input-text" id="servers-picker"></select>
    </div>
    <p class="view-sub" id="servers-note" style="margin-top: 8px"></p>
    <div id="servers-table-wrap"><p class="view-sub">Loading…</p></div>
  `;

  document.getElementById("servers-refresh").addEventListener("click", () => {
    serversState.pingById = {};
    renderServersView();
  });
  document.getElementById("servers-mode").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-mode]");
    if (!btn) return;
    serversState.mode = btn.dataset.mode;
    serversState.selectedSlug = null;
    serversState.selectedModSlug = null;
    serversState.pingById = {};
    renderServersView();
  });
  document.getElementById("servers-search").addEventListener("input", (e) => {
    serversState.search = e.target.value;
    paintServersTable();
  });

  if (serversState.mode === "mods") {
    await loadServersModsMode();
  } else {
    await loadServersGamesMode();
  }
}

let _serversCache = { slug: null, servers: [], title: "", note: "" };

async function loadServersGamesMode() {
  const index = await window.playbound.getServerIndex();
  const games = Array.isArray(index.games) ? index.games : [];
  const supported = games.filter((g) => g.supported);
  const picker = document.getElementById("servers-picker");
  const note = document.getElementById("servers-note");

  if (!supported.length) {
    document.getElementById("servers-table-wrap").innerHTML =
      `<p class="view-sub">No server providers available right now.</p>`;
    return;
  }

  if (!serversState.selectedSlug || !supported.some((g) => g.slug === serversState.selectedSlug)) {
    serversState.selectedSlug = supported[0].slug;
  }

  picker.innerHTML = supported
    .map(
      (g) =>
        `<option value="${escapeHtml(g.slug)}" ${g.slug === serversState.selectedSlug ? "selected" : ""}>${escapeHtml(g.title)}</option>`
    )
    .join("");

  const unsupported = games.filter((g) => !g.supported);
  note.textContent = unsupported.length
    ? `${supported.length} live browser(s). ${unsupported.length} multiplayer title(s) not yet wired for lists.`
    : `${supported.length} live browser(s).`;

  picker.onchange = () => {
    serversState.selectedSlug = picker.value;
    serversState.pingById = {};
    void fetchAndShowServers(serversState.selectedSlug, null);
  };

  await fetchAndShowServers(serversState.selectedSlug, null);
}

async function loadServersModsMode() {
  const [modsRes, index] = await Promise.all([
    window.playbound.getModsCatalog(),
    window.playbound.getServerIndex(),
  ]);
  const mods = (modsRes.mods || []).filter((m) => m.baseSupported || m.baseHasServers);
  const picker = document.getElementById("servers-picker");
  const note = document.getElementById("servers-note");

  if (!mods.length) {
    document.getElementById("servers-table-wrap").innerHTML =
      `<p class="view-sub">No catalog mods with a multiplayer base game yet.</p>`;
    picker.innerHTML = "";
    note.textContent = "";
    return;
  }

  if (!serversState.selectedModSlug || !mods.some((m) => m.slug === serversState.selectedModSlug)) {
    serversState.selectedModSlug = mods[0].slug;
  }

  picker.innerHTML = mods
    .map(
      (m) =>
        `<option value="${escapeHtml(m.slug)}" ${m.slug === serversState.selectedModSlug ? "selected" : ""}>${escapeHtml(m.title)} (${escapeHtml(m.baseGameSlug)})</option>`
    )
    .join("");

  note.textContent =
    "Join uses the base game. Rows filter by gameType when the server list exposes it (e.g. OpenRA).";

  picker.onchange = () => {
    serversState.selectedModSlug = picker.value;
    serversState.pingById = {};
    const mod = mods.find((m) => m.slug === serversState.selectedModSlug);
    if (mod) void fetchAndShowServers(mod.baseGameSlug, mod);
  };

  const mod = mods.find((m) => m.slug === serversState.selectedModSlug);
  if (mod) await fetchAndShowServers(mod.baseGameSlug, mod);
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
  };

  const noteEl = document.getElementById("servers-note");
  if (noteEl && noteExtra) {
    const base = noteEl.textContent || "";
    if (!base.includes(noteExtra)) noteEl.textContent = `${base} ${noteExtra}`.trim();
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

function paintServersTable() {
  const wrap = document.getElementById("servers-table-wrap");
  if (!wrap || !_serversCache.slug) return;

  const q = serversState.search.trim().toLowerCase();
  let rows = _serversCache.servers;
  if (q) {
    rows = rows.filter((s) => {
      const blob = `${s.name || ""} ${s.map || ""} ${s.players ?? ""}/${s.maxPlayers ?? ""} ${s.gameType || ""}`.toLowerCase();
      return blob.includes(q);
    });
  }

  if (!rows.length) {
    wrap.innerHTML = `<p class="view-sub">No servers match.</p>`;
    return;
  }

  const table = document.createElement("table");
  table.className = "server-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th>Server Name</th>
        <th>Players</th>
        <th>Map / Mode</th>
        <th>Location</th>
        <th title="TCP connect RTT from this PC">Ping</th>
        <th>Action</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector("tbody");

  for (const s of rows) {
    const id = s.id || `${s.host}:${s.port}`;
    const ping = serversState.pingById[id];
    const pingLabel =
      ping === undefined ? "…" : ping == null ? "—" : `${ping} ms`;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${escapeHtml(s.name)}</strong>${s.gameType ? `<div class="server-meta">${escapeHtml(s.gameType)}</div>` : ""}</td>
      <td>${s.players ?? 0}/${s.maxPlayers ?? "—"}</td>
      <td>${escapeHtml(s.map || "—")}</td>
      <td>${escapeHtml(s.location?.countryCode || "—")}</td>
      <td class="ping-cell" data-ping-id="${escapeHtml(id)}">${pingLabel}</td>
      <td>
        <button class="btn-primary btn-sm btn-join" data-slug="${escapeHtml(_serversCache.slug)}" data-host="${escapeHtml(s.host)}" data-port="${Number(s.port) || 0}">Join</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  wrap.replaceChildren(table);

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
          await window.playbound.install(slug);
        } catch (err) {
          setStatus(err.message || String(err), true);
          return;
        }
      }
      setStatus(`Joining ${host}:${port}…`);
      try {
        await window.playbound.play(slug, { host, port });
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
    id: s.id || `${s.host}:${s.port}`,
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
  let list = catalog.slice();

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
      <label class="settings-label">Account Link</label>
      <p class="settings-hint">Connecting to PlayBound allows library syncing between your desktop client and web profile.</p>
      <div style="display: flex; gap: 10px; align-items: center;">
        <span class="dot ${accountState.connected ? "online" : ""}"></span>
        <span style="font-size: 13px; font-weight: 600;">${accountState.connected ? "Connected to playbound.club" : "Not connected"}</span>
      </div>
      <div style="margin-top: 14px; display: flex; gap: 8px;">
        <button class="btn-primary btn-sm" id="set-btn-signin">${accountState.connected ? "Reconnect" : "Sign In via Browser"}</button>
        ${accountState.connected ? '<button class="btn-danger btn-sm" id="set-btn-signout">Disconnect</button>' : ""}
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
      <p class="settings-hint">Current version: <strong>${escapeHtml(version)}</strong>. ${escapeHtml(updateHint)} First install still uses Setup from the site; later updates install in-app. Unsigned builds may show SmartScreen.</p>
      <div style="margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap;">
        <button class="btn-secondary btn-sm" id="set-btn-check-update" ${packaged ? "" : "disabled"}>Check for updates</button>
        <button class="btn-primary btn-sm" id="set-btn-install-update" ${ready ? "" : "disabled"}>Install and restart</button>
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

  const coverHtml = detail.coverImage
    ? `<img class="detail-cover" src="${escapeHtml(detail.coverImage)}" alt="" data-fallback-letter="${escapeHtml(detail.title.charAt(0))}" data-fallback-grad="${escapeHtml(bgGrad)}" />`
    : `<div class="detail-cover-fallback" style="background: ${bgGrad}">${escapeHtml(detail.title.charAt(0))}</div>`;

  container.innerHTML = `
    <button class="btn-secondary btn-sm" id="detail-back" style="margin-bottom: 20px">← Back</button>
    
    <div style="display: flex; gap: 24px; align-items: flex-start; margin-bottom: 28px;">
      <div class="detail-cover-wrap">${coverHtml}</div>
      <div>
        <h1 class="view-title" style="margin: 0">${escapeHtml(detail.title)}</h1>
        <p class="view-sub" style="margin: 6px 0 16px 0">${escapeHtml(detail.blurb)} · ${escapeHtml(detail.approxSize || "")}</p>
        <div style="display: flex; gap: 10px; flex-wrap: wrap;" id="detail-actions"></div>
      </div>
    </div>

    <div id="detail-servers-sec"></div>
  `;

  const coverImg = container.querySelector("img.detail-cover");
  if (coverImg) {
    coverImg.addEventListener("error", () => {
      const letter = coverImg.dataset.fallbackLetter || "?";
      const grad = coverImg.dataset.fallbackGrad || bgGrad;
      const fallback = document.createElement("div");
      fallback.className = "detail-cover-fallback";
      fallback.style.background = grad;
      fallback.textContent = letter;
      coverImg.replaceWith(fallback);
    });
  }

  document.getElementById("detail-back").addEventListener("click", () => navigateTo("library"));

  const actions = document.getElementById("detail-actions");
  if (detail.installed) {
    actions.innerHTML = `
      <button class="btn-success" id="act-play">Play Now</button>
      <button class="btn-secondary" id="act-shortcut">Create Shortcut</button>
      <button class="btn-secondary" id="act-folder">Open Folder</button>
      <button class="btn-danger" id="act-uninstall">Uninstall</button>
    `;
    document.getElementById("act-play").addEventListener("click", async () => {
      setStatus("Launching...");
      await window.playbound.play(slug);
    });
    document.getElementById("act-shortcut").addEventListener("click", async () => {
      try {
        const res = await window.playbound.createShortcut(slug);
        setStatus(`Desktop shortcut created for ${res.title}`);
      } catch (err) {
        setStatus(err.message || String(err), true);
      }
    });
    document.getElementById("act-folder").addEventListener("click", () => {
      if (detail.installedPath) window.playbound.openFolder(detail.installedPath);
    });
    document.getElementById("act-uninstall").addEventListener("click", async () => {
      if (!confirm(`Uninstall ${detail.title}?`)) return;
      setStatus("Uninstalling...");
      await window.playbound.uninstall(slug);
      renderGameDetailView(slug);
    });
  } else {
    actions.innerHTML = `
      <button class="btn-primary" id="act-install">Install Game</button>
    `;
    document.getElementById("act-install").addEventListener("click", async () => {
      setStatus("Starting install...");
      try {
        const res = await window.playbound.install(slug);
        if (res.status === "installed") {
          setStatus("Install complete!");
          renderGameDetailView(slug);
        }
      } catch (err) {
        setStatus(err.message || String(err), true);
      }
    });
  }

  const serversRes = await window.playbound.getServers(slug);
  const sSec = document.getElementById("detail-servers-sec");
  if (serversRes.supported && serversRes.servers?.length > 0) {
    sSec.innerHTML = `
      <div class="section-header">Live Servers (${serversRes.servers.length})</div>
      <table class="server-table">
        <thead>
          <tr>
            <th>Server Name</th>
            <th>Players</th>
            <th>Map</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${serversRes.servers
            .map(
              (s) => `
            <tr>
              <td><strong>${escapeHtml(s.name)}</strong></td>
              <td>${s.players ?? 0}/${s.maxPlayers ?? 0}</td>
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
    sSec.querySelectorAll(".btn-join-s").forEach((b) => {
      b.addEventListener("click", async () => {
        await window.playbound.play(slug, { host: b.dataset.host, port: Number(b.dataset.port) });
      });
    });
  }
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
        await window.playbound.install(ctx.slug);
        navigateTo("library");
      } catch (err) {
        setStatus(err.message || String(err), true);
      }
    });
  } else if (ctx.action === "play") {
    actions.innerHTML = `
      <button class="btn-success" id="dl-act-run">Launch Game</button>
      <button class="btn-secondary" id="dl-act-cancel">Cancel</button>
    `;
    document.getElementById("dl-act-run").addEventListener("click", async () => {
      await window.playbound.play(ctx.slug, ctx.join);
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
      <div class="card-title">${escapeHtml(game.title)}</div>
      <div class="card-blurb">${escapeHtml(game.blurb || "")}</div>
      <div class="card-footer">
        <span style="font-size: 11px; color: var(--text-dim);">${escapeHtml(game.approxSize || "")}</span>
        <button class="btn-secondary btn-sm" type="button">View</button>
      </div>
  `;
  card.appendChild(body);

  card.addEventListener("click", () => navigateTo("gameDetail", { slug: game.slug }));
  return card;
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

window.playbound.onProgress(({ phase, received, total }) => {
  if (phase === "resolving") setStatus("Resolving download package...");
  else if (phase === "downloading") {
    const pct = total ? Math.round((received / total) * 100) : null;
    setStatus(`Downloading... ${fmtBytes(received)}${total ? ` of ${fmtBytes(total)} (${pct}%)` : ""}`);
    setProgress(pct);
  } else if (phase === "extracting") {
    setStatus("Extracting game files...");
    setProgress(100);
  } else if (phase === "done") {
    setStatus("Complete!");
    setProgress(null);
  }
});

window.playbound.onInstallDetected(() => {
  if (currentView === "library") renderLibraryView();
  else if (currentView === "home") renderHomeView();
});

window.playbound.onContext((data) => {
  if (data) renderDeepLinkView(data);
});

refreshAccountStatus();
window.playbound.getContext().then((data) => {
  if (data) renderDeepLinkView(data);
  else navigateTo("home");
});
