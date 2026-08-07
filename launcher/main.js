const { app, BrowserWindow, ipcMain, shell, dialog, Tray, Menu, nativeImage } = require("electron");
const { spawn, execFileSync } = require("child_process");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const net = require("net");
const bundledCatalog = require("./catalog");
const { createTelemetry } = require("./telemetry");
const Platform = require("./platform");
const GameLauncher = require("./services/GameLauncher");

/** Mutable catalog: bundled fallback, overwritten/merged from the site API. */
let catalog = bundledCatalog.map((e) => ({ ...e }));

const PROTOCOL = "playbound";
const DEFAULT_GAMES_DIR = Platform.getInstallDirectory("");
const STATE_FILE = path.join(app.getPath("userData"), "installed.json");
const SETTINGS_FILE = path.join(app.getPath("userData"), "settings.json");
const DEFAULT_API_BASE = "https://playbound.club";
/** Stable Blob prefix used by electron-updater (must match package.json build.publish). */
const UPDATER_FEED_URL = "https://mt8u2b96lweefbpb.public.blob.vercel-storage.com/launcher/";

let win = null;
/** @type {import("electron").Tray | null} */
let tray = null;
/** The single action this launch is for: { action: 'install'|'play'|'uninstall', slug } | null */
let context = null;
/** Background poll after opening a Windows installer wizard */
let installerPollTimer = null;
let installerPollSlug = null;
/** Delayed full-drive BFS — only after known-path poll grace period */
let exeScanDelayTimer = null;
/** @type {{ slug: string, abort: boolean, generation: number } | null} */
let exeScanJob = null;
let exeScanGeneration = 0;
/** @type {import('electron-updater').UpdateInfo | null} */
let pendingUpdate = null;

/* ── protocol registration ─────────────────────────────────── */
/* Lets website links like playbound://install/openra hand off to this app. */

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

/* ── single instance: a new deep link replaces the current window's context ── */

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const url = argv.find((a) => a.startsWith(`${PROTOCOL}://`));
    if (url) handleDeepLink(parseDeepLink(url));
    showMainWindow();
  });
}

function parseDeepLink(url) {
  // playbound://install/openra
  // playbound://install-mod/my-mod
  // playbound://play-mod/my-mod
  // playbound://open-folder/openra
  // playbound://open-folder-mod/my-mod
  // playbound://uninstall-mod/my-mod
  // playbound://locate/naev
  // playbound://join/openra?host=1.2.3.4&port=1234&name=Server
  // playbound://auth
  // playbound://sync
  // playbound://link?token=...
  try {
    const normalized = String(url).replace(/^playbound:\/\//i, "https://");
    const u = new URL(normalized);
    const action = u.hostname.toLowerCase();
    if (action === "auth") return { action: "auth" };
    if (action === "sync") return { action: "sync" };
    if (action === "link") {
      return { action: "link", token: u.searchParams.get("token") || "" };
    }
    const slug = u.pathname.replace(/^\/+|\/+$/g, "").toLowerCase();
    const slugActions = [
      "install",
      "play",
      "uninstall",
      "join",
      "install-mod",
      "play-mod",
      "open-folder",
      "open-folder-mod",
      "uninstall-mod",
      "locate",
    ];
    if (!slug || !slugActions.includes(action)) {
      return null;
    }
    /** @type {{ action: string, slug: string, host?: string, port?: number, name?: string }} */
    const parsed = { action, slug };
    if (action === "join") {
      parsed.host = u.searchParams.get("host") || "";
      parsed.port = Number(u.searchParams.get("port") || 0);
      parsed.name = u.searchParams.get("name") || "";
    }
    if (action === "install" || action === "play") {
      const edition = u.searchParams.get("edition");
      if (edition) parsed.editionSlug = edition;
    }
    return parsed;
  } catch {
    return null;
  }
}

const CONNECTED_LIBRARY_MSG = "Signed in. Your installs sync automatically.";

let authWin = null;
let lastLibrarySyncAt = 0;
let librarySyncTimer = null;
const LIBRARY_SYNC_COOLDOWN_MS = 30_000;
const LIBRARY_SYNC_INTERVAL_MS = 15 * 60 * 1000;

function notifyAccount(payload = {}) {
  if (win && !win.isDestroyed()) {
    win.webContents.send("account", payload);
  }
}

function persistLauncherToken(token, { notify = true } = {}) {
  const settings = loadSettings();
  const trimmed = String(token || "").trim();
  if (!trimmed) {
    delete settings.launcherToken;
  } else {
    settings.launcherToken = trimmed;
  }
  if (!settings.apiBase) settings.apiBase = DEFAULT_API_BASE;
  saveSettings(settings);
  if (notify) notifyAccount({ connected: Boolean(settings.launcherToken) });
  return { connected: Boolean(settings.launcherToken) };
}

/** Sync every game + mod in installed.json to the library. */
async function syncAllInstalledGames() {
  const settings = loadSettings();
  const token = settings.launcherToken;
  if (!token) return { synced: 0, skipped: [], error: null };

  const state = loadState();
  const installs = [];
  for (const [slug, info] of Object.entries(state)) {
    if (slug === "__mods__") continue;
    if (!info || typeof info !== "object" || !info.dir) continue;
    installs.push({
      slug,
      ...(info.version ? { version: String(info.version) } : {}),
    });
  }

  const modInstalls = [];
  const mods = state.__mods__ && typeof state.__mods__ === "object" ? state.__mods__ : {};
  for (const [slug, info] of Object.entries(mods)) {
    if (!info || typeof info !== "object") continue;
    if (!info.baseGameSlug) continue;
    modInstalls.push({
      slug,
      baseGameSlug: String(info.baseGameSlug),
      ...(info.version ? { version: String(info.version) } : {}),
    });
  }

  if (!installs.length && !modInstalls.length) return { synced: 0, skipped: [], error: null };

  try {
    const res = await fetch(`${getApiBase()}/api/library/sync/batch`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        "user-agent": "playbound-launcher",
      },
      body: JSON.stringify({ installs, modInstalls }),
    });
    if (res.status === 401) {
      return { synced: 0, skipped: [], error: "unauthorized" };
    }
    if (!res.ok) {
      console.warn(`Library batch sync failed: HTTP ${res.status}`);
      let synced = 0;
      const skipped = [];
      for (const item of installs) {
        try {
          const one = await fetch(`${getApiBase()}/api/library/sync`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${token}`,
              "user-agent": "playbound-launcher",
            },
            body: JSON.stringify({
              slug: item.slug,
              action: "install",
              version: item.version,
            }),
          });
          if (one.status === 401) {
            return { synced: 0, skipped: [], error: "unauthorized" };
          }
          if (one.ok) synced += 1;
          else skipped.push(item.slug);
        } catch {
          skipped.push(item.slug);
        }
      }
      for (const item of modInstalls) {
        try {
          const one = await fetch(`${getApiBase()}/api/library/sync`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${token}`,
              "user-agent": "playbound-launcher",
            },
            body: JSON.stringify({
              kind: "mod",
              slug: item.slug,
              baseGameSlug: item.baseGameSlug,
              action: "install",
              version: item.version,
            }),
          });
          if (one.ok) synced += 1;
          else skipped.push(item.slug);
        } catch {
          skipped.push(item.slug);
        }
      }
      return { synced, skipped, error: null };
    }
    const data = await res.json();
    return {
      synced: (Number(data.synced) || 0) + (Number(data.modsSynced) || 0),
      skipped: [
        ...(Array.isArray(data.skipped) ? data.skipped : []),
        ...(Array.isArray(data.modsSkipped) ? data.modsSkipped : []),
      ],
      error: null,
    };
  } catch (err) {
    console.warn("Library batch sync error:", err?.message || err);
    return { synced: 0, skipped: [], error: err?.message || String(err) };
  }
}

async function validateLauncherToken(token) {
  try {
    const res = await fetch(`${getApiBase()}/api/library/token`, {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
        "user-agent": "playbound-launcher",
      },
    });
    if (res.status === 401) return { valid: false };
    if (!res.ok) return { valid: true }; // don't wipe token on transient errors
    const data = await res.json();
    return {
      valid: data.valid !== false,
      email: data.email || null,
      username: data.username || null,
    };
  } catch {
    return { valid: true };
  }
}

function clearLocalToken(message) {
  const settings = loadSettings();
  delete settings.launcherToken;
  saveSettings(settings);
  notifyAccount({
    connected: false,
    message: message || "Session expired — sign in again from Settings.",
  });
}

async function connectWithToken(token) {
  persistLauncherToken(token, { notify: false });
  const check = await validateLauncherToken(token);
  if (!check.valid) {
    clearLocalToken("Invalid session — sign in again from Settings.");
    return { connected: false, synced: 0, skipped: [], error: "unauthorized" };
  }
  const { synced, skipped, error } = await syncAllInstalledGames();
  if (error === "unauthorized") {
    clearLocalToken("Session rejected — sign in again from Settings.");
    return { connected: false, synced: 0, skipped: [], error };
  }
  lastLibrarySyncAt = Date.now();
  let message = CONNECTED_LIBRARY_MSG;
  if (synced > 0) {
    message = `${CONNECTED_LIBRARY_MSG} Synced ${synced} game${synced === 1 ? "" : "s"}.`;
  }
  if (skipped?.length) {
    message += ` Skipped ${skipped.length}: ${skipped.slice(0, 3).join(", ")}${skipped.length > 3 ? "…" : ""}.`;
  }
  if (error) {
    message = `Signed in, but sync had issues: ${error}`;
  }
  notifyAccount({
    connected: true,
    synced,
    skipped,
    message,
    email: check.email,
    username: check.username,
  });
  // Admins get testing titles once the bearer is present.
  void refreshRemoteCatalog();
  void pullCompatibilityPreference();
  return { connected: true, synced, skipped, error, email: check.email, username: check.username };
}

async function syncLibraryNow({ quiet = false } = {}) {
  const settings = loadSettings();
  const token = settings.launcherToken;
  if (!token) {
    if (!quiet) {
      notifyAccount({ connected: false, message: "Sign in to sync your library." });
    }
    return { connected: false };
  }

  const now = Date.now();
  if (quiet && now - lastLibrarySyncAt < LIBRARY_SYNC_COOLDOWN_MS) {
    return { connected: true, skippedDueToCooldown: true };
  }

  const check = await validateLauncherToken(token);
  if (!check.valid) {
    clearLocalToken("Saved session is no longer valid — sign in again from Settings.");
    return { connected: false, error: "unauthorized" };
  }

  if (!quiet) {
    notifyAccount({
      connected: true,
      message: "Syncing installs…",
      email: check.email,
      username: check.username,
    });
  }

  lastLibrarySyncAt = Date.now();
  const { synced, skipped, error } = await syncAllInstalledGames();
  if (error === "unauthorized") {
    clearLocalToken("Session rejected — sign in again from Settings.");
    return { connected: false, error };
  }

  let message = "Library sync complete.";
  if (synced > 0) {
    message = `Synced ${synced} installed game${synced === 1 ? "" : "s"} to your library.`;
  } else if (!error) {
    message = "Signed in — no local installs to sync yet.";
  }
  if (skipped?.length) {
    message += ` Skipped ${skipped.length}.`;
  }
  if (error) {
    message = `Library sync issue: ${error}`;
  }
  if (!quiet || synced > 0 || error || skipped?.length) {
    notifyAccount({
      connected: true,
      synced,
      skipped,
      message: quiet && !synced && !error && !skipped?.length ? undefined : message,
      email: check.email,
      username: check.username,
    });
  }
  return { connected: true, synced, skipped, error, email: check.email, username: check.username };
}

async function startupLibrarySync() {
  await syncLibraryNow({ quiet: false });
}

function scheduleLibrarySync() {
  if (librarySyncTimer) return;
  librarySyncTimer = setInterval(() => {
    void syncLibraryNow({ quiet: true });
  }, LIBRARY_SYNC_INTERVAL_MS);
}

function extractLinkToken(url) {
  try {
    const parsed = parseDeepLink(url);
    if (parsed?.action === "link" && parsed.token) return parsed.token;
  } catch {
    /* ignore */
  }
  return null;
}

function openAuthWindow() {
  const authUrl = `${getApiBase()}/launcher/auth?from=app`;
  try {
    if (authWin && !authWin.isDestroyed()) {
      authWin.focus();
      void authWin.loadURL(authUrl);
      return;
    }
    authWin = new BrowserWindow({
      width: 520,
      height: 740,
      parent: win && !win.isDestroyed() ? win : undefined,
      modal: false,
      title: "Sign in to PlayBound",
      autoHideMenuBar: true,
      backgroundColor: "#0c0a12",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    const handleUrl = (url) => {
      const token = extractLinkToken(url);
      if (!token) return false;
      void connectWithToken(token).finally(() => {
        if (authWin && !authWin.isDestroyed()) authWin.close();
      });
      return true;
    };

    authWin.webContents.on("will-navigate", (e, url) => {
      if (handleUrl(url)) e.preventDefault();
    });
    authWin.webContents.on("will-redirect", (e, url) => {
      if (handleUrl(url)) e.preventDefault();
    });
    authWin.webContents.on("did-fail-load", (_e, _code, _desc, validatedURL) => {
      handleUrl(validatedURL);
    });
    authWin.on("closed", () => {
      authWin = null;
    });
    void authWin.loadURL(authUrl);
  } catch (err) {
    console.warn("Auth window failed, opening system browser:", err?.message || err);
    void shell.openExternal(authUrl);
  }
}

/** @deprecated name kept for call sites — opens in-app auth window */
function openAuthInBrowser() {
  openAuthWindow();
}

async function handleSyncDeepLink() {
  showMainWindow();
  context = null;
  pushContext();
  await syncLibraryNow({ quiet: false });
}

function handleDeepLink(parsed) {
  if (!parsed) return;
  if (parsed.action === "auth") {
    openAuthWindow();
    return;
  }
  if (parsed.action === "sync") {
    void handleSyncDeepLink();
    return;
  }
  if (parsed.action === "link") {
    showMainWindow();
    if (parsed.token) {
      void connectWithToken(parsed.token);
    }
    return;
  }
  if (parsed.action === "play-mod" && parsed.slug) {
    showMainWindow();
    void playMod(parsed.slug).catch((err) => {
      console.warn("play-mod failed:", err?.message || err);
      notifyAccount({
        connected: Boolean(loadSettings().launcherToken),
        message: err?.message || String(err),
      });
    });
    return;
  }
  if (parsed.action === "open-folder" && parsed.slug) {
    showMainWindow();
    void openGameFolder(parsed.slug).catch((err) => {
      console.warn("open-folder failed:", err?.message || err);
      notifyAccount({
        connected: Boolean(loadSettings().launcherToken),
        message: err?.message || String(err),
      });
    });
    return;
  }
  if (parsed.action === "open-folder-mod" && parsed.slug) {
    showMainWindow();
    void openModFolder(parsed.slug).catch((err) => {
      console.warn("open-folder-mod failed:", err?.message || err);
      notifyAccount({
        connected: Boolean(loadSettings().launcherToken),
        message: err?.message || String(err),
      });
    });
    return;
  }
  if (parsed.action === "uninstall" && parsed.slug) {
    showMainWindow();
    void confirmAndUninstallGame(parsed.slug).catch((err) => {
      console.warn("uninstall failed:", err?.message || err);
      notifyAccount({
        connected: Boolean(loadSettings().launcherToken),
        message: err?.message || String(err),
      });
    });
    return;
  }
  if (parsed.action === "uninstall-mod" && parsed.slug) {
    showMainWindow();
    void confirmAndUninstallMod(parsed.slug).catch((err) => {
      console.warn("uninstall-mod failed:", err?.message || err);
      notifyAccount({
        connected: Boolean(loadSettings().launcherToken),
        message: err?.message || String(err),
      });
    });
    return;
  }
  if (parsed.action === "locate" && parsed.slug) {
    showMainWindow();
    void (async () => {
      try {
        await ensureCatalogEntry(parsed.slug);
        const res = await locateGameExecutable(parsed.slug);
        if (res?.status === "cancelled") {
          notifyAccount({
            connected: Boolean(loadSettings().launcherToken),
            message: "Locate cancelled.",
          });
          return;
        }
        notifyAccount({
          connected: Boolean(loadSettings().launcherToken),
          message: "Install located — added to library.",
        });
      } catch (err) {
        console.warn("locate failed:", err?.message || err);
        notifyAccount({
          connected: Boolean(loadSettings().launcherToken),
          message: err?.message || String(err),
        });
      }
    })();
    return;
  }
  void setContext(parsed);
}

async function setContext(parsed) {
  context = parsed;
  if (parsed?.slug && ["install", "play", "join", "uninstall"].includes(parsed.action)) {
    await ensureCatalogEntry(parsed.slug);
  }
  pushContext();
  if (parsed?.action === "install-mod" && parsed.slug && !parsed.mod && !parsed.modError) {
    void loadModIntoContext(parsed.slug);
  }
}

function pushContext() {
  if (win && !win.isDestroyed() && !win.webContents.isLoading()) {
    win.webContents.send("context", buildContextPayload());
  }
}

async function fetchModInstall(slug) {
  const res = await fetch(`${getApiBase()}/api/mods/${encodeURIComponent(slug)}`, {
    headers: { "user-agent": "playbound-launcher", accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Couldn't load mod (${res.status})`);
  const data = await res.json();
  if (!data?.install) throw new Error("Invalid mod response");
  return data.install;
}

async function loadModIntoContext(slug) {
  try {
    const install = await fetchModInstall(slug);
    if (install.baseGameSlug) {
      await ensureCatalogEntry(install.baseGameSlug);
    }
    if (context?.action === "install-mod" && context.slug === slug) {
      context = { ...context, mod: install, modError: null };
      pushContext();
    }
  } catch (err) {
    if (context?.action === "install-mod" && context.slug === slug) {
      context = { ...context, mod: null, modError: err.message || String(err) };
      pushContext();
    }
  }
}

/* ── install state ─────────────────────────────────────────── */

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveSettings(settings) {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

function getApiBase() {
  const settings = loadSettings();
  return String(settings.apiBase || process.env.PLAYBOUND_API_BASE || DEFAULT_API_BASE).replace(/\/$/, "");
}

/**
 * Main-process analytics. Declared after its dependencies exist because the
 * helpers are injected rather than imported — see telemetry.js.
 */
const telemetry = createTelemetry({
  getApiBase,
  loadSettings,
  saveSettings,
  getAppVersion: () => app.getVersion(),
  getUserId: () => {
    try {
      return loadSettings().userId || null;
    } catch {
      return null;
    }
  },
});

/**
 * Identity for an edition event, derived from the catalog entry / install state.
 */
function editionInfoFor(slug, extra = {}) {
  const entry = catalog.find((e) => e.slug === slug);
  let stateMeta = {};
  try {
    stateMeta = loadState()[slug] || {};
  } catch {
    stateMeta = {};
  }
  return {
    gameSlug: slug,
    gameTitle: entry?.title,
    editionSlug:
      extra.editionSlug || stateMeta.editionSlug || entry?.editionSlug || "official",
    editionName:
      extra.editionName || stateMeta.editionName || entry?.editionName || "Official",
    editionType: extra.editionType || stateMeta.editionType || entry?.editionType || "official",
    ...extra,
  };
}

async function pullCompatibilityPreference() {
  const settings = loadSettings();
  if (!settings.launcherToken) return;
  try {
    const res = await fetch(`${getApiBase()}/api/auth/preferences`, {
      headers: launcherApiHeaders(),
    });
    if (!res.ok) return;
    const data = await res.json();
    const mode = data?.preferences?.compatibilityFilter;
    if (mode === "compatible" || mode === "all") {
      settings.compatibilityFilter = mode;
      saveSettings(settings);
    }
  } catch {
    /* offline */
  }
}

async function pushCompatibilityPreference(mode) {
  const settings = loadSettings();
  if (!settings.launcherToken) return;
  try {
    await fetch(`${getApiBase()}/api/auth/preferences`, {
      method: "PATCH",
      headers: launcherApiHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ compatibilityFilter: mode }),
    });
  } catch {
    /* offline */
  }
}

async function fetchLauncherEditions(gameSlug) {
  const qs = gameSlug ? `?game=${encodeURIComponent(gameSlug)}` : "";
  const res = await fetch(`${getApiBase()}/api/launcher/editions${qs}`, {
    headers: launcherApiHeaders(),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data.editions) ? data.editions : [];
}

/** Map a launcher edition row onto the catalog entry shape installGame understands. */
function catalogEntryFromEdition(edition) {
  if (!edition?.gameSlug) return null;
  const cfg = edition.installConfig?.playbound_installer;
  if (cfg?.kind) {
    return {
      slug: edition.gameSlug,
      title: edition.gameTitle || edition.editionName || edition.gameSlug,
      blurb: edition.shortDescription || "",
      kind: cfg.kind,
      repo: cfg.repo || undefined,
      assetPattern: cfg.assetPattern || undefined,
      exeHint: cfg.exeHint || undefined,
      url: cfg.url || undefined,
      fileName: cfg.fileName || undefined,
      versionLabel: cfg.versionLabel || undefined,
      knownExePaths: Array.isArray(cfg.knownExePaths) ? cfg.knownExePaths : undefined,
      installRoot: cfg.installRoot || undefined,
      connectArgs: Array.isArray(cfg.connectArgs) ? cfg.connectArgs : undefined,
      note: cfg.note || undefined,
      art: Array.isArray(edition.art) ? edition.art : ["#312e81", "#a78bfa"],
      coverImage: edition.coverImage || null,
      approxSize: edition.sizeMB ? `~${edition.sizeMB} MB` : "",
      editionSlug: edition.editionSlug,
      editionName: edition.editionName,
      editionType: edition.editionType || "official",
      editionId: edition.editionId,
    };
  }
  return null;
}

async function resolveEditionForInstall(gameSlug, editionSlug) {
  const editions = await fetchLauncherEditions(gameSlug);
  if (!editions.length) return null;
  if (editionSlug) {
    return editions.find((e) => e.editionSlug === editionSlug) || null;
  }
  return editions.find((e) => e.isDefault) || editions[0] || null;
}

/** Turn relative site media paths into absolute URLs the Electron renderer can load. */
function resolveMediaUrl(pathOrUrl) {
  if (!pathOrUrl) return null;
  const s = String(pathOrUrl).trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s) || s.startsWith("data:")) return s;
  if (s.startsWith("//")) return `https:${s}`;
  const base = getApiBase();
  return s.startsWith("/") ? `${base}${s}` : `${base}/${s}`;
}

function launcherApiHeaders(extra = {}) {
  const settings = loadSettings();
  const headers = {
    "user-agent": "playbound-launcher",
    accept: "application/json",
    ...extra,
  };
  if (settings.launcherToken) {
    headers.authorization = `Bearer ${settings.launcherToken}`;
  }
  return headers;
}

async function refreshRemoteCatalog() {
  try {
    const res = await fetch(`${getApiBase()}/api/launcher/catalog`, {
      headers: launcherApiHeaders(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const remote = Array.isArray(data.games) ? data.games : [];
    if (remote.length === 0) return;
    const bySlug = new Map(bundledCatalog.map((e) => [e.slug, { ...e }]));
    for (const entry of remote) {
      if (!entry?.slug) continue;
      bySlug.set(entry.slug, { ...(bySlug.get(entry.slug) || {}), ...entry });
    }
    catalog = [...bySlug.values()];
    console.log(`Remote catalog: ${remote.length} game(s) merged (${catalog.length} total).`);
  } catch (err) {
    console.warn("Remote catalog refresh failed:", err.message || err);
  }
}

async function ensureCatalogEntry(slug) {
  const existing = catalog.find((e) => e.slug === slug);
  if (existing) return existing;
  try {
    const res = await fetch(`${getApiBase()}/api/games/${encodeURIComponent(slug)}/install`, {
      headers: launcherApiHeaders(),
    });
    if (!res.ok) return null;
    const entry = await res.json();
    if (!entry?.slug) return null;
    catalog = [...catalog.filter((e) => e.slug !== entry.slug), entry];
    return entry;
  } catch (err) {
    console.warn(`ensureCatalogEntry(${slug}) failed:`, err.message || err);
    return null;
  }
}

/** Fire-and-forget library sync. Never throws to callers. */
async function syncLibrary(slug, action, version, opts = {}) {
  const settings = loadSettings();
  const token = settings.launcherToken;
  if (!token) return;
  try {
    const body =
      opts.kind === "mod"
        ? {
            kind: "mod",
            slug,
            baseGameSlug: opts.baseGameSlug,
            action,
            version,
          }
        : { slug, action, version };
    const res = await fetch(`${getApiBase()}/api/library/sync`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        "user-agent": "playbound-launcher",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn(`Library sync ${action} failed: HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn("Library sync error:", err?.message || err);
  }
}

function buildContextPayload() {
  if (!context) return null;

  if (context.action === "install-mod") {
    const state = loadState();
    const baseSlug = context.mod?.baseGameSlug || null;
    const base = baseSlug ? state[baseSlug] : null;
    const basePath = base?.dir && fs.existsSync(base.dir) ? base.dir : null;
    const baseEntry = baseSlug ? catalog.find((e) => e.slug === baseSlug) : null;
    const modInstalled = Boolean(state.__mods__?.[context.slug]);
    return {
      action: "install-mod",
      slug: context.slug,
      entry: context.mod
        ? {
            slug: context.mod.slug,
            title: context.mod.title,
            blurb: `Mod for ${context.mod.baseGameSlug}`,
            kind: context.mod.downloadKind,
            art: context.mod.art || ["#312e81", "#a78bfa"],
            approxSize: context.mod.approxSize || "",
          }
        : null,
      mod: context.mod || null,
      modError: context.modError || null,
      baseGameSlug: baseSlug,
      baseInstalled: Boolean(basePath),
      basePath,
      baseInCatalog: Boolean(baseEntry),
      installed: modInstalled,
      installedPath: modInstalled ? state.__mods__[context.slug].dir : null,
      defaultDir: baseSlug ? path.join(DEFAULT_GAMES_DIR, baseSlug) : null,
      join: null,
    };
  }

  const entry = catalog.find((e) => e.slug === context.slug);
  if (!entry) return { action: context.action, slug: context.slug, entry: null };
  const state = loadState();
  const installed = state[entry.slug];
  return {
    action: context.action,
    slug: entry.slug,
    entry,
    editionSlug: context.editionSlug || null,
    installed: Boolean(installed),
    installedPath: installed?.dir ?? null,
    defaultDir: path.join(DEFAULT_GAMES_DIR, entry.slug),
    join: context.action === "join"
      ? { host: context.host || "", port: context.port || 0, name: context.name || "" }
      : null,
  };
}

/* ── release resolution ────────────────────────────────────── */

async function resolveDownload(entry) {
  if (entry.kind === "direct-zip" || entry.kind === "direct-installer" || entry.kind === "direct-exe") {
    let name = entry.fileName || path.basename(new URL(entry.url).pathname) || `${entry.slug}.bin`;
    if (name === "download" || !name.includes(".")) {
      const parts = new URL(entry.url).pathname.split("/").filter(Boolean);
      const fromPath = parts.find((p) => /\.(exe|zip|msi)$/i.test(p));
      name = entry.fileName || fromPath || `${entry.slug}.exe`;
    }
    return { url: entry.url, name, version: entry.versionLabel || "fixed" };
  }

  if (entry.kind === "openttd-zip") {
    const res = await fetch("https://cdn.openttd.org/openttd-releases/latest.yaml", {
      headers: { "user-agent": "playbound-launcher" },
    });
    if (!res.ok) throw new Error(`OpenTTD CDN ${res.status}`);
    const yaml = await res.text();
    const blocks = yaml.split(/\n-\s+/);
    let version = null;
    for (const block of blocks) {
      if (!/\bname:\s*stable\b/i.test(block)) continue;
      const m = block.match(/version:\s*([^\s]+)/i);
      if (m) {
        version = m[1].trim();
        break;
      }
    }
    if (!version) throw new Error("Could not parse OpenTTD stable version from latest.yaml");
    const name = `openttd-${version}-windows-win64.zip`;
    return {
      url: `https://cdn.openttd.org/openttd-releases/${version}/${name}`,
      name,
      version,
    };
  }

  const res = await fetch(`https://api.github.com/repos/${entry.repo}/releases/latest`, {
    headers: { "user-agent": "playbound-launcher", accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${entry.repo}`);
  const release = await res.json();
  const pattern = new RegExp(entry.assetPattern, "i");
  const asset = (release.assets || []).find((a) => pattern.test(a.name));
  if (!asset) throw new Error(`No asset matching /${entry.assetPattern}/ in ${entry.repo} ${release.tag_name}`);
  return { url: asset.browser_download_url, name: asset.name, version: release.tag_name, size: asset.size };
}

async function resolveModDownload(install) {
  if (install.downloadKind === "direct-zip") {
    if (!install.url) throw new Error("Mod has no direct download URL");
    let name = path.basename(new URL(install.url).pathname) || "mod.zip";
    // ContentDB and similar end with /download/
    if (!/\.(zip|jar)$/i.test(name) || /^download$/i.test(name)) {
      name = `${install.slug || "mod"}.zip`;
    }
    return { url: install.url, name, version: install.versionLabel || "fixed" };
  }
  if (install.downloadKind !== "github-zip") {
    throw new Error(`Unsupported mod download kind: ${install.downloadKind}`);
  }
  if (!install.repo) throw new Error("Mod is missing a GitHub repo");

  const ghHeaders = { "user-agent": "playbound-launcher", accept: "application/vnd.github+json" };
  const res = await fetch(`https://api.github.com/repos/${install.repo}/releases/latest`, {
    headers: ghHeaders,
  });
  if (res.ok) {
    const release = await res.json();
    const pattern = new RegExp(install.assetPattern || "\\.zip$", "i");
    const asset = (release.assets || []).find((a) => pattern.test(a.name));
    if (asset) {
      return { url: asset.browser_download_url, name: asset.name, version: release.tag_name, size: asset.size };
    }
  }

  // No matching release asset — fall back to default-branch source archive.
  const repoRes = await fetch(`https://api.github.com/repos/${install.repo}`, { headers: ghHeaders });
  if (!repoRes.ok) throw new Error(`GitHub API ${repoRes.status} for ${install.repo}`);
  const repo = await repoRes.json();
  const branch = repo.default_branch || "master";
  const shortName = String(install.repo).split("/").pop() || "mod";
  return {
    url: `https://github.com/${install.repo}/archive/refs/heads/${encodeURIComponent(branch)}.zip`,
    name: `${shortName}-${branch}.zip`,
    version: branch,
  };
}

/* ── download with progress ────────────────────────────────── */

function sendProgress(payload) {
  if (win && !win.isDestroyed()) win.webContents.send("progress", payload);
}

async function downloadTo(url, dest, attempts = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": "playbound-launcher" } });
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }
      const total = Number(res.headers.get("content-length")) || 0;
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      const file = fs.createWriteStream(dest);
      const reader = res.body.getReader();
      let received = 0;
      let lastSent = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.length;
        if (!file.write(Buffer.from(value))) {
          await new Promise((r) => file.once("drain", r));
        }
        const now = Date.now();
        if (now - lastSent > 250) {
          lastSent = now;
          sendProgress({ phase: "downloading", received, total });
        }
      }
      await new Promise((r, j) => file.end((err) => (err ? j(err) : r())));
      sendProgress({ phase: "downloading", received, total: total || received });
      return;
    } catch (err) {
      lastErr = err;
      const cause = err && typeof err === "object" ? err.cause : null;
      const detail =
        (cause && (cause.code || cause.message)) ||
        (err instanceof Error ? err.message : String(err));
      console.warn(`[download] attempt ${attempt}/${attempts} failed: ${detail}`);
      try {
        await fsp.rm(dest, { force: true });
      } catch {
        /* ignore */
      }
      if (attempt < attempts) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
        continue;
      }
      throw new Error(`Download failed (${detail})`);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function reportInstall(slug) {
  try {
    const base = getApiBase();
    await fetch(`${base}/api/games/${encodeURIComponent(slug)}/install/report`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "user-agent": "playbound-launcher",
      },
      signal: AbortSignal.timeout(8_000),
    });
  } catch (err) {
    console.warn("[install] report failed:", err instanceof Error ? err.message : err);
  }
}

function extractZip(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    const ps = spawn("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destDir}' -Force`,
    ]);
    let err = "";
    ps.stderr.on("data", (d) => (err += d));
    ps.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`Extract failed: ${err || code}`))));
  });
}

/* ── executable discovery ──────────────────────────────────── */

function findExecutable(dir, exeHint) {
  const exes = [];
  const skip = /unins|setup|install|crash|report|vcredist|dxsetup|server/i;
  const walk = (d) => {
    for (const name of fs.readdirSync(d)) {
      const full = path.join(d, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (name.toLowerCase().endsWith(".exe") && !skip.test(name)) {
        exes.push({ full, name, size: stat.size });
      }
    }
  };
  walk(dir);
  if (exes.length === 0) return null;
  if (exeHint) {
    const hint = new RegExp(exeHint, "i");
    const hinted = exes.filter((e) => hint.test(e.name));
    if (hinted.length > 0) return hinted.sort((a, b) => b.size - a.size)[0].full;
  }
  return exes.sort((a, b) => b.size - a.size)[0].full;
}

function expandWinPath(p) {
  return String(p || "")
    .replace(/%LOCALAPPDATA%/gi, process.env.LOCALAPPDATA || "")
    .replace(/%APPDATA%/gi, process.env.APPDATA || "")
    .replace(/%PROGRAMFILES%/gi, process.env.PROGRAMFILES || "")
    .replace(/%PROGRAMFILES\(X86\)%/gi, process.env["ProgramFiles(x86)"] || "")
    .replace(/%USERPROFILE%/gi, process.env.USERPROFILE || "");
}

function stripRegQuotes(value) {
  let v = String(value || "").trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  // DisplayIcon often ends with ,0
  v = v.replace(/,\d+$/, "");
  return v.trim();
}

/** Cache registry lookups briefly so installer polls don't spawn PowerShell every tick. */
const uninstallExeCache = new Map();

function findExeFromUninstallRegistry(entry) {
  if (process.platform !== "win32" || !entry) return null;
  const titles = [
    String(entry.title || "").trim(),
    ...((entry.registryTitles || []).map((t) => String(t || "").trim())),
  ].filter(Boolean);
  // Deduplicate case-insensitively while preserving order.
  const seenTitles = new Set();
  const titleList = titles.filter((t) => {
    const k = t.toLowerCase();
    if (seenTitles.has(k)) return false;
    seenTitles.add(k);
    return true;
  });
  const knownBases = (entry.knownExePaths || [])
    .map((p) => path.basename(expandWinPath(p)).toLowerCase())
    .filter(Boolean);
  const cacheKey = titleList.join("|") || knownBases.join("|") || entry.slug || "unknown";
  if (titleList.length === 0 && knownBases.length === 0) return null;

  const cached = uninstallExeCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 5_000) return cached.exe;

  let exe = null;
  try {
    const ps = `
$ErrorActionPreference = 'SilentlyContinue'
$titles = @(${titleList.map((t) => JSON.stringify(t)).join(",")})
$bases = @(${knownBases.map((b) => JSON.stringify(b)).join(",")})
$paths = @(
  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
)
$items = Get-ItemProperty $paths | Where-Object { $_.DisplayName -or $_.DisplayIcon -or $_.InstallLocation }
$hit = $null
foreach ($title in $titles) {
  if (-not $title) { continue }
  $hit = $items |
    Where-Object { $_.DisplayName -and ($_.DisplayName -eq $title -or $_.DisplayName -like ($title + '*')) } |
    Select-Object -First 1 DisplayName, InstallLocation, DisplayIcon
  if ($hit) { break }
}
if (-not $hit -and $bases.Count -gt 0) {
  $hit = $items | Where-Object {
    $icon = [string]$_.DisplayIcon
    $loc = [string]$_.InstallLocation
    foreach ($b in $bases) {
      if ($icon -and ($icon.ToLower().Contains($b))) { return $true }
      if ($loc -and (Test-Path (Join-Path $loc $b))) { return $true }
    }
    $false
  } | Select-Object -First 1 DisplayName, InstallLocation, DisplayIcon
}
if (-not $hit) { return }
@{
  DisplayName = $hit.DisplayName
  InstallLocation = $hit.InstallLocation
  DisplayIcon = $hit.DisplayIcon
} | ConvertTo-Json -Compress
`;
    const out = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", ps],
      { encoding: "utf8", timeout: 10_000, windowsHide: true, maxBuffer: 1024 * 1024 }
    ).trim();
    if (out) {
      const hit = JSON.parse(out);
      const icon = stripRegQuotes(hit.DisplayIcon);
      if (icon && /\.exe$/i.test(icon) && fs.existsSync(icon)) {
        exe = icon;
      } else {
        const root = stripRegQuotes(hit.InstallLocation);
        if (root && fs.existsSync(root)) {
          const candidates = [];
          if (entry.exeHint) candidates.push(path.join(root, entry.exeHint));
          candidates.push(path.join(root, "binaries", "system", "pyrogenesis.exe"));
          for (const raw of entry.knownExePaths || []) {
            const base = path.basename(expandWinPath(raw));
            if (base) candidates.push(path.join(root, base), path.join(root, "binaries", "system", base));
          }
          for (const c of candidates) {
            if (c && fs.existsSync(c)) {
              exe = c;
              break;
            }
          }
          if (!exe) {
            const want = new Set(
              [
                entry.exeHint && path.basename(entry.exeHint),
                ...(entry.knownExePaths || []).map((p) => path.basename(expandWinPath(p))),
              ]
                .filter(Boolean)
                .map((n) => n.toLowerCase())
            );
            const walk = (dir, depth) => {
              if (exe || depth > 4) return;
              let entries;
              try {
                entries = fs.readdirSync(dir, { withFileTypes: true });
              } catch {
                return;
              }
              for (const ent of entries) {
                if (exe) break;
                const full = path.join(dir, ent.name);
                if (ent.isDirectory()) walk(full, depth + 1);
                else if (ent.isFile() && want.has(ent.name.toLowerCase())) exe = full;
              }
            };
            if (want.size) walk(root, 0);
          }
        }
      }
    }
  } catch (err) {
    console.warn("[install] uninstall registry lookup failed:", err instanceof Error ? err.message : err);
  }

  uninstallExeCache.set(cacheKey, { at: Date.now(), exe });
  return exe;
}

/**
 * Look under Settings → games directory (and gamesDir/<slug>) for expected exe names.
 * Prefer this before full-drive BFS so PlayBound-managed installs are found quickly.
 * @param {object} entry
 * @returns {string | null}
 */
function findExeUnderGamesDir(entry) {
  const settings = loadSettings();
  const gamesDir = settings.gamesDir || DEFAULT_GAMES_DIR;
  if (!gamesDir || !fs.existsSync(gamesDir)) return null;
  const want = new Set(expectedExeBasenames(entry).map((b) => b.toLowerCase()));
  if (!want.size) return null;

  const roots = [gamesDir];
  if (entry?.slug) {
    const slugDir = path.join(gamesDir, entry.slug);
    if (fs.existsSync(slugDir)) roots.unshift(slugDir);
  }

  const maxDepth = 5;
  const queue = roots.map((r) => ({ dir: r, depth: 0 }));
  const seen = new Set();

  while (queue.length) {
    const { dir, depth } = queue.shift();
    const key = dir.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isFile() && want.has(ent.name.toLowerCase())) return full;
      if (ent.isDirectory() && depth < maxDepth && !shouldSkipScanDir(ent.name)) {
        queue.push({ dir: full, depth: depth + 1 });
      }
    }
  }
  return null;
}

function findKnownExecutable(entry) {
  for (const raw of entry.knownExePaths || []) {
    const full = expandWinPath(raw);
    if (full && fs.existsSync(full)) return full;
  }
  const underGames = findExeUnderGamesDir(entry);
  if (underGames) return underGames;
  return findExeFromUninstallRegistry(entry);
}

/** Game/content root for mods — prefer installRoot, else walk up from binaries/system. */
function resolveInstallDir(entry, exePath) {
  if (entry?.installRoot) {
    const root = expandWinPath(entry.installRoot);
    if (root && fs.existsSync(root)) return root;
  }
  const dir = path.dirname(exePath);
  if (/binaries[/\\]system$/i.test(dir)) {
    return path.resolve(dir, "..", "..");
  }
  return dir;
}

function notifyInstallDetected(slug) {
  if (win && !win.isDestroyed()) {
    win.webContents.send("install-detected", { slug });
  }
  if (
    context?.slug === slug ||
    context?.mod?.baseGameSlug === slug ||
    (context?.action === "install-mod" && context?.baseGameSlug === slug)
  ) {
    pushContext();
  }
  void maybeResumePendingMod(slug);
}

function markInstalledFromExe(slug, entry, exe, version) {
  const dir = resolveInstallDir(entry, exe);
  markInstalled(slug, {
    version,
    exe,
    dir,
    editionSlug: entry?.editionSlug,
    editionName: entry?.editionName,
    editionType: entry?.editionType,
  });
  notifyInstallDetected(slug);
  sendProgress({ phase: "done" });
  return { status: "installed", version, exe, dir };
}

function stopInstallerPoll() {
  if (installerPollTimer) {
    clearInterval(installerPollTimer);
    installerPollTimer = null;
    installerPollSlug = null;
  }
  if (exeScanDelayTimer) {
    clearTimeout(exeScanDelayTimer);
    exeScanDelayTimer = null;
  }
}

const INSTALLER_KNOWN_PATH_GRACE_MS = 50_000;

function startInstallerPoll(slug, entry, version) {
  stopInstallerPoll();
  stopExeScan(slug);
  installerPollSlug = slug;
  markPendingInstall(slug, version);

  const started = Date.now();
  const maxMs = 10 * 60 * 1000;

  const tryKnownPath = () => {
    invalidateUninstallCache(entry);
    const known = findKnownExecutable(entry);
    if (!known) return false;
    stopInstallerPoll();
    stopExeScan(slug);
    markInstalledFromExe(slug, entry, known, version || "located");
    return true;
  };

  // Immediate known-path check (installer may already be done / re-run).
  if (tryKnownPath()) return;

  if (win && !win.isDestroyed()) {
    win.webContents.send("install-scan", {
      slug,
      phase: "waiting",
      message: `Waiting for ${entry.title || slug} install to finish…`,
    });
  }

  installerPollTimer = setInterval(() => {
    if (Date.now() - started > maxMs) {
      stopInstallerPoll();
      // Keep pending Library card; disk scan may still be running or needsLocate.
      return;
    }
    tryKnownPath();
  }, 3000);

  // Full-drive BFS is expensive and flashes the UI if it spams progress —
  // wait for the installer to typically finish writing under known paths first.
  exeScanDelayTimer = setTimeout(() => {
    exeScanDelayTimer = null;
    if (installerPollSlug !== slug) return;
    if (tryKnownPath()) return;
    void startExeScan(slug, entry, version);
  }, INSTALLER_KNOWN_PATH_GRACE_MS);
}

/** Resume watching pending installs after app restart. */
function resumePendingInstallerPoll() {
  const state = loadState();
  for (const [slug, info] of Object.entries(state)) {
    if (slug === "__mods__") continue;
    if (!info || typeof info !== "object") continue;
    if (info.exe && fs.existsSync(info.exe)) continue;
    if (!info.pending) continue;
    const entry = catalog.find((e) => e.slug === slug);
    if (!entry) continue;
    markPendingInstall(slug, info.version);
    startInstallerPoll(slug, entry, info.version);
  }
  const pending = getPendingInstaller();
  if (pending?.slug && !state[pending.slug]) {
    const entry = catalog.find((e) => e.slug === pending.slug);
    if (entry) {
      markPendingInstall(pending.slug, pending.version);
      startInstallerPoll(pending.slug, entry, pending.version);
    }
  }
}

/** One-shot: pick up games already installed via knownExePaths but missing from state. */
function scanKnownInstalls() {
  const state = loadState();
  let found = 0;
  for (const entry of catalog) {
    if (!entry?.slug || !entry.knownExePaths?.length) continue;
    const existing = state[entry.slug];
    if (existing?.exe && fs.existsSync(existing.exe)) continue;
    invalidateUninstallCache(entry);
    const known = findKnownExecutable(entry);
    if (!known) continue;
    markInstalled(entry.slug, {
      version: existing?.version || "detected",
      exe: known,
      dir: resolveInstallDir(entry, known),
    });
    found += 1;
  }
  if (found > 0 && win && !win.isDestroyed()) {
    win.webContents.send("install-detected", { slug: null, scanned: found });
  }
  return found;
}

function resolveModTargetDir(baseGameSlug, installRelativePath, baseDirOverride) {
  const appData = process.env.APPDATA || "";
  const home = process.env.USERPROFILE || app.getPath("home");
  const rel = String(installRelativePath || "mods").replace(/^[/\\]+|[/\\]+$/g, "") || "mods";
  const under = (root) => path.join(root, ...rel.split(/[/\\]+/));

  if (baseGameSlug === "mindustry") {
    return under(path.join(appData, "Mindustry"));
  }
  if (baseGameSlug === "0ad") {
    return under(path.join(home, "Documents", "My Games", "0ad"));
  }
  if (baseGameSlug === "openttd") {
    return under(path.join(appData, "OpenTTD"));
  }
  if (baseGameSlug === "endless-sky") {
    return under(path.join(appData, "endless-sky"));
  }
  if (baseGameSlug === "luanti" || baseGameSlug === "minetest") {
    const luantiRoot = path.join(appData, "Luanti");
    const minetestRoot = path.join(appData, "Minetest");
    const root = fs.existsSync(luantiRoot) ? luantiRoot : minetestRoot;
    return under(root);
  }
  if (baseGameSlug === "naev") {
    return under(path.join(appData, "naev"));
  }

  let baseDir = baseDirOverride || null;
  if (!baseDir) {
    const state = loadState();
    const info = state[baseGameSlug];
    if (info?.dir && fs.existsSync(info.dir)) baseDir = info.dir;
  }
  if (!baseDir) return null;
  return under(baseDir);
}

function modUsesUserDataFolder(baseGameSlug) {
  return ["mindustry", "0ad", "openttd", "endless-sky", "luanti", "minetest", "naev"].includes(
    baseGameSlug
  );
}

function isBaseGameReady(baseGameSlug) {
  const state = loadState();
  const info = state[baseGameSlug];
  return Boolean(info?.exe && fs.existsSync(info.exe));
}

async function maybeResumePendingMod(justInstalledBaseSlug) {
  const settings = loadSettings();
  const pending = settings.pendingModSlug;
  if (!pending) return;
  try {
    const install = await fetchModInstall(pending);
    if (justInstalledBaseSlug && install.baseGameSlug !== justInstalledBaseSlug) return;
    if (!isBaseGameReady(install.baseGameSlug) && !modUsesUserDataFolder(install.baseGameSlug)) {
      return;
    }
    delete settings.pendingModSlug;
    saveSettings(settings);
    context = { action: "install-mod", slug: pending, mod: install };
    pushContext();
    const result = await placeModFiles(pending, install, null);
    if (win && !win.isDestroyed()) {
      win.webContents.send("mod-install-finished", { slug: pending, result });
    }
    pushContext();
  } catch (err) {
    console.warn("Pending mod resume failed:", err?.message || err);
    if (win && !win.isDestroyed()) {
      win.webContents.send("mod-install-finished", {
        slug: pending,
        error: err?.message || String(err),
      });
    }
  }
}

function markInstalled(slug, { version, exe, dir, editionSlug, editionName, editionType }) {
  stopExeScan(slug);
  stopInstallerPoll();
  const state = loadState();
  const prev = state[slug] || {};
  state[slug] = {
    version,
    exe,
    dir,
    installedAt: new Date().toISOString(),
    editionSlug: editionSlug || prev.editionSlug || "official",
    editionName: editionName || prev.editionName || "Official",
    editionType: editionType || prev.editionType || "official",
  };
  saveState(state);
  clearPendingInstaller(slug);
  void syncLibrary(slug, "install", version);
}

/** Show the game in Library immediately while we look for the exe. */
function markPendingInstall(slug, version) {
  const state = loadState();
  const existing = state[slug];
  if (existing?.exe && fs.existsSync(existing.exe)) return existing;
  const alreadyPending = Boolean(existing?.pending);
  state[slug] = {
    pending: true,
    // Full-drive scan is delayed; known-path poll first.
    scanning: false,
    version: version || existing?.version || null,
    installedAt: existing?.installedAt || new Date().toISOString(),
  };
  saveState(state);
  setPendingInstaller(slug, version);
  // Skip redundant pending IPC — re-renders Library and causes flicker.
  if (!alreadyPending && win && !win.isDestroyed()) {
    win.webContents.send("install-scan", {
      slug,
      phase: "pending",
      message: `Waiting for ${slug} install to finish…`,
    });
  }
  return state[slug];
}

function setPendingScanning(slug, scanning) {
  const state = loadState();
  const info = state[slug];
  if (!info?.pending) return;
  info.scanning = Boolean(scanning);
  state[slug] = info;
  saveState(state);
  if (win && !win.isDestroyed()) {
    win.webContents.send("install-scan", {
      slug,
      phase: scanning ? "scanning" : "needs-locate",
    });
  }
}

function dismissPendingInstall(slug) {
  stopExeScan(slug);
  stopInstallerPoll();
  const state = loadState();
  const info = state[slug];
  if (info?.pending && !(info.exe && fs.existsSync(info.exe))) {
    delete state[slug];
    saveState(state);
  }
  clearPendingInstaller(slug);
  if (win && !win.isDestroyed()) {
    win.webContents.send("install-scan", { slug, phase: "dismissed" });
  }
  return { status: "dismissed" };
}

function expectedExeBasenames(entry) {
  const bases = new Set();
  for (const raw of entry?.knownExePaths || []) {
    const base = path.basename(expandWinPath(raw)).toLowerCase();
    if (base && /\.(exe|cmd|bat)$/i.test(base)) bases.add(base);
  }
  if (entry?.exeHint && !/[|\\/]/.test(entry.exeHint)) {
    const hint = String(entry.exeHint).toLowerCase();
    if (/\.(exe|cmd|bat)$/.test(hint)) bases.add(hint);
    else bases.add(`${hint}.exe`);
  }
  if (entry?.slug) {
    const slugExe = `${String(entry.slug).toLowerCase()}.exe`;
    // Skip slug.exe when known/hint names already point at a different launcher
    // binary (e.g. veloren → airshipper.exe).
    if (bases.size === 0 || bases.has(slugExe)) bases.add(slugExe);
  }
  return [...bases];
}

function listFixedDriveRoots() {
  if (process.platform !== "win32") {
    return [app.getPath("home"), path.parse(app.getPath("home")).root].filter(Boolean);
  }
  try {
    const out = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Get-CimInstance Win32_LogicalDisk -Filter \"DriveType=3\" | Select-Object -ExpandProperty DeviceID",
      ],
      { encoding: "utf8", timeout: 8_000, windowsHide: true }
    );
    return out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => /^[A-Z]:$/i.test(l))
      .map((l) => `${l}\\`);
  } catch {
    const homeRoot = path.parse(process.env.SYSTEMDRIVE || "C:").root;
    return [homeRoot || "C:\\"];
  }
}

const EXE_SCAN_SKIP_DIR = new Set(
  [
    "$recycle.bin",
    "system volume information",
    "windows",
    "windows.old",
    "programdata",
    "node_modules",
    ".git",
    ".svn",
    "temp",
    "tmp",
    "cache",
    "packages",
    "package cache",
    "microsoft",
    "windowsapps",
    "winsxs",
    "installer",
    "assemblies",
  ].map((s) => s.toLowerCase())
);

function shouldSkipScanDir(name) {
  const n = String(name || "").toLowerCase();
  if (!n || n.startsWith("$")) return true;
  if (EXE_SCAN_SKIP_DIR.has(n)) return true;
  if (n.endsWith(".tmp")) return true;
  return false;
}

function stopExeScan(slug) {
  if (exeScanDelayTimer) {
    clearTimeout(exeScanDelayTimer);
    exeScanDelayTimer = null;
  }
  if (!exeScanJob) return;
  if (slug != null && exeScanJob.slug !== slug) return;
  exeScanJob.abort = true;
  exeScanJob = null;
}

/**
 * Breadth-first search of fixed local drives for an expected exe basename.
 * Caps at ~8 minutes; leaves pending Library entry for manual locate.
 */
async function startExeScan(slug, entry, version) {
  // Always cancel any in-flight scan before starting another.
  if (exeScanJob) {
    exeScanJob.abort = true;
    exeScanJob = null;
  }
  const bases = expectedExeBasenames(entry);
  if (!bases.length) {
    setPendingScanning(slug, false);
    notifyInstallDetectFailed(slug);
    return;
  }
  const want = new Set(bases);
  const generation = ++exeScanGeneration;
  const job = { slug, abort: false, generation };
  exeScanJob = job;
  setPendingScanning(slug, true);
  if (win && !win.isDestroyed()) {
    win.webContents.send("install-scan", {
      slug,
      phase: "scanning",
      message: `Searching for ${entry.title || slug}…`,
    });
  }

  const roots = listFixedDriveRoots();
  const settings = loadSettings();
  const gamesDir = settings.gamesDir || DEFAULT_GAMES_DIR;
  /** Prefer games directory roots so managed installs are found before full-drive BFS. */
  const preferred = [];
  if (gamesDir && fs.existsSync(gamesDir)) {
    if (entry?.slug) {
      const slugDir = path.join(gamesDir, entry.slug);
      if (fs.existsSync(slugDir)) preferred.push(slugDir);
    }
    preferred.push(gamesDir);
  }
  const preferredSet = new Set(preferred.map((p) => p.toLowerCase()));
  const queue = [
    ...preferred,
    ...roots.filter((r) => !preferredSet.has(String(r).toLowerCase())),
  ];
  const started = Date.now();
  const maxMs = 8 * 60 * 1000;

  const tick = async () => {
    if (job.abort || exeScanJob !== job) return;
    if (Date.now() - started > maxMs) {
      if (exeScanJob === job) exeScanJob = null;
      setPendingScanning(slug, false);
      notifyInstallDetectFailed(slug);
      return;
    }
    const batch = 40;
    for (let i = 0; i < batch && queue.length; i++) {
      if (job.abort) return;
      const dir = queue.shift();
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const ent of entries) {
        if (job.abort) return;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          if (!shouldSkipScanDir(ent.name)) queue.push(full);
        } else if (ent.isFile() && want.has(ent.name.toLowerCase())) {
          if (exeScanJob === job) exeScanJob = null;
          stopInstallerPoll();
          markInstalledFromExe(slug, entry, full, version || "scanned");
          return;
        }
      }
    }
    // No per-batch progress IPC — rebuilds the renderer and causes flicker.
    if (!queue.length) {
      if (exeScanJob === job) exeScanJob = null;
      setPendingScanning(slug, false);
      notifyInstallDetectFailed(slug);
      return;
    }
    setImmediate(() => {
      void tick();
    });
  };

  invalidateUninstallCache(entry);
  const known = findKnownExecutable(entry);
  if (known) {
    if (exeScanJob === job) exeScanJob = null;
    stopInstallerPoll();
    markInstalledFromExe(slug, entry, known, version || "located");
    return;
  }
  setImmediate(() => {
    void tick();
  });
}

function setPendingInstaller(slug, version) {
  const settings = loadSettings();
  settings.pendingInstaller = {
    slug,
    version: version || null,
    startedAt: new Date().toISOString(),
  };
  saveSettings(settings);
}

function clearPendingInstaller(slug) {
  const settings = loadSettings();
  if (!settings.pendingInstaller) return;
  if (slug && settings.pendingInstaller.slug !== slug) return;
  delete settings.pendingInstaller;
  saveSettings(settings);
}

function getPendingInstaller() {
  const settings = loadSettings();
  const pending = settings.pendingInstaller;
  if (!pending?.slug) return null;
  return pending;
}

function invalidateUninstallCache(entry) {
  const title = String(entry?.title || "").trim();
  if (title) uninstallExeCache.delete(title);
  const knownBases = (entry?.knownExePaths || [])
    .map((p) => path.basename(expandWinPath(p)).toLowerCase())
    .filter(Boolean);
  const cacheKey = title || knownBases.join("|") || entry?.slug || "unknown";
  uninstallExeCache.delete(cacheKey);
}

function notifyInstallDetectFailed(slug) {
  if (win && !win.isDestroyed()) {
    win.webContents.send("install-detect-failed", { slug });
  }
}

async function writeJarLauncher(gameDir, jarName) {
  const cmdPath = path.join(gameDir, "play.cmd");
  const body = [
    "@echo off",
    `javaw -jar "%~dp0${jarName}" %*`,
    "if errorlevel 1 (",
    "  echo.",
    "  echo Java is required to run this game.",
    "  echo Install JDK 17+ from https://adoptium.net/ then try again.",
    "  pause",
    ")",
    "",
  ].join("\r\n");
  await fsp.writeFile(cmdPath, body, "utf8");
  return cmdPath;
}

/* ── core actions ──────────────────────────────────────────── */

async function installGame(slug, targetDir, editionSlug, selectedAddons) {
  let entry = (await ensureCatalogEntry(slug)) || catalog.find((e) => e.slug === slug);

  let editionMeta = null;
  try {
    editionMeta = await resolveEditionForInstall(slug, editionSlug || null);
  } catch (err) {
    console.warn("resolveEditionForInstall failed:", err?.message || err);
  }

  if (editionMeta) {
    const fromEdition = catalogEntryFromEdition(editionMeta);
    if (fromEdition) {
      entry = { ...(entry || {}), ...fromEdition };
    } else if (editionMeta.installMethod === "official_download") {
      const url =
        editionMeta.installConfig?.official_download?.url ||
        editionMeta.links?.website ||
        editionMeta.installAction?.href;
      if (url) {
        await shell.openExternal(url);
        return { status: "external", editionSlug: editionMeta.editionSlug };
      }
    } else if (editionMeta.installMethod === "external_installer") {
      const url = editionMeta.installConfig?.external_installer?.url || editionMeta.installAction?.href;
      if (url) {
        await shell.openExternal(url);
        return { status: "external", editionSlug: editionMeta.editionSlug };
      }
    } else if (editionMeta.installAction?.kind === "link" && editionMeta.installAction.href) {
      await shell.openExternal(editionMeta.installAction.href);
      return { status: "external", editionSlug: editionMeta.editionSlug };
    } else if (editionMeta.installAction?.kind === "browser" && editionMeta.installAction.href) {
      await shell.openExternal(editionMeta.installAction.href);
      return { status: "external", editionSlug: editionMeta.editionSlug };
    }
  }

  if (!entry) throw new Error(`Unknown game: ${slug}`);

  if (entry.kind === "external") {
    await shell.openExternal(entry.url);
    return { status: "external" };
  }

  const editionExtra = {
    editionSlug: entry.editionSlug || editionMeta?.editionSlug || "official",
    editionName: entry.editionName || editionMeta?.editionName || "Official",
    editionType: entry.editionType || editionMeta?.editionType || "official",
  };

  const gameDir = targetDir || path.join(DEFAULT_GAMES_DIR, entry.slug);

  sendProgress({ phase: "resolving" });
  const dl = await resolveDownload(entry);
  const downloadPath = path.join(app.getPath("temp"), "playbound-launcher", dl.name);
  await downloadTo(dl.url, downloadPath);

  if (entry.kind === "github-installer" || entry.kind === "direct-installer") {
    sendProgress({ phase: "installer-ready" });
    await shell.openPath(downloadPath);
    const known = findKnownExecutable(entry);
    if (known) {
      const result = markInstalledFromExe(slug, entry, known, dl.version);
      void reportInstall(slug);
      void telemetry.editionInstalled(editionInfoFor(slug, { version: dl?.version, ...editionExtra }));
      return result;
    }
    startInstallerPoll(slug, entry, dl.version);
    void reportInstall(slug);
    void telemetry.editionInstalled(editionInfoFor(slug, { version: dl?.version, ...editionExtra }));
    return { status: "installer-opened", version: dl.version };
  }

  if (entry.kind === "direct-exe") {
    sendProgress({ phase: "extracting" });
    await fsp.mkdir(gameDir, { recursive: true });
    const destName = dl.name.toLowerCase().endsWith(".exe") ? dl.name : `${entry.slug}.exe`;
    const exe = path.join(gameDir, destName);
    await fsp.copyFile(downloadPath, exe);
    await fsp.rm(downloadPath, { force: true });
    await processAddons(entry, gameDir, selectedAddons);
    markInstalled(slug, { version: dl.version, exe, dir: gameDir, ...editionExtra });
    sendProgress({ phase: "done" });
    void reportInstall(slug);
    void telemetry.editionInstalled(editionInfoFor(slug, { version: dl?.version, ...editionExtra }));
    return { status: "installed", version: dl.version, dir: gameDir };
  }

  if (entry.kind === "github-jar") {
    sendProgress({ phase: "extracting" });
    await fsp.mkdir(gameDir, { recursive: true });
    const jarPath = path.join(gameDir, dl.name);
    await fsp.copyFile(downloadPath, jarPath);
    await fsp.rm(downloadPath, { force: true });
    const exe = await writeJarLauncher(gameDir, dl.name);
    await processAddons(entry, gameDir, selectedAddons);
    markInstalled(slug, { version: dl.version, exe, dir: gameDir, ...editionExtra });
    sendProgress({ phase: "done" });
    void reportInstall(slug);
    void telemetry.editionInstalled(editionInfoFor(slug, { version: dl?.version, ...editionExtra }));
    return { status: "installed", version: dl.version, dir: gameDir };
  }

  sendProgress({ phase: "extracting" });
  await fsp.rm(gameDir, { recursive: true, force: true });
  await extractZip(downloadPath, gameDir);
  await fsp.rm(downloadPath, { force: true });

  const exe = findExecutable(gameDir, entry.exeHint);
  if (!exe) throw new Error("Extracted, but no executable found");

  await processAddons(entry, gameDir, selectedAddons);
  markInstalled(slug, { version: dl.version, exe, dir: gameDir, ...editionExtra });
  sendProgress({ phase: "done" });
  void reportInstall(slug);
  void telemetry.editionInstalled(editionInfoFor(slug, { version: dl?.version, ...editionExtra }));
  return { status: "installed", version: dl.version, dir: gameDir };
}

async function processAddons(entry, gameDir, selectedAddons) {
  if (!entry.addons || !Array.isArray(selectedAddons) || selectedAddons.length === 0) return;
  for (const addonId of selectedAddons) {
    const addon = entry.addons.find((a) => a.id === addonId);
    if (!addon) continue;
    sendProgress({ phase: "downloading", addon: addon.name });
    const dest = path.join(gameDir, addon.fileName);
    await downloadTo(addon.url, dest);
  }
}

async function locateGameExecutable(slug) {
  const entry = (await ensureCatalogEntry(slug)) || catalog.find((e) => e.slug === slug);
  if (!entry) throw new Error(`Unknown game: ${slug}`);

  const known = findKnownExecutable(entry);
  if (known) {
    return markInstalledFromExe(slug, entry, known, "located");
  }

  const result = await dialog.showOpenDialog(win, {
    title: `Locate ${entry.title} executable`,
    filters: [{ name: "Executables", extensions: ["exe", "cmd", "bat"] }],
    properties: ["openFile"],
  });
  if (result.canceled || result.filePaths.length === 0) return { status: "cancelled" };

  const exe = result.filePaths[0];
  return markInstalledFromExe(slug, entry, exe, "located");
}

async function placeModFiles(slug, install, baseDirOverride) {
  const dl = await resolveModDownload(install);
  let targetDir = resolveModTargetDir(install.baseGameSlug, install.installRelativePath, baseDirOverride);
  // Full portable clients (OpenRA-style) install beside other PlayBound games.
  const portable = /winportable/i.test(dl.name || "");
  if (portable) {
    targetDir = path.join(DEFAULT_GAMES_DIR, slug);
  }
  if (!targetDir) {
    throw new Error("Base game folder not found — install the game first or choose its folder.");
  }
  await fsp.mkdir(targetDir, { recursive: true });
  const downloadPath = path.join(app.getPath("temp"), "playbound-launcher", "mods", dl.name);
  await downloadTo(dl.url, downloadPath);

  /**
   * Files this mod replaced, and where the originals were parked.
   *
   * Some mods are not additive — a controller config, for example, overwrites
   * a file the game shipped. Without a copy of the original, uninstalling
   * would leave the game permanently modded. Recorded in state so uninstall
   * can put things back.
   *
   * Only the single-file path backs up today. Doing the same for archives
   * means enumerating the zip before extracting to learn which paths it will
   * clobber, which is a bigger change than any current mod needs — zip mods
   * behave exactly as they did before.
   */
  const backups = [];
  const written = [];

  /**
   * Decided by the file itself, not by downloadKind.
   *
   * downloadKind only offers github-zip / direct-zip / external, so a mod that
   * ships a single loose file — a controller config, say — had to be marked as
   * a zip kind and was then handed to Expand-Archive, which cannot extract a
   * non-archive and failed. Existing mods still route to extraction because
   * their assets really are .zip files; anything else is now copied into place.
   */
  const isZip = /\.zip$/i.test(dl.name);
  if (isZip && !/\.jar$/i.test(dl.name)) {
    sendProgress({ phase: "extracting" });
    await extractZip(downloadPath, targetDir);
  } else {
    sendProgress({ phase: "extracting" });
    const dest = path.join(targetDir, path.basename(dl.name));
    if (fs.existsSync(dest)) {
      const backupPath = `${dest}.playbound-backup`;
      // Never overwrite an existing backup: reinstalling the mod would
      // otherwise replace the pristine original with the modded copy.
      if (!fs.existsSync(backupPath)) {
        await fsp.copyFile(dest, backupPath);
      }
      backups.push({ path: dest, backup: backupPath });
    } else {
      // Nothing was there, so the mod added this file and uninstall should
      // take it away again.
      written.push(dest);
    }
    await fsp.copyFile(downloadPath, dest);
  }
  await fsp.rm(downloadPath, { force: true });

  const exe = findExecutable(targetDir, null);

  const state = loadState();
  if (!state.__mods__ || typeof state.__mods__ !== "object") state.__mods__ = {};
  state.__mods__[slug] = {
    title: install.title || slug,
    version: dl.version,
    dir: targetDir,
    baseGameSlug: install.baseGameSlug,
    installedAt: new Date().toISOString(),
    ...(exe ? { exe } : {}),
    ...(portable ? { portable: true } : {}),
    ...(backups.length > 0 ? { backups } : {}),
    ...(written.length > 0 ? { written } : {}),
  };
  saveState(state);
  void syncLibrary(slug, "install", dl.version, {
    kind: "mod",
    baseGameSlug: install.baseGameSlug,
  });
  sendProgress({ phase: "done" });
  return {
    status: "installed",
    version: dl.version,
    dir: targetDir,
    baseGameSlug: install.baseGameSlug,
    exe: exe || null,
    portable,
  };
}

async function installMod(slug, baseDirOverride) {
  sendProgress({ phase: "resolving" });
  const install = await fetchModInstall(slug);

  if (install.downloadKind === "external") {
    await shell.openExternal(install.url || `${getApiBase()}/mods/${slug}`);
    return { status: "external", url: install.url || null };
  }

  // OpenRA-style portable clients ship their own engine — no base game required.
  const portableAsset = /winportable/i.test(String(install.assetPattern || ""));
  if (portableAsset && !baseDirOverride) {
    return placeModFiles(slug, install, null);
  }

  const userDataMod = modUsesUserDataFolder(install.baseGameSlug);
  let targetDir = resolveModTargetDir(install.baseGameSlug, install.installRelativePath, baseDirOverride);
  const baseReady = isBaseGameReady(install.baseGameSlug) || Boolean(baseDirOverride && fs.existsSync(baseDirOverride));

  if (!targetDir || (!baseReady && !userDataMod && !baseDirOverride)) {
    const settings = loadSettings();
    settings.pendingModSlug = slug;
    saveSettings(settings);
    await ensureCatalogEntry(install.baseGameSlug);
    sendProgress({ phase: "installing-base" });
    const baseResult = await installGame(install.baseGameSlug);
    if (baseResult.status === "installed") {
      delete settings.pendingModSlug;
      saveSettings(settings);
      return placeModFiles(slug, install, null);
    }
    if (baseResult.status === "installer-opened") {
      return { status: "waiting-base", baseGameSlug: install.baseGameSlug };
    }
    throw new Error("Couldn't install the base game first.");
  }

  return placeModFiles(slug, install, baseDirOverride);
}

async function playGame(slug, join = null) {
  const state = loadState();
  const info = state[slug];
  if (!info || !fs.existsSync(info.exe)) throw new Error("Not installed");
  const entry = catalog.find((e) => e.slug === slug);
  const args = [];
  if (join?.host && join?.port && Array.isArray(entry?.connectArgs)) {
    for (const template of entry.connectArgs) {
      args.push(
        String(template)
          .replaceAll("{host}", join.host)
          .replaceAll("{port}", String(join.port))
          .replaceAll("{name}", join.name || "")
      );
    }
  }
  spawnTrackedExe(slug, info.exe, args);
  // Opens a play session; the matching sendGameExited() closes it with a real
  // duration rather than guessing one.
  void telemetry.editionLaunched(editionInfoFor(slug, { version: info.version }));

  // Track recently played
  const settings = loadSettings();
  if (!settings.recentlyPlayed) settings.recentlyPlayed = {};
  settings.recentlyPlayed[slug] = { lastPlayed: new Date().toISOString() };
  saveSettings(settings);

  return {
    status: "launched",
    connect: args.length > 0 ? `${join.host}:${join.port}` : null,
    manualConnect: Boolean(join?.host && join?.port && !entry?.connectArgs?.length),
  };
}

/** @type {Map<string, { child: import("child_process").ChildProcess, imageNames: string[], pollTimer: ReturnType<typeof setInterval> | null, settleTimer: ReturnType<typeof setTimeout> | null }>} */
const activeLaunches = new Map();
const GAME_EXIT_DEBOUNCE_MS = 3000;
const GAME_RUNNING_POLL_MS = 10000;

function sendGameExited(slug) {
  // Reported from here rather than the renderer so a session still closes when
  // the window is hidden to the tray or the game outlived the launcher UI.
  void telemetry.editionExited(editionInfoFor(slug));
  if (win && !win.isDestroyed()) {
    win.webContents.send("game-exited", { slug });
  }
}

function clearLaunchTracking(slug) {
  const launch = activeLaunches.get(slug);
  if (!launch) return;
  if (launch.settleTimer) clearTimeout(launch.settleTimer);
  if (launch.pollTimer) clearInterval(launch.pollTimer);
  activeLaunches.delete(slug);
}

function normalizeProcessImageName(name) {
  let base = path.basename(String(name || ""));
  if (!base) return "";
  if (process.platform === "win32" && !/\.[A-Za-z0-9]+$/.test(base)) {
    base = `${base}.exe`;
  }
  return base;
}

/** Extract simple process names from catalog exeHint (skip regex fragments). */
function hintProcessNames(exeHint) {
  if (!exeHint) return [];
  const out = [];
  for (const part of String(exeHint).split("|")) {
    const token = part.trim();
    if (/^[A-Za-z0-9_-]+$/.test(token)) {
      out.push(normalizeProcessImageName(token));
    }
  }
  return out;
}

function isAnyImageRunning(imageNames) {
  const names = (imageNames || []).filter(Boolean);
  if (!names.length) return false;

  if (process.platform === "win32") {
    for (const image of names) {
      try {
        const out = execFileSync(
          "tasklist",
          ["/FI", `IMAGENAME eq ${image}`, "/NH"],
          { encoding: "utf8", windowsHide: true, timeout: 5000 }
        );
        if (out.toLowerCase().includes(image.toLowerCase())) return true;
      } catch {
        // tasklist failed or no match
      }
    }
    return false;
  }

  for (const image of names) {
    const procName = image.replace(/\.exe$/i, "");
    try {
      execFileSync("pgrep", ["-x", procName], {
        encoding: "utf8",
        timeout: 5000,
        stdio: ["ignore", "pipe", "ignore"],
      });
      return true;
    } catch {
      // not running
    }
  }
  return false;
}

function onSpawnedProcessGone(slug) {
  const launch = activeLaunches.get(slug);
  if (!launch) return;
  if (launch.settleTimer) clearTimeout(launch.settleTimer);
  launch.settleTimer = setTimeout(() => {
    const current = activeLaunches.get(slug);
    if (!current) return;
    if (isAnyImageRunning(current.imageNames)) {
      if (current.pollTimer) clearInterval(current.pollTimer);
      current.pollTimer = setInterval(() => {
        if (!isAnyImageRunning(current.imageNames)) {
          clearLaunchTracking(slug);
          sendGameExited(slug);
        }
      }, GAME_RUNNING_POLL_MS);
    } else {
      clearLaunchTracking(slug);
      sendGameExited(slug);
    }
  }, GAME_EXIT_DEBOUNCE_MS);
}

/**
 * Spawn a game exe (detached so it can outlive the launcher) and watch for exit.
 * Handles short bootstrap processes (e.g. OpenRA.exe → RedAlert.exe) by polling
 * catalog exeHint image names after the child exits.
 */
function spawnTrackedExe(slug, exePath, args = []) {
  clearLaunchTracking(slug);

  const child = GameLauncher.spawnGame(exePath, args);

  const entry = catalog.find((e) => e.slug === slug);
  const imageNames = [
    ...new Set(
      [normalizeProcessImageName(exePath), ...hintProcessNames(entry?.exeHint)].filter(Boolean)
    ),
  ];

  activeLaunches.set(slug, {
    child,
    imageNames,
    pollTimer: null,
    settleTimer: null,
  });

  child.on("exit", () => onSpawnedProcessGone(slug));
  child.on("error", () => onSpawnedProcessGone(slug));
  return child;
}

/** Launch a catalog mod: portable clients use their own exe; content mods open the base game. */
async function playMod(slug) {
  const state = loadState();
  const mods = state.__mods__ && typeof state.__mods__ === "object" ? state.__mods__ : {};
  const info = mods[slug];
  if (!info || typeof info !== "object") throw new Error("Mod is not installed");

  let exe = info.exe && fs.existsSync(info.exe) ? info.exe : null;
  if (!exe && info.dir && fs.existsSync(info.dir)) {
    exe = findExecutable(info.dir, null);
    if (exe) {
      info.exe = exe;
      if (info.portable == null && /PlayBound[/\\]Games[/\\]/i.test(String(info.dir))) {
        info.portable = true;
      }
      mods[slug] = info;
      state.__mods__ = mods;
      saveState(state);
    }
  }

  if (exe) {
    spawnTrackedExe(slug, exe, []);
    const settings = loadSettings();
    if (!settings.recentlyPlayed) settings.recentlyPlayed = {};
    settings.recentlyPlayed[info.baseGameSlug || slug] = { lastPlayed: new Date().toISOString() };
    saveSettings(settings);
    return { status: "launched", portable: true, exe, baseGameSlug: info.baseGameSlug || null };
  }

  const base = info.baseGameSlug;
  if (!base) throw new Error("Mod has no base game to launch");
  const result = await playGame(base);
  return { ...result, portable: false, baseGameSlug: base };
}

async function openGameFolder(slug) {
  const state = loadState();
  const info = state[slug];
  if (!info?.dir || !fs.existsSync(info.dir)) {
    throw new Error("Game is not installed or folder is missing");
  }
  await Platform.openFolder(info.dir);
  return { status: "opened", dir: info.dir };
}

async function openModFolder(slug) {
  const state = loadState();
  const mods = state.__mods__ && typeof state.__mods__ === "object" ? state.__mods__ : {};
  const info = mods[slug];
  if (!info?.dir || !fs.existsSync(info.dir)) {
    throw new Error("Mod folder is missing");
  }
  await Platform.openFolder(info.dir);
  return { status: "opened", dir: info.dir };
}

async function confirmAndUninstallGame(slug) {
  const state = loadState();
  const info = state[slug];
  if (!info) throw new Error("Game is not installed");
  const entry = catalog.find((e) => e.slug === slug);
  const title = entry?.title || slug;
  const { response } = await dialog.showMessageBox(win || undefined, {
    type: "warning",
    buttons: ["Uninstall", "Cancel"],
    defaultId: 1,
    cancelId: 1,
    title: "Uninstall game",
    message: `Uninstall ${title}?`,
    detail: "This removes the install folder from this PC.",
  });
  if (response !== 0) return { status: "cancelled" };
  return uninstallGame(slug);
}

async function confirmAndUninstallMod(slug) {
  const state = loadState();
  const mods = state.__mods__ && typeof state.__mods__ === "object" ? state.__mods__ : {};
  const info = mods[slug];
  if (!info) throw new Error("Mod is not installed");
  const title = info.title || slug;
  const { response } = await dialog.showMessageBox(win || undefined, {
    type: "warning",
    buttons: ["Remove", "Cancel"],
    defaultId: 1,
    cancelId: 1,
    title: "Remove mod",
    message: `Remove ${title} from your library?`,
    detail: "This stops tracking the mod. Portable installs are not deleted from disk.",
  });
  if (response !== 0) return { status: "cancelled" };
  return uninstallMod(slug);
}

async function uninstallGame(slug) {
  stopExeScan(slug);
  stopInstallerPoll();
  const state = loadState();
  const info = state[slug];
  if (!info) return { status: "not-installed" };
  // Pending-only: just drop tracking (no folder to delete).
  if (info.pending && !(info.exe && fs.existsSync(info.exe))) {
    delete state[slug];
    saveState(state);
    clearPendingInstaller(slug);
    return { status: "dismissed" };
  }
  if (info.dir) await fsp.rm(info.dir, { recursive: true, force: true });
  delete state[slug];
  saveState(state);
  clearPendingInstaller(slug);
  void syncLibrary(slug, "uninstall");
  void telemetry.editionUninstalled(editionInfoFor(slug));
  return { status: "uninstalled", dir: info.dir };
}

function listInstalledGames() {
  const state = loadState();
  const games = [];
  for (const [slug, info] of Object.entries(state)) {
    if (slug === "__mods__") continue;
    if (!info || typeof info !== "object") continue;
    const ready = Boolean(info.exe && fs.existsSync(info.exe));
    const pending = Boolean(info.pending) && !ready;
    if (!ready && !pending) continue;
    const entry = catalog.find((e) => e.slug === slug);
    games.push({
      slug,
      title: entry?.title || slug,
      blurb: entry?.blurb || "",
      art: Array.isArray(entry?.art) && entry.art.length >= 2 ? entry.art : ["#312e81", "#a78bfa"],
      coverImage: resolveMediaUrl(entry?.coverImage) || null,
      approxSize: entry?.approxSize || "",
      genres: entry?.genres || [],
      tags: entry?.tags || [],
      multiplayer: Boolean(entry?.multiplayer),
      platforms: Array.isArray(entry?.platforms) ? entry.platforms : [],
      browserPlayable: Boolean(entry?.browserPlayable),
      steamDeck: Boolean(entry?.steamDeck),
      version: info.version || null,
      dir: info.dir || null,
      exe: ready ? info.exe : null,
      pending,
      scanning: Boolean(pending && info.scanning),
    });
  }
  games.sort((a, b) => String(a.title).localeCompare(String(b.title)));
  return games;
}

function listInstalledMods() {
  const state = loadState();
  const mods = state.__mods__ && typeof state.__mods__ === "object" ? state.__mods__ : {};
  const out = [];
  for (const [slug, info] of Object.entries(mods)) {
    if (!info || typeof info !== "object") continue;
    out.push({
      slug,
      title: info.title || slug,
      baseGameSlug: info.baseGameSlug || null,
      version: info.version || null,
      dir: info.dir || null,
      exe: info.exe || null,
      portable: Boolean(info.portable),
      installedAt: info.installedAt || null,
    });
  }
  out.sort((a, b) => String(a.title).localeCompare(String(b.title)));
  return out;
}

async function uninstallMod(slug) {
  const state = loadState();
  if (!state.__mods__ || !state.__mods__[slug]) return { status: "not-installed" };
  const info = state.__mods__[slug];
  const baseGameSlug = info.baseGameSlug || null;

  /**
   * Put back anything this mod overwrote, and remove what it added.
   *
   * Best effort: a missing backup or a locked file must not stop the mod being
   * removed from the library, or it becomes impossible to uninstall.
   */
  let restored = 0;
  for (const entry of Array.isArray(info.backups) ? info.backups : []) {
    try {
      if (entry?.backup && fs.existsSync(entry.backup)) {
        await fsp.copyFile(entry.backup, entry.path);
        await fsp.rm(entry.backup, { force: true });
        restored++;
      }
    } catch (err) {
      console.warn(`[mod] restore failed for ${entry?.path}:`, err?.message || err);
    }
  }
  for (const file of Array.isArray(info.written) ? info.written : []) {
    try {
      await fsp.rm(file, { force: true });
    } catch (err) {
      console.warn(`[mod] cleanup failed for ${file}:`, err?.message || err);
    }
  }

  delete state.__mods__[slug];
  saveState(state);
  if (baseGameSlug) {
    void syncLibrary(slug, "uninstall", undefined, { kind: "mod", baseGameSlug });
  }
  return { status: "uninstalled", dir: info.dir || null, baseGameSlug, restored };
}

function sanitizeShortcutName(name) {
  return String(name || "Game")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "Game";
}

async function createGameShortcut(slug) {
  const state = loadState();
  const info = state[slug];
  if (!info?.exe || !fs.existsSync(info.exe)) {
    throw new Error("Not installed — no executable found");
  }
  const entry = catalog.find((e) => e.slug === slug);
  const title = sanitizeShortcutName(entry?.title || slug);
  await Platform.createShortcut({
    title,
    targetPath: info.exe,
    args: "",
    description: `Play ${title}`,
    icon: info.exe
  });
  return { title };
}

function clearContext() {
  context = null;
  pushContext();
  return true;
}

/* ── IPC ───────────────────────────────────────────────────── */

ipcMain.handle("get-context", () => buildContextPayload());

ipcMain.handle("choose-directory", async (_event, defaultPath) => {
  const result = await dialog.showOpenDialog(win, {
    title: "Choose install location",
    defaultPath,
    properties: ["openDirectory", "createDirectory"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

  ipcMain.handle("install", (_event, slug, targetDir, editionSlug, addons) =>
    installGame(slug, targetDir, editionSlug || null, addons)
  );
ipcMain.handle("install-mod", (_event, slug, baseDir) => installMod(slug, baseDir || null));
ipcMain.handle("locate-exe", (_event, slug) => locateGameExecutable(slug));
ipcMain.handle("dismiss-pending-install", (_event, slug) => dismissPendingInstall(slug));
ipcMain.handle("play", (_event, slug, join) => playGame(slug, join || null));
ipcMain.handle("play-mod", (_event, slug) => playMod(slug));
ipcMain.handle("post-telemetry", async (_event, payload) => {
  try {
    const body =
      payload && typeof payload === "object"
        ? {
            event: String(payload.event || ""),
            properties:
              payload.properties && typeof payload.properties === "object"
                ? payload.properties
                : {},
            timestamp: String(payload.timestamp || new Date().toISOString()),
            sessionId: String(payload.sessionId || ""),
            anonymousId: String(payload.anonymousId || ""),
            userId:
              payload.userId === null || payload.userId === undefined
                ? null
                : String(payload.userId),
          }
        : null;
    if (!body?.event || body.sessionId.length < 8 || body.anonymousId.length < 8) {
      return { ok: false };
    }
    const res = await fetch(`${getApiBase()}/api/telemetry`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        accept: "application/json",
        "user-agent": `playbound-launcher/${app.getVersion()} (${process.platform})`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
});
ipcMain.handle("uninstall", (_event, slug) => uninstallGame(slug));
ipcMain.handle("get-installed", () => listInstalledGames());
ipcMain.handle("get-installed-mods", () => listInstalledMods());
ipcMain.handle("uninstall-mod", (_event, slug) => uninstallMod(slug));
ipcMain.handle("create-shortcut", (_event, slug) => createGameShortcut(slug));
ipcMain.handle("open-folder", async (_event, dir) => {
  const target = String(dir || "");
  if (!target || !fs.existsSync(target)) throw new Error("Folder not found");
  await shell.openPath(target);
  return true;
});
ipcMain.handle("clear-context", () => clearContext());
ipcMain.handle("open-external", (_event, url) => shell.openExternal(url));
ipcMain.handle("open-deep-link", (_event, url) => {
  handleDeepLink(parseDeepLink(url));
  return true;
});
ipcMain.handle("close-window", () => win?.close());
ipcMain.handle("clipboard-write", (_event, text) => {
  const { clipboard } = require("electron");
  clipboard.writeText(String(text || ""));
  return true;
});
ipcMain.handle("get-account", async () => {
  const settings = loadSettings();
  if (!settings.launcherToken) {
    return { connected: false, apiBase: getApiBase() };
  }
  const check = await validateLauncherToken(settings.launcherToken);
  if (!check.valid) {
    clearLocalToken("Saved session is no longer valid — sign in again from Settings.");
    return { connected: false, apiBase: getApiBase() };
  }
  return {
    connected: true,
    apiBase: getApiBase(),
    email: check.email || null,
    username: check.username || null,
  };
});
ipcMain.handle("set-launcher-token", (_event, token) => connectWithToken(token));
ipcMain.handle("clear-launcher-token", async () => {
  const settings = loadSettings();
  const token = settings.launcherToken;
  if (token) {
    try {
      await fetch(`${getApiBase()}/api/library/token`, {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${token}`,
          "user-agent": "playbound-launcher",
        },
      });
    } catch {
      /* offline / ignore */
    }
  }
  delete settings.launcherToken;
  saveSettings(settings);
  notifyAccount({ connected: false });
  return { connected: false };
});
ipcMain.handle("sign-in", () => {
  openAuthWindow();
  return true;
});
ipcMain.handle("sync-library-now", async () => syncLibraryNow({ quiet: false }));
ipcMain.handle("report-bug", async (_event, payload = {}) => {
  const title = String(payload.title || "").trim();
  const description = String(payload.description || "").trim();
  const contactEmail = String(payload.contactEmail || "").trim();
  if (title.length < 3) return { ok: false, error: "Title is too short." };
  if (description.length < 10) return { ok: false, error: "Please describe the bug in more detail." };

  const settings = loadSettings();
  const headers = {
    "content-type": "application/json",
    accept: "application/json",
    "user-agent": "playbound-launcher",
  };
  if (settings.launcherToken) {
    headers.authorization = `Bearer ${settings.launcherToken}`;
  }

  try {
    const res = await fetch(`${getApiBase()}/api/bug-reports`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: title.slice(0, 160),
        description: description.slice(0, 8000),
        source: "launcher",
        contactEmail: contactEmail.slice(0, 200),
        launcherVersion: app.getVersion(),
        platform: Platform.getOS(),
        osVersion: Platform.getOSVersion(),
        architecture: Platform.getArchitecture(),
        userAgent: `playbound-launcher/${app.getVersion()} (${Platform.getOS()}; ${Platform.getArchitecture()})`,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, error: data?.error || `Server returned ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || "Couldn't reach playbound.club" };
  }
});
ipcMain.handle("get-catalog", () => {
  return catalog.map((e) => ({
    slug: e.slug,
    title: e.title,
    blurb: e.blurb,
    kind: e.kind,
    approxSize: e.approxSize || "",
    art: e.art,
    coverImage: resolveMediaUrl(e.coverImage) || null,
    genres: Array.isArray(e.genres) ? e.genres : [],
    tags: Array.isArray(e.tags) ? e.tags : [],
    multiplayer: Boolean(e.multiplayer),
    platforms: Array.isArray(e.platforms) ? e.platforms : [],
    browserPlayable: Boolean(e.browserPlayable),
    steamDeck: Boolean(e.steamDeck),
  }));
});
ipcMain.handle("get-servers", async (_event, slug) => {
  try {
    const res = await fetch(`${getApiBase()}/api/games/${encodeURIComponent(slug)}/servers`, {
      headers: { "user-agent": "playbound-launcher", accept: "application/json" },
    });
    if (!res.ok) return { supported: false, servers: [] };
    return await res.json();
  } catch {
    return { supported: false, servers: [] };
  }
});
ipcMain.handle("get-server-index", async () => {
  try {
    const res = await fetch(`${getApiBase()}/api/launcher/servers`, {
      headers: launcherApiHeaders(),
    });
    if (!res.ok) return { games: [], providers: [] };
    return await res.json();
  } catch {
    return { games: [], providers: [] };
  }
});
ipcMain.handle("get-mods-catalog", async () => {
  try {
    const res = await fetch(`${getApiBase()}/api/launcher/mods`, {
      headers: launcherApiHeaders(),
    });
    if (!res.ok) return { mods: [] };
    return await res.json();
  } catch {
    return { mods: [] };
  }
});
ipcMain.handle("get-events", async () => {
  try {
    const res = await fetch(`${getApiBase()}/api/events`, {
      headers: { "user-agent": "playbound-launcher", accept: "application/json" },
    });
    if (!res.ok) return { events: [] };
    return await res.json();
  } catch {
    return { events: [] };
  }
});
ipcMain.handle("get-all-servers", async () => {
  let providers = [];
  try {
    const idxRes = await fetch(`${getApiBase()}/api/launcher/servers`, {
      headers: launcherApiHeaders(),
    });
    if (idxRes.ok) {
      const idx = await idxRes.json();
      providers = Array.isArray(idx.providers) ? idx.providers : [];
      if (!providers.length && Array.isArray(idx.games)) {
        providers = idx.games.filter((g) => g.supported).map((g) => g.slug);
      }
    }
  } catch {
    /* fall through */
  }
  if (!providers.length) {
    providers = [
      "openra",
      "luanti",
      "openttd",
      "veloren",
      "beyond-all-reason",
      "supertuxkart",
      "xonotic",
      "unvanquished",
      "mindustry",
      "hedgewars",
      "battle-for-wesnoth",
      "warzone-2100",
      "zero-k",
      "0ad",
    ];
  }

  const results = [];
  const concurrency = 3;
  let cursor = 0;
  async function worker() {
    while (cursor < providers.length) {
      const i = cursor++;
      const slug = providers[i];
      try {
        const res = await fetch(`${getApiBase()}/api/games/${encodeURIComponent(slug)}/servers`, {
          headers: { "user-agent": "playbound-launcher", accept: "application/json" },
        });
        if (!res.ok) continue;
        const data = await res.json();
        if (!data.supported) continue;
        const entry = catalog.find((e) => e.slug === slug);
        results.push({
          slug,
          title: entry?.title || slug,
          servers: Array.isArray(data.servers) ? data.servers : [],
          error: data.error || null,
        });
      } catch {
        /* skip */
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, providers.length) }, () => worker()));
  results.sort((a, b) => String(a.title).localeCompare(String(b.title)));
  return results;
});
ipcMain.handle("ping-hosts", async (_event, hosts) => {
  const list = Array.isArray(hosts) ? hosts : [];
  const TIMEOUT_MS = 1500;

  function isSafeHost(host) {
    if (!host || host.length > 253) return false;
    if (/[\s"'`;&|<>$(){}[\]\\]/.test(host)) return false;
    return true;
  }

  function parsePingMs(stdout) {
    const text = String(stdout || "");
    const reply = text.match(/\b(?:time|zeit|temps|tiempo)[=<]\s*([\d.]+)\s*ms/i);
    if (reply) return Math.round(Number(reply[1]));
    const avg = text.match(/(?:Average|Mittelwert|Moyenne|Media)\s*=\s*([\d.]+)\s*ms/i);
    if (avg) return Math.round(Number(avg[1]));
    return null;
  }

  function tcpConnectMs(host, port, timeoutMs) {
    return new Promise((resolve) => {
      const start = Date.now();
      const socket = new net.Socket();
      let settled = false;
      const finish = (ms) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          socket.destroy();
        } catch {
          /* ignore */
        }
        resolve(ms);
      };
      const timer = setTimeout(() => finish(null), timeoutMs);
      socket.once("connect", () => finish(Date.now() - start));
      socket.once("error", () => finish(null));
      try {
        socket.connect(port, host);
      } catch {
        finish(null);
      }
    });
  }

  function icmpPingMs(host) {
    return new Promise((resolve) => {
      let settled = false;
      let child;
      const finish = (ms) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          if (child && !child.killed) child.kill();
        } catch {
          /* ignore */
        }
        resolve(ms);
      };
      const timer = setTimeout(() => finish(null), TIMEOUT_MS + 500);
      const isWin = process.platform === "win32";
      const args = isWin
        ? ["-n", "1", "-4", "-w", String(TIMEOUT_MS), host]
        : ["-c", "1", "-4", "-W", String(Math.ceil(TIMEOUT_MS / 1000)), host];
      try {
        child = spawn("ping", args, { windowsHide: true });
      } catch {
        finish(null);
        return;
      }
      let stdout = "";
      child.stdout?.on("data", (buf) => {
        stdout += String(buf);
      });
      child.stderr?.on("data", (buf) => {
        stdout += String(buf);
      });
      child.on("error", () => finish(null));
      child.on("close", () => finish(parsePingMs(stdout)));
    });
  }

  async function pingHost(host) {
    const icmp = await icmpPingMs(host);
    if (icmp != null) return icmp;
    for (const port of [443, 80]) {
      const ms = await tcpConnectMs(host, port, TIMEOUT_MS);
      if (ms != null) return ms;
    }
    return null;
  }

  const byHost = new Map();
  for (const item of list) {
    const host = String(item?.host || "").trim();
    const port = Number(item?.port) || 0;
    const id = String(item?.id || (host && port ? `${host}:${port}` : "") || "");
    if (!id || !host || !isSafeHost(host)) continue;
    if (!byHost.has(host)) byHost.set(host, []);
    byHost.get(host).push(id);
  }

  const hostEntries = [...byHost.keys()];
  const hostMs = new Map();
  const concurrency = 8;
  let cursor = 0;
  async function worker() {
    while (cursor < hostEntries.length) {
      const i = cursor++;
      const host = hostEntries[i];
      hostMs.set(host, await pingHost(host));
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(hostEntries.length, 1)) }, () => worker())
  );

  return list.map((item) => {
    const host = String(item?.host || "").trim();
    const port = Number(item?.port) || 0;
    const id = String(item?.id || (host && port ? `${host}:${port}` : "") || "");
    return { id, ms: hostMs.has(host) ? hostMs.get(host) : null };
  });
});
ipcMain.handle("get-settings", () => {
  const settings = loadSettings();
  return {
    apiBase: settings.apiBase || DEFAULT_API_BASE,
    gamesDir: settings.gamesDir || DEFAULT_GAMES_DIR,
    connected: Boolean(settings.launcherToken),
    version: app.getVersion(),
    packaged: app.isPackaged,
    compatibilityFilter:
      settings.compatibilityFilter === "all" ? "all" : "compatible",
  };
});
ipcMain.handle("get-app-version", () => ({
  version: app.getVersion(),
  packaged: app.isPackaged,
  updateAvailable: pendingUpdate
    ? { version: pendingUpdate.version, releaseDate: pendingUpdate.releaseDate || null }
    : null,
}));
ipcMain.handle("check-for-updates", async () => {
  if (!app.isPackaged) {
    return { ok: false, reason: "dev", message: "Updates only run in packaged builds." };
  }
  try {
    const { autoUpdater } = require("electron-updater");
    const result = await autoUpdater.checkForUpdates();
    const info = result?.updateInfo || null;
    if (info && info.version && info.version !== app.getVersion()) {
      pendingUpdate = info;
      return { ok: true, updateAvailable: true, version: info.version };
    }
    return { ok: true, updateAvailable: false, version: app.getVersion() };
  } catch (err) {
    return { ok: false, reason: "error", message: err?.message || String(err) };
  }
});
ipcMain.handle("install-update", () => {
  if (!app.isPackaged) return { ok: false, message: "Not packaged" };
  try {
    const { autoUpdater } = require("electron-updater");
    autoUpdater.quitAndInstall(false, true);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err?.message || String(err) };
  }
});
ipcMain.handle("save-settings", (_event, patch) => {
  const settings = loadSettings();
  if (patch.apiBase != null) settings.apiBase = patch.apiBase;
  if (patch.gamesDir != null) settings.gamesDir = patch.gamesDir;
  if (patch.compatibilityFilter === "compatible" || patch.compatibilityFilter === "all") {
    settings.compatibilityFilter = patch.compatibilityFilter;
    void pushCompatibilityPreference(patch.compatibilityFilter);
  }
  saveSettings(settings);
  return true;
});

ipcMain.handle("get-live-stats", async (_event, opts = {}) => {
  try {
    const params = new URLSearchParams();
    if (opts?.game) params.set("game", opts.game);
    if (opts?.mod) params.set("mod", opts.mod);
    if (opts?.edition) params.set("edition", opts.edition);
    const qs = params.toString();
    const res = await fetch(`${getApiBase()}/api/launcher/live-stats${qs ? `?${qs}` : ""}`, {
      headers: launcherApiHeaders(),
      // Every other call in this file is bounded; this one was not, so a slow
      // or black-holed connection could leave it pending indefinitely. Live
      // stats are decorative — a missing number is fine, a hung request is not.
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
});

ipcMain.handle("get-editions", async (_event, gameSlug) => {
  try {
    const editions = await fetchLauncherEditions(gameSlug || null);
    return { editions };
  } catch {
    return { editions: [] };
  }
});

ipcMain.handle("get-game-guides", async (_event, slug) => {
  try {
    const res = await fetch(
      `${getApiBase()}/api/launcher/games/${encodeURIComponent(slug)}/guides`,
      { headers: launcherApiHeaders() }
    );
    if (!res.ok) return { guides: [] };
    return await res.json();
  } catch {
    return { guides: [] };
  }
});

ipcMain.handle("get-game-releases", async (_event, slug) => {
  try {
    const res = await fetch(
      `${getApiBase()}/api/launcher/games/${encodeURIComponent(slug)}/releases`,
      { headers: launcherApiHeaders() }
    );
    if (!res.ok) return { releases: [], githubRepo: null };
    return await res.json();
  } catch {
    return { releases: [], githubRepo: null };
  }
});

// --- Friends API Bridging ---
ipcMain.handle("get-friends", async () => {
  try {
    const res = await fetch(`${getApiBase()}/api/friends`, { headers: launcherApiHeaders() });
    if (!res.ok) throw new Error("Failed to fetch friends");
    return await res.json();
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("get-friend-requests", async () => {
  try {
    const res = await fetch(`${getApiBase()}/api/friends/requests`, { headers: launcherApiHeaders() });
    if (!res.ok) throw new Error("Failed to fetch friend requests");
    return await res.json();
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("accept-friend-request", async (_event, requestId) => {
  try {
    const res = await fetch(`${getApiBase()}/api/friends/accept`, {
      method: "POST",
      headers: launcherApiHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ requestId })
    });
    if (!res.ok) throw new Error("Failed to accept request");
    return await res.json();
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("decline-friend-request", async (_event, requestId) => {
  try {
    const res = await fetch(`${getApiBase()}/api/friends/decline`, {
      method: "POST",
      headers: launcherApiHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ requestId })
    });
    if (!res.ok) throw new Error("Failed to decline request");
    return await res.json();
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("remove-friend", async (_event, friendId) => {
  try {
    const res = await fetch(`${getApiBase()}/api/friends/remove`, {
      method: "POST",
      headers: launcherApiHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ friendId })
    });
    if (!res.ok) throw new Error("Failed to remove friend");
    return await res.json();
  } catch (err) {
    return { error: err.message };
  }
});
// ----------------------------

ipcMain.handle("get-recently-played", () => {
  const settings = loadSettings();
  const recent = settings.recentlyPlayed || {};
  const state = loadState();
  const games = [];
  for (const [slug, data] of Object.entries(recent)) {
    const info = state[slug];
    if (!info || !info.exe || !fs.existsSync(info.exe)) continue;
    const entry = catalog.find((e) => e.slug === slug);
    games.push({
      slug,
      title: entry?.title || slug,
      blurb: entry?.blurb || "",
      art: Array.isArray(entry?.art) && entry.art.length >= 2 ? entry.art : ["#312e81", "#a78bfa"],
      coverImage: resolveMediaUrl(entry?.coverImage) || null,
      platforms: Array.isArray(entry?.platforms) ? entry.platforms : [],
      browserPlayable: Boolean(entry?.browserPlayable),
      steamDeck: Boolean(entry?.steamDeck),
      lastPlayed: data.lastPlayed || null,
    });
  }
  games.sort((a, b) => (b.lastPlayed || "").localeCompare(a.lastPlayed || ""));
  return games;
});
ipcMain.handle("get-game-detail", async (_event, slug) => {
  const entry = (await ensureCatalogEntry(slug)) || catalog.find((e) => e.slug === slug);
  if (!entry) return null;
  const state = loadState();
  const info = state[slug];

  let rich = null;
  try {
    const res = await fetch(`${getApiBase()}/api/launcher/games/${encodeURIComponent(slug)}`, {
      headers: launcherApiHeaders(),
    });
    if (res.ok) rich = await res.json();
  } catch {
    /* offline */
  }

  const modsBag = state.__mods__ && typeof state.__mods__ === "object" ? state.__mods__ : {};
  const mods = Array.isArray(rich?.mods)
    ? rich.mods.map((m) => ({
        ...m,
        installed: Boolean(modsBag[m.slug]),
        installedPath: modsBag[m.slug]?.dir || null,
      }))
    : [];

  return {
    ...entry,
    ...(rich || {}),
    slug: entry.slug,
    title: rich?.title || entry.title,
    blurb: rich?.blurb || entry.blurb,
    description: rich?.description || entry.blurb || "",
    features: Array.isArray(rich?.features) ? rich.features : [],
    genres: Array.isArray(rich?.genres) ? rich.genres : entry.genres || [],
    tags: Array.isArray(rich?.tags) ? rich.tags : entry.tags || [],
    screenshots: (Array.isArray(rich?.screenshots) ? rich.screenshots : [])
      .map((src) => resolveMediaUrl(src))
      .filter(Boolean),
    systemRequirements: rich?.systemRequirements || null,
    faq: Array.isArray(rich?.faq) ? rich.faq : [],
    videos: Array.isArray(rich?.videos) ? rich.videos : [],
    website: rich?.website || entry.url || null,
    githubRepo: rich?.githubRepo || null,
    platforms: Array.isArray(rich?.platforms)
      ? rich.platforms
      : Array.isArray(entry.platforms)
        ? entry.platforms
        : [],
    browserPlayable: Boolean(rich?.browserPlayable ?? entry.browserPlayable),
    steamDeck: Boolean(rich?.steamDeck ?? entry.steamDeck),
    coverImage: resolveMediaUrl(rich?.coverImage || entry.coverImage) || null,
    approxSize: rich?.approxSize || entry.approxSize || "",
    multiplayer: Boolean(rich?.multiplayer ?? entry.multiplayer),
    mods,
    installed: Boolean(info?.exe && fs.existsSync(info.exe)),
    installedPath: info?.dir || null,
    version: info?.version || null,
    installedEditionSlug: info?.editionSlug || null,
    installedEditionName: info?.editionName || null,
    isInstallerKind:
      entry.kind === "github-installer" || entry.kind === "direct-installer",
    pendingInstaller: Boolean(info?.pending) || getPendingInstaller()?.slug === slug,
    scanning: Boolean(info?.pending && info?.scanning),
  };
});

function setupAutoUpdater() {
  if (!app.isPackaged) return;
  let autoUpdater;
  try {
    ({ autoUpdater } = require("electron-updater"));
  } catch (err) {
    console.warn("electron-updater unavailable:", err?.message || err);
    return;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  // Blob hosts + stale local blockmaps make NSIS delta updates flaky; always pull full Setup.
  autoUpdater.disableDifferentialDownload = true;
  autoUpdater.disableWebInstaller = true;
  autoUpdater.setFeedURL({ provider: "generic", url: UPDATER_FEED_URL });

  const emit = (payload) => {
    if (win && !win.isDestroyed()) win.webContents.send("update-status", payload);
  };

  autoUpdater.on("checking-for-update", () => emit({ phase: "checking" }));
  autoUpdater.on("update-available", (info) => {
    pendingUpdate = info;
    emit({ phase: "available", version: info.version });
  });
  autoUpdater.on("update-not-available", () => emit({ phase: "none", version: app.getVersion() }));
  autoUpdater.on("download-progress", (p) =>
    emit({ phase: "downloading", percent: Math.round(p.percent || 0) })
  );
  autoUpdater.on("update-downloaded", (info) => {
    pendingUpdate = info;
    emit({ phase: "ready", version: info.version });
  });
  autoUpdater.on("error", (err) => emit({ phase: "error", message: err?.message || String(err) }));

  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.warn("update check failed:", err?.message || err);
    });
  }, 4000);
}

/* ── window ────────────────────────────────────────────────── */

function showMainWindow() {
  if (!win || win.isDestroyed()) {
    createWindow();
    return;
  }
  win.setSkipTaskbar(false);
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  void syncLibraryNow({ quiet: true });
}

function ensureTray() {
  if (tray) return;
  void (async () => {
    if (tray) return;
    let icon = nativeImage.createEmpty();
    try {
      icon = await app.getFileIcon(process.execPath, { size: "small" });
    } catch {
      /* empty fallback */
    }
    if (tray) return;
    tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
    tray.setToolTip("PlayBound");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Open PlayBound", click: () => showMainWindow() },
        { type: "separator" },
        { label: "Quit", click: () => app.quit() },
      ])
    );
    tray.on("click", () => showMainWindow());
  })();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    resizable: true,
    backgroundColor: "#0c0a12",
    title: "PlayBound",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
  win.on("minimize", (e) => {
    e.preventDefault();
    win.hide();
    win.setSkipTaskbar(true);
    ensureTray();
  });
  win.on("focus", () => {
    void syncLibraryNow({ quiet: true });
    const pending = getPendingInstaller();
    if (pending?.slug) {
      const entry = catalog.find((e) => e.slug === pending.slug);
      if (entry) {
        invalidateUninstallCache(entry);
        const known = findKnownExecutable(entry);
        if (known) markInstalledFromExe(pending.slug, entry, known, pending.version || "located");
      }
    }
  });
  win.webContents.once("did-finish-load", () => {
    const n = scanKnownInstalls();
    resumePendingInstallerPoll();
    win.webContents.send("context", buildContextPayload());
    if (n > 0) {
      win.webContents.send("install-detected", { slug: null, scanned: n });
    }
  });
}

/* ── headless self-test: verify every GitHub/direct entry resolves ── */

async function testResolve() {
  let failures = 0;
  for (const entry of catalog) {
    if (entry.kind === "github-installer" || entry.kind === "direct-installer") {
      if (!Array.isArray(entry.knownExePaths) || entry.knownExePaths.length === 0) {
        failures++;
        console.log(`FAIL  ${entry.slug}: installer kind missing knownExePaths`);
      } else {
        console.log(`OK    ${entry.slug} knownExePaths=${entry.knownExePaths.length}`);
      }
    }
    if (entry.kind === "external") {
      console.log(`SKIP  ${entry.slug} (external: ${entry.url})`);
      continue;
    }
    try {
      const dl = await resolveDownload(entry);
      console.log(`OK    ${entry.slug} -> ${dl.name} (${dl.version})`);
    } catch (err) {
      failures++;
      console.log(`FAIL  ${entry.slug}: ${err.message}`);
    }
  }
  console.log(failures === 0 ? "All resolvable entries OK" : `${failures} failure(s)`);
  app.exit(failures === 0 ? 0 : 1);
}

/* ── headless self-test: full install pipeline for one game ── */

async function testInstall(slug) {
  const entry = catalog.find((e) => e.slug === slug);
  if (!entry || entry.kind !== "github-zip") {
    console.log(`test-install needs a github-zip entry; got: ${slug}`);
    app.exit(1);
    return;
  }
  try {
    const result = await installGame(slug);
    console.log(`Install result: ${JSON.stringify(result)}`);
    if (result.status !== "installed") throw new Error("unexpected status");
    app.exit(0);
  } catch (err) {
    console.log(`FAIL: ${err.message}`);
    app.exit(1);
  }
}

/* ── headless self-test: deep link parsing ───────────────────────────── */

function testDeepLink() {
  const cases = [
    ["playbound://install/openra", { action: "install", slug: "openra" }],
    ["playbound://play/warzone-2100", { action: "play", slug: "warzone-2100" }],
    ["playbound://uninstall/openra", { action: "uninstall", slug: "openra" }],
    ["playbound://install/openra/", { action: "install", slug: "openra" }],
    [
      "playbound://join/openra?host=1.2.3.4&port=1234&name=Test",
      { action: "join", slug: "openra", host: "1.2.3.4", port: 1234, name: "Test" },
    ],
    ["playbound://auth", { action: "auth" }],
    ["playbound://sync", { action: "sync" }],
    ["playbound://link?token=abc", { action: "link", token: "abc" }],
    ["playbound://install-mod/cool-mod", { action: "install-mod", slug: "cool-mod" }],
    ["playbound://play-mod/openra-tiberian-dawn-hd", { action: "play-mod", slug: "openra-tiberian-dawn-hd" }],
    ["playbound://open-folder/openra", { action: "open-folder", slug: "openra" }],
    ["playbound://open-folder-mod/cool-mod", { action: "open-folder-mod", slug: "cool-mod" }],
    ["playbound://uninstall-mod/cool-mod", { action: "uninstall-mod", slug: "cool-mod" }],
    ["playbound://locate/naev", { action: "locate", slug: "naev" }],
    ["not-a-deep-link", null],
  ];
  let failures = 0;
  for (const [url, expected] of cases) {
    const got = parseDeepLink(url);
    const ok = JSON.stringify(got) === JSON.stringify(expected);
    if (!ok) {
      failures++;
      console.log(`FAIL  ${url}\n  expected ${JSON.stringify(expected)}\n  got      ${JSON.stringify(got)}`);
    } else {
      console.log(`OK    ${url}`);
    }
  }
  console.log(failures === 0 ? "Deep link parsing OK" : `${failures} deep-link failure(s)`);
  app.exit(failures === 0 ? 0 : 1);
}

/* ── headless self-test: uninstall pipeline ──────────────────────────── */

async function testUninstall(slug) {
  try {
    const before = loadState();
    console.log(`Before: ${JSON.stringify(before[slug] ?? null)}`);
    const result = await uninstallGame(slug);
    console.log(`Uninstall result: ${JSON.stringify(result)}`);
    const after = loadState();
    if (after[slug]) throw new Error("state still present after uninstall");
    if (result.dir && fs.existsSync(result.dir)) throw new Error("directory still exists after uninstall");
    console.log("Uninstall pipeline OK");
    app.exit(0);
  } catch (err) {
    console.log(`FAIL: ${err.message}`);
    app.exit(1);
  }
}

if (gotLock) {
  app.whenReady().then(async () => {
    if (process.argv.includes("--test-resolve")) return testResolve();
    const installIdx = process.argv.indexOf("--test-install");
    if (installIdx !== -1) return testInstall(process.argv[installIdx + 1]);
    if (process.argv.includes("--test-deep-link")) return testDeepLink();
    const uninstallIdx = process.argv.indexOf("--test-uninstall");
    if (uninstallIdx !== -1) return testUninstall(process.argv[uninstallIdx + 1]);

    await refreshRemoteCatalog();
    for (const entry of catalog) {
      if (
        (entry.kind === "github-installer" || entry.kind === "direct-installer") &&
        !(Array.isArray(entry.knownExePaths) && entry.knownExePaths.length > 0)
      ) {
        console.warn(`[catalog] installer ${entry.slug} is missing knownExePaths`);
      }
    }
    scanKnownInstalls();
    setupAutoUpdater();

    const launchUrl = process.argv.find((a) => a.startsWith(`${PROTOCOL}://`));
    const parsedLaunch = launchUrl ? parseDeepLink(launchUrl) : null;
    
    if (Platform.getOS() === "macos") {
      const template = [
        {
          label: app.name,
          submenu: [
            { role: "about" },
            { type: "separator" },
            { role: "services" },
            { type: "separator" },
            { role: "hide" },
            { role: "hideOthers" },
            { role: "unhide" },
            { type: "separator" },
            { role: "quit" }
          ]
        },
        {
          label: "Edit",
          submenu: [
            { role: "undo" },
            { role: "redo" },
            { type: "separator" },
            { role: "cut" },
            { role: "copy" },
            { role: "paste" },
            { role: "selectAll" }
          ]
        }
      ];
      Menu.setApplicationMenu(Menu.buildFromTemplate(template));
    }
    
    createWindow();
    scheduleLibrarySync();
    if (parsedLaunch && (parsedLaunch.action === "auth" || parsedLaunch.action === "link")) {
      handleDeepLink(parsedLaunch);
    } else if (parsedLaunch) {
      await setContext(parsedLaunch);
      void startupLibrarySync();
    } else {
      void startupLibrarySync();
    }
    app.on("activate", () => {
      showMainWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", () => {
    // Close any play session still open. Fire-and-forget: quitting must not
    // wait on the network, and an unreported session is better than a hang.
    void telemetry.flushOpenSessions();
    if (librarySyncTimer) {
      clearInterval(librarySyncTimer);
      librarySyncTimer = null;
    }
    if (authWin && !authWin.isDestroyed()) {
      authWin.destroy();
      authWin = null;
    }
    if (tray) {
      tray.destroy();
      tray = null;
    }
  });

  // macOS deep-link event (Windows/Linux use argv + second-instance instead).
  app.on("open-url", (event, url) => {
    event.preventDefault();
    handleDeepLink(parseDeepLink(url));
  });
}
