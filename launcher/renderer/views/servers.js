import { createFreeOfferCard, createGameCard } from "../cards.js";
import {
  api,
  buildActivityPanelHtml,
  editionsContextSlug,
  enhanceSelect,
  escapeHtml,
  executableNoun,
  filterCatalogGames,
  gamePlayHintHtml,
  isGameDesktopCompatible,
  isMacOS,
  isModDesktopCompatible,
  selectExecutableLabel,
  setProgress,
  markViewReady,
  setStatus,
  startGameSession,
  state,
  views,
} from "../shared.js";

const MMO_SLUGS = new Set([
  "everquest",
  "asherons-call",
  "old-school-runescape",
  "star-wars-galaxies",
  "city-of-heroes",
  "entropia-universe",
  "eve-online",
  "tibia",
  "runescape",
  "albion-online",
  "guild-wars-2",
  "lotro",
  "dc-universe-online",
  "star-trek-online",
  "palia",
]);

function getDedicatedServerPlayerCount(liveStats, supportedGames) {
  if (!liveStats || !Array.isArray(liveStats.byGame)) return 0;
  const supportedSlugs = new Set((supportedGames || []).map((g) => g.slug));
  let total = 0;
  for (const entry of liveStats.byGame) {
    if (supportedSlugs.has(entry.slug) && !MMO_SLUGS.has(entry.slug)) {
      total += Number(entry.playingNow) || 0;
    }
  }
  return total;
}

async function renderServersView() {
  const container = views.servers;
  container.innerHTML = `
    <div class="section-header" style="margin-top: 0">
      <div>
        <h1 class="view-title" style="margin: 0">Servers <span class="servers-title-hint">Pick a game to see who&apos;s playing.</span></h1>
      </div>
      <button class="btn-secondary btn-sm" id="servers-refresh">
        <svg class="refresh-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -2px; margin-right: 4px;">
          <polyline points="23 4 23 10 17 10"></polyline>
          <polyline points="1 20 1 14 7 14"></polyline>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
        </svg>
        Refresh
      </button>
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
        <input type="search" class="input-text" id="servers-search" placeholder="Name, map, players…" value="${escapeHtml(state.serversState.search)}" />
      </div>
      <div class="servers-filter-options" aria-label="Server filters">
        <label class="servers-filter-toggle"><input type="checkbox" id="servers-installed-only" ${state.serversState.installedOnly ? "checked" : ""} /><span>Installed only</span></label>
        <label class="servers-filter-toggle"><input type="checkbox" id="servers-with-players" ${state.serversState.withPlayersOnly ? "checked" : ""} /><span>Servers with players</span></label>
      </div>
    </div>
    <p class="view-sub" id="servers-note" style="margin-top: 8px"></p>
    <p class="servers-stats" id="servers-stats"></p>
    <div id="servers-table-wrap"></div>
  `;

  document.getElementById("servers-refresh").addEventListener("click", () => {
    state.serversState.pingById = {};
    api.renderServersView();
  });
  document.getElementById("servers-search").addEventListener("input", (e) => {
    state.serversState.search = e.target.value;
    paintServersTable();
  });
  document.getElementById("servers-installed-only").addEventListener("change", (e) => {
    state.serversState.installedOnly = e.target.checked;
    state.serversState.pingById = {};
    void refreshServersPickersAndList();
  });
  document.getElementById("servers-with-players").addEventListener("change", (e) => {
    state.serversState.withPlayersOnly = e.target.checked;
    try {
      localStorage.setItem("playbound_servers_with_players", String(e.target.checked));
    } catch {
      /* ignore */
    }
    paintServersTable();
  });

  if (state._supportedServerGames && state._supportedServerGames.length > 0) {
    void refreshServersPickersAndList();
  }
  await loadServersBrowser();
  markViewReady(container);
}

let _serversCache = { slug: null, servers: [], title: "", note: "", error: "" };

function fillModDropdown(baseSlug) {
  const modSelect = document.getElementById("servers-mod");
  if (!modSelect) return;
  let modsForGame = (state._modsCatalog || []).filter(
    (m) =>
      m.baseGameSlug === baseSlug &&
      (m.baseSupported || m.baseHasServers) &&
      (state.compatibilityFilter !== "compatible" || isModDesktopCompatible(m))
  );
  if (state.serversState.installedOnly) {
    const installedModSlugs = new Set(
      (state._installedModsList || []).filter((m) => m.baseGameSlug === baseSlug).map((m) => m.slug)
    );
    modsForGame = modsForGame.filter((m) => installedModSlugs.has(m.slug));
  }
  if (
    state.serversState.selectedModSlug &&
    !modsForGame.some((m) => m.slug === state.serversState.selectedModSlug)
  ) {
    state.serversState.selectedModSlug = "";
  }
  const options = [`<option value="">Base game</option>`].concat(
    modsForGame.map(
      (m) =>
        `<option value="${escapeHtml(m.slug)}" ${m.slug === state.serversState.selectedModSlug ? "selected" : ""}>${escapeHtml(m.title)}</option>`
    )
  );
  modSelect.innerHTML = options.join("");
  modSelect.value = state.serversState.selectedModSlug || "";
  enhanceSelect(modSelect);
  modSelect._syncCustomSelect?.();
}

function selectedModOrNull() {
  if (!state.serversState.selectedModSlug) return null;
  return (state._modsCatalog || []).find((m) => m.slug === state.serversState.selectedModSlug) || null;
}

function gamesForServerPicker() {
  let list = filterCatalogGames(state._supportedServerGames.slice());
  if (state.serversState.installedOnly) {
    list = list.filter((g) => state._installedGameSlugs.has(g.slug));
  }
  return list;
}

async function refreshServersPickersAndList() {
  const gameSelect = document.getElementById("servers-game");
  const note = document.getElementById("servers-note");
  const supported = gamesForServerPicker();

  if (!supported.length) {
    document.getElementById("servers-table-wrap").innerHTML = state.serversState.installedOnly
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

  if (!state.serversState.selectedSlug || !supported.some((g) => g.slug === state.serversState.selectedSlug)) {
    state.serversState.selectedSlug = "";
    state.serversState.selectedModSlug = "";
  }

  gameSelect.innerHTML =
    `<option value="" disabled ${!state.serversState.selectedSlug ? "selected" : ""}>Select a game...</option>` +
    supported
      .map(
        (g) =>
          `<option value="${escapeHtml(g.slug)}" ${g.slug === state.serversState.selectedSlug ? "selected" : ""}>${escapeHtml(g.title)}${g.testing ? " · Testing" : ""}</option>`
      )
      .join("");

  enhanceSelect(gameSelect);
  gameSelect._syncCustomSelect?.();

  fillModDropdown(state.serversState.selectedSlug);

  const totalSupported = state._supportedServerGames.length;
  const totalNonMmoPlayers = getDedicatedServerPlayerCount(state._liveStats, state._supportedServerGames);
  const playerText = totalNonMmoPlayers > 0 ? ` · ${totalNonMmoPlayers.toLocaleString()} players on dedicated or hosted servers` : "";

  note.textContent = state.serversState.installedOnly
    ? `Showing ${supported.length} installed Games${playerText}`
    : `${totalSupported} Games${playerText}`;
  note.dataset.baseNote = note.textContent;

  await fetchAndShowServers(state.serversState.selectedSlug, selectedModOrNull());
}

async function loadServersBrowser() {
  const [index, modsRes, installed, installedMods, liveStats] = await Promise.all([
    window.playbound.getServerIndex(),
    window.playbound.getModsCatalog(),
    window.playbound.getInstalled(),
    window.playbound.getInstalledMods?.() || Promise.resolve([]),
    window.playbound.getLiveStats?.().catch(() => null),
  ]);
  state._liveStats = liveStats;
  state._modsCatalog = Array.isArray(modsRes.mods) ? modsRes.mods : [];
  state._supportedServerGames = (Array.isArray(index.games) ? index.games : []).filter((g) => g.supported);
  state._installedGameSlugs = new Set((installed || []).map((g) => g.slug));
  state._installedModsList = installedMods || [];

  const gameSelect = document.getElementById("servers-game");
  gameSelect.onchange = () => {
    state.serversState.selectedSlug = gameSelect.value;
    state.serversState.selectedModSlug = "";
    state.serversState.pingById = {};
    fillModDropdown(state.serversState.selectedSlug);
    void fetchAndShowServers(state.serversState.selectedSlug, null);
  };

  document.getElementById("servers-mod").onchange = (e) => {
    state.serversState.selectedModSlug = e.target.value || "";
    state.serversState.pingById = {};
    void fetchAndShowServers(state.serversState.selectedSlug, selectedModOrNull());
  };

  await refreshServersPickersAndList();
}

async function fetchAndShowServers(baseSlug, mod) {
  const wrap = document.getElementById("servers-table-wrap");
  if (!wrap) return;

  if (!baseSlug) {
    wrap.innerHTML = "";
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
    const natNote =
      baseSlug === "openra"
        ? "Joining a listed server never needs port forwarding. Hosting from your PC does — PlayBound turns on OpenRA’s UPnP so most home routers open UDP 1234 automatically."
        : "";
    noteEl.textContent = [noteEl.dataset.baseNote, noteExtra, errNote, natNote].filter(Boolean).join(" ").trim();
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
  const q = state.serversState.search.trim().toLowerCase();
  let rows = _serversCache.servers || [];
  /*
   * Most master lists are mostly idle boxes that still answer a query, so an
   * unfiltered browser buries the few worth joining. A null count is dropped
   * too: a server that does not report its population is not evidence that
   * anyone is on it.
   */
  if (state.serversState.withPlayersOnly) {
    rows = rows.filter((s) => Number(s.players) > 0);
  }
  if (q) {
    rows = rows.filter((s) => {
      const blob = `${s.name || ""} ${s.map || ""} ${s.players ?? ""}/${s.maxPlayers ?? ""} ${s.gameType || ""}`.toLowerCase();
      return blob.includes(q);
    });
  }

  const { sort, sortDir } = state.serversState;
  const dir = sortDir === "asc" ? 1 : -1;
  return rows.slice().sort((a, b) => {
    if (sort === "players") {
      return dir * ((Number(a.players) || 0) - (Number(b.players) || 0));
    }
    if (sort === "ping") {
      const idA = `${a.host}:${a.port}`;
      const idB = `${b.host}:${b.port}`;
      const pa = state.serversState.pingById[idA];
      const pb = state.serversState.pingById[idB];
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
  if (state.serversState.sort === key) {
    state.serversState.sortDir = state.serversState.sortDir === "asc" ? "desc" : "asc";
  } else {
    state.serversState.sort = key;
    state.serversState.sortDir = state.SERVER_SORT_DEFAULT_DIR[key] || "asc";
  }
  paintServersTable();
}

function serverSortHeader(key, label, title) {
  const active = state.serversState.sort === key;
  const arrow = active ? (state.serversState.sortDir === "asc" ? " ↑" : " ↓") : "";
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
    const ping = state.serversState.pingById[id];
    const pingLabel =
      ping === undefined ? "…" : ping == null ? "—" : `${ping} ms`;
    const slug = _serversCache.slug;
    const isInstalled = Boolean(state._installedGameSlugs?.has(slug));
    const actionLabel = isInstalled ? "Join" : "Install";
    const actionClass = isInstalled ? "btn-primary" : "btn-secondary";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${escapeHtml(s.name)}</strong>${s.gameType ? `<div class="server-meta">${escapeHtml(s.gameType)}</div>` : ""}</td>
      <td>${s.players == null ? "—" : `${s.players}/${s.maxPlayers ?? "—"}`}</td>
      <td>${escapeHtml(s.map || "—")}</td>
      <td>${escapeHtml(formatServerLocation(s))}</td>
      <td class="ping-cell" data-ping-id="${escapeHtml(id)}">${pingLabel}</td>
      <td>
        <button class="${actionClass} btn-sm btn-join" data-slug="${escapeHtml(slug)}" data-host="${escapeHtml(s.host)}" data-port="${Number(s.port) || 0}" data-mod="${escapeHtml(s.mod || "")}" data-installed="${isInstalled ? "1" : "0"}">${escapeHtml(actionLabel)}</button>
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
      const mod = btn.dataset.mod || undefined;
      const alreadyInstalled = btn.dataset.installed === "1";
      let has = alreadyInstalled;
      if (!has) {
        const installed = await window.playbound.getInstalled();
        has = (installed || []).some((g) => g.slug === slug);
      }
      if (!has) {
        setStatus(`Installing ${slug}…`);
        try {
          const res = await window.playbound.install(slug);
          if (res.status === "installer-opened") {
            setStatus("Installer opened — waiting for installer to finish…");
            setProgress(null);
            api.openGameDetail(slug, state.currentView);
            return;
          }
          // Refresh installed set so the next paint shows Join.
          const refreshed = await window.playbound.getInstalled();
          state._installedGameSlugs = new Set((refreshed || []).map((g) => g.slug));
          if (!state._installedGameSlugs.has(slug)) {
            setStatus("Install started — open the game page if you need to finish setup.");
            api.openGameDetail(slug, state.currentView);
            return;
          }
        } catch (err) {
          setStatus(err.message || String(err), true);
          return;
        }
      }
      setStatus(`Joining ${host}:${port}…`);
      try {
        await window.playbound.play(slug, { host, port, mod });
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
      if (r?.id != null) state.serversState.pingById[r.id] = r.ms;
    }
    paintServersTable();
  } catch {
    /* ignore */
  }
}

api.renderServersView = renderServersView;
