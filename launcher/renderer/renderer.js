// State
let currentView = "home";
let accountState = { connected: false };
let deepLinkCtx = null;
let currentDetailSlug = null;

// DOM Elements
const navBtns = document.querySelectorAll(".nav-btn");
const views = {
  home: document.getElementById("view-home"),
  library: document.getElementById("view-library"),
  servers: document.getElementById("view-servers"),
  store: document.getElementById("view-store"),
  settings: document.getElementById("view-settings"),
  gameDetail: document.getElementById("view-game-detail"),
  deepLink: document.getElementById("view-deep-link"),
};
const connectionDot = document.getElementById("connection-dot");
const connectionLabel = document.getElementById("connection-label");
const statusMsg = document.getElementById("statusbar-msg");
const statusProgress = document.getElementById("statusbar-progress");
const statusBar = document.getElementById("statusbar-bar");

// Helper: Format Bytes
const fmtBytes = (n) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(0)} MB` : `${Math.round(n / 1e3)} KB`;

// Navigation Router
function navigateTo(viewName, params = {}) {
  currentView = viewName;
  navBtns.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === viewName);
  });
  Object.keys(views).forEach((k) => {
    views[k].classList.toggle("active", k === viewName);
  });

  if (viewName === "home") renderHomeView();
  else if (viewName === "library") renderLibraryView();
  else if (viewName === "servers") renderServersView();
  else if (viewName === "store") renderStoreView();
  else if (viewName === "settings") renderSettingsView();
  else if (viewName === "gameDetail") renderGameDetailView(params.slug);
}

navBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.dataset.view) navigateTo(btn.dataset.view);
  });
});

// Status Helpers
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

// ── Account & Connection Status ─────────────────────────────
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

// ── Views Implementation ────────────────────────────────────

// 1. HOME VIEW
async function renderHomeView() {
  const container = views.home;
  container.innerHTML = `
    <h1 class="view-title">Welcome back</h1>
    <p class="view-sub">Play your favorite titles or explore what's new on PlayBound.</p>
    
    <div id="home-recent-section" class="hidden">
      <div class="section-header">Recently Played</div>
      <div id="home-recent-grid" class="game-grid"></div>
    </div>

    <div class="section-header">Installed Games</div>
    <div id="home-installed-grid" class="game-grid"></div>

    <div class="section-header">Featured Catalog</div>
    <div id="home-catalog-grid" class="game-grid"></div>
  `;

  const [recent, installed, catalog] = await Promise.all([
    window.playbound.getRecentlyPlayed(),
    window.playbound.getInstalled(),
    window.playbound.getCatalog(),
  ]);

  // Recently Played
  const recentSec = document.getElementById("home-recent-section");
  const recentGrid = document.getElementById("home-recent-grid");
  if (recent && recent.length > 0) {
    recentSec.classList.remove("hidden");
    recentGrid.replaceChildren(...recent.map(createGameCard));
  }

  // Installed
  const installedGrid = document.getElementById("home-installed-grid");
  if (installed && installed.length > 0) {
    installedGrid.replaceChildren(...installed.map(createGameCard));
  } else {
    installedGrid.innerHTML = `<p class="view-sub">No games installed yet. Check out the Store view!</p>`;
  }

  // Catalog
  const catalogGrid = document.getElementById("home-catalog-grid");
  catalogGrid.replaceChildren(...catalog.slice(0, 4).map(createGameCard));
}

// 2. LIBRARY VIEW
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
        <button class="btn-primary" id="btn-go-store">Browse Store</button>
      </div>
    `;
    document.getElementById("btn-go-store")?.addEventListener("click", () => navigateTo("store"));
    return;
  }

  grid.replaceChildren(...installed.map(createGameCard));
}

// 3. SERVER BROWSER VIEW
async function renderServersView() {
  const container = views.servers;
  container.innerHTML = `
    <h1 class="view-title">Server Browser</h1>
    <p class="view-sub">Live multiplayer servers for your installed games.</p>
    <div id="servers-container">
      <p class="view-sub">Fetching active servers...</p>
    </div>
  `;

  const serverGroups = await window.playbound.getAllServers();
  const sec = document.getElementById("servers-container");

  if (!serverGroups || serverGroups.length === 0) {
    sec.innerHTML = `<p class="view-sub">No active dedicated servers found for your installed games.</p>`;
    return;
  }

  sec.innerHTML = "";
  for (const group of serverGroups) {
    const groupEl = document.createElement("div");
    groupEl.style.marginBottom = "28px";
    groupEl.innerHTML = `
      <div class="section-header" style="margin-top: 0">${group.title} (${group.servers.length})</div>
      <table class="server-table">
        <thead>
          <tr>
            <th>Server Name</th>
            <th>Players</th>
            <th>Map / Mode</th>
            <th>Location</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    `;
    const tbody = groupEl.querySelector("tbody");
    for (const s of group.servers) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong>${escapeHtml(s.name)}</strong></td>
        <td>${s.players ?? 0}/${s.maxPlayers ?? 0}</td>
        <td>${escapeHtml(s.map || "Standard")}</td>
        <td>${escapeHtml(s.location?.countryCode || "—")}</td>
        <td>
          <button class="btn-primary btn-sm btn-join" data-slug="${group.slug}" data-host="${s.host}" data-port="${s.port}">Join</button>
        </td>
      `;
      tbody.appendChild(tr);
    }
    sec.appendChild(groupEl);
  }

  sec.querySelectorAll(".btn-join").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const slug = btn.dataset.slug;
      const host = btn.dataset.host;
      const port = Number(btn.dataset.port);
      setStatus(`Joining ${host}:${port}...`);
      try {
        await window.playbound.play(slug, { host, port });
      } catch (err) {
        setStatus(err.message || String(err), true);
      }
    });
  });
}

// 4. STORE VIEW
async function renderStoreView() {
  const container = views.store;
  container.innerHTML = `
    <div class="section-header" style="margin-top: 0">
      <div>
        <h1 class="view-title" style="margin: 0">Catalog & Games</h1>
        <p class="view-sub" style="margin: 4px 0 0 0">Discover free open-source and community PC games.</p>
      </div>
      <button class="btn-secondary btn-sm" id="btn-open-web">Open playbound.club</button>
    </div>
    <div id="store-grid" class="game-grid" style="margin-top: 20px"></div>
  `;

  document.getElementById("btn-open-web").addEventListener("click", () => {
    window.playbound.openExternal("https://playbound.club/discover");
  });

  const catalog = await window.playbound.getCatalog();
  const grid = document.getElementById("store-grid");
  grid.replaceChildren(...catalog.map(createGameCard));
}

// 5. SETTINGS VIEW
async function renderSettingsView() {
  const container = views.settings;
  const settings = await window.playbound.getSettings();

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
}

// 6. GAME DETAIL VIEW
async function renderGameDetailView(slug) {
  currentDetailSlug = slug;
  const container = views.gameDetail;
  container.innerHTML = `<p class="view-sub">Loading game details...</p>`;

  const detail = await window.playbound.getGameDetail(slug);
  if (!detail) {
    container.innerHTML = `<p class="view-sub">Game not found.</p>`;
    return;
  }

  const bgGrad = Array.isArray(detail.art) && detail.art.length >= 2
    ? `linear-gradient(135deg, ${detail.art[0]}, ${detail.art[1]})`
    : `linear-gradient(135deg, #312e81, #a78bfa)`;

  container.innerHTML = `
    <button class="btn-secondary btn-sm" id="detail-back" style="margin-bottom: 20px">← Back</button>
    
    <div style="display: flex; gap: 24px; align-items: flex-start; margin-bottom: 28px;">
      <div style="width: 100px; height: 100px; border-radius: 18px; background: ${bgGrad}; display: flex; align-items: center; justify-content: center; font-size: 42px; font-weight: 900; color: #fff; flex-shrink: 0;">
        ${escapeHtml(detail.title.charAt(0))}
      </div>
      <div>
        <h1 class="view-title" style="margin: 0">${escapeHtml(detail.title)}</h1>
        <p class="view-sub" style="margin: 6px 0 16px 0">${escapeHtml(detail.blurb)} · ${escapeHtml(detail.approxSize || "")}</p>
        <div style="display: flex; gap: 10px; flex-wrap: wrap;" id="detail-actions"></div>
      </div>
    </div>

    <div id="detail-servers-sec"></div>
  `;

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

  // Load game servers if any
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
          ${serversRes.servers.map((s) => `
            <tr>
              <td><strong>${escapeHtml(s.name)}</strong></td>
              <td>${s.players ?? 0}/${s.maxPlayers ?? 0}</td>
              <td>${escapeHtml(s.map || "Standard")}</td>
              <td>
                <button class="btn-primary btn-sm btn-join-s" data-host="${s.host}" data-port="${s.port}">Join</button>
              </td>
            </tr>
          `).join("")}
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

// 7. DEEP LINK VIEW (Action context popped from site)
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

// ── UI Helper: Create Game Card Element ─────────────────────
function createGameCard(game) {
  const card = document.createElement("div");
  card.className = "game-card";
  
  const bgGrad = Array.isArray(game.art) && game.art.length >= 2
    ? `linear-gradient(135deg, ${game.art[0]}, ${game.art[1]})`
    : `linear-gradient(135deg, #312e81, #a78bfa)`;

  card.innerHTML = `
    <div class="card-banner" style="background: ${bgGrad}">
      ${escapeHtml(game.title.charAt(0))}
    </div>
    <div class="card-body">
      <div class="card-title">${escapeHtml(game.title)}</div>
      <div class="card-blurb">${escapeHtml(game.blurb || "")}</div>
      <div class="card-footer">
        <span style="font-size: 11px; color: var(--text-dim);">${escapeHtml(game.approxSize || "")}</span>
        <button class="btn-secondary btn-sm">View</button>
      </div>
    </div>
  `;

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

// ── IPC Listeners ───────────────────────────────────────────
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

// Initial boot
refreshAccountStatus();
window.playbound.getContext().then((data) => {
  if (data) renderDeepLinkView(data);
  else navigateTo("home");
});
