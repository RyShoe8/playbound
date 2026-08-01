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
  if (currentView === "settings") renderSettingsView();
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
        <p class="view-sub" style="margin: 4px 0 0 0">Games and mods installed on this PC.</p>
      </div>
      <button class="btn-secondary btn-sm" id="btn-sync-lib">Sync now</button>
    </div>
    <div id="library-list" style="margin-top: 20px"></div>
  `;

  document.getElementById("btn-sync-lib").addEventListener("click", async () => {
    setStatus("Syncing library with playbound.club...");
    if (window.playbound.syncLibraryNow) {
      const res = await window.playbound.syncLibraryNow();
      if (!res?.connected) {
        setStatus("Sign in from Settings to sync your library.", true);
        return;
      }
      if (res.error) setStatus(`Sync issue: ${res.error}`, true);
      else if (res.synced > 0) setStatus(`Synced ${res.synced} install${res.synced === 1 ? "" : "s"}.`);
      else setStatus("Library sync complete.");
    } else {
      await window.playbound.openDeepLink("playbound://sync");
    }
  });

  const [installed, installedMods, modsCat] = await Promise.all([
    window.playbound.getInstalled(),
    window.playbound.getInstalledMods?.() || Promise.resolve([]),
    window.playbound.getModsCatalog(),
  ]);
  const modTitles = new Map((modsCat.mods || []).map((m) => [m.slug, m.title]));
  const list = document.getElementById("library-list");

  if (!installed || installed.length === 0) {
    list.innerHTML = `
      <div style="text-align: center; padding: 40px 0;">
        <p class="view-sub">You don't have any games installed yet.</p>
        <button class="btn-primary" id="btn-go-games">Browse Games</button>
      </div>
    `;
    document.getElementById("btn-go-games")?.addEventListener("click", () => navigateTo("games"));
    return;
  }

  list.replaceChildren();
  for (const game of installed) {
    const block = document.createElement("div");
    block.className = "library-game-block";
    const card = createGameCard(game);
    block.appendChild(card);

    const gameMods = (installedMods || []).filter((m) => m.baseGameSlug === game.slug);
    if (gameMods.length) {
      const modsWrap = document.createElement("div");
      modsWrap.className = "library-mods";
      modsWrap.innerHTML = `<div class="library-mods-label">Installed mods</div>`;
      for (const mod of gameMods) {
        const row = document.createElement("div");
        row.className = "library-mod-row";
        const title = modTitles.get(mod.slug) || mod.title || mod.slug;
        row.innerHTML = `
          <span class="library-mod-title">${escapeHtml(title)}</span>
          <div class="library-mod-actions">
            ${mod.dir ? `<button class="btn-secondary btn-sm btn-mod-folder" type="button">Folder</button>` : ""}
            <button class="btn-danger btn-sm btn-mod-uninstall" type="button">Remove</button>
          </div>
        `;
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
        modsWrap.appendChild(row);
      }
      block.appendChild(modsWrap);
    }
    list.appendChild(block);
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
      <td>${s.players ?? 0}/${s.maxPlayers ?? "—"}</td>
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
            setStatus("Installer opened — finish setup, then try Join again.");
            setProgress(null);
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

  const heroStyle = coverUrl
    ? `background-image: linear-gradient(180deg, rgba(12,10,18,0.25) 0%, rgba(12,10,18,0.92) 70%, var(--bg-main) 100%), url('${coverUrl.replace(/'/g, "%27")}');`
    : `background-image: linear-gradient(180deg, rgba(12,10,18,0.2) 0%, rgba(12,10,18,0.95) 100%), ${bgGrad};`;

  container.innerHTML = `
    <button class="btn-secondary btn-sm" id="detail-back" style="margin-bottom: 12px">← Back</button>

    <section class="detail-bleed-hero" style="${heroStyle}">
      <div class="detail-bleed-inner">
        <div class="chip-row">${genreChips}${detail.multiplayer ? '<span class="chip chip-accent">Multiplayer</span>' : ""}</div>
        <h1 class="view-title detail-bleed-title">${escapeHtml(detail.title)}</h1>
        <p class="view-sub detail-bleed-sub">${escapeHtml(detail.blurb)} · ${escapeHtml(detail.approxSize || "")}${detail.version ? ` · v${escapeHtml(detail.version)}` : ""}</p>
        <div class="detail-bleed-actions" id="detail-actions"></div>
      </div>
    </section>

    <nav class="detail-tabs" id="detail-tabs">
      <button type="button" class="detail-tab ${detailActiveTab === "overview" ? "active" : ""}" data-tab="overview">Overview</button>
      <button type="button" class="detail-tab ${detailActiveTab === "servers" ? "active" : ""}" data-tab="servers">Servers</button>
      <button type="button" class="detail-tab ${detailActiveTab === "mods" ? "active" : ""}" data-tab="mods">Mods</button>
    </nav>

    <div class="detail-tab-panels">
      <div class="detail-tab-panel ${detailActiveTab === "overview" ? "active" : ""}" data-panel="overview">
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
        <p class="view-sub"><a href="#" id="detail-open-site">Open full page on playbound.club</a></p>
      </div>
      <div class="detail-tab-panel ${detailActiveTab === "servers" ? "active" : ""}" data-panel="servers" id="detail-servers-sec"></div>
      <div class="detail-tab-panel ${detailActiveTab === "mods" ? "active" : ""}" data-panel="mods" id="detail-mods-sec"></div>
    </div>
  `;

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
    actions.innerHTML = `<button class="btn-primary" id="act-install">Install Game</button>`;
    document.getElementById("act-install").addEventListener("click", async () => {
      setStatus("Starting install...");
      try {
        const res = await window.playbound.install(slug);
        if (res.status === "installed") {
          setStatus("Install complete!");
          setProgress(null);
          renderGameDetailView(slug);
        } else if (res.status === "installer-opened") {
          setStatus("Installer opened — we'll add it to your library when setup finishes.");
          setProgress(null);
        } else if (res.status === "external") {
          setStatus("Opened download page.");
          setProgress(null);
        }
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
      row.innerHTML = `
        <div>
          <div class="mod-row-title">${escapeHtml(mod.title)}</div>
          <div class="view-sub" style="margin:0">${escapeHtml(mod.tagline || "")}</div>
        </div>
        <button class="btn-sm ${mod.installed ? "btn-secondary" : "btn-primary"}" type="button">
          ${
            mod.installed
              ? "Installed"
              : mod.downloadKind === "external"
                ? "Open download page"
                : "Install"
          }
        </button>
      `;
      const btn = row.querySelector("button");
      if (!mod.installed) {
        btn.addEventListener("click", async () => {
          const external = mod.downloadKind === "external";
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
      } else if (mod.installedPath) {
        btn.textContent = "Folder";
        btn.addEventListener("click", () => window.playbound.openFolder(mod.installedPath));
      } else {
        btn.disabled = true;
      }
      modsList.appendChild(row);
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
        const res = await window.playbound.install(ctx.slug);
        if (res.status === "installer-opened") {
          setStatus("Installer opened — we'll add it to your library when setup finishes.");
          setProgress(null);
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

window.playbound.onProgress(({ phase, received, total }) => {
  if (phase === "resolving") setStatus("Resolving download package...");
  else if (phase === "downloading") {
    const pct = total ? Math.round((received / total) * 100) : null;
    setStatus(`Downloading... ${fmtBytes(received)}${total ? ` of ${fmtBytes(total)} (${pct}%)` : ""}`);
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

window.playbound.onContext((data) => {
  if (data) renderDeepLinkView(data);
});

refreshAccountStatus();
window.playbound.getContext().then((data) => {
  if (data) renderDeepLinkView(data);
  else navigateTo("home");
});
