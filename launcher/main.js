const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const bundledCatalog = require("./catalog");

/** Mutable catalog: bundled fallback, overwritten/merged from the site API. */
let catalog = bundledCatalog.map((e) => ({ ...e }));

const PROTOCOL = "playbound";
const DEFAULT_GAMES_DIR = path.join(app.getPath("home"), "PlayBound", "Games");
const STATE_FILE = path.join(app.getPath("userData"), "installed.json");
const SETTINGS_FILE = path.join(app.getPath("userData"), "settings.json");
const DEFAULT_API_BASE = "https://playbound.club";

let win = null;
/** The single action this launch is for: { action: 'install'|'play'|'uninstall', slug } | null */
let context = null;
/** Background poll after opening a Windows installer wizard */
let installerPollTimer = null;
let installerPollSlug = null;

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
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

function parseDeepLink(url) {
  // playbound://install/openra
  // playbound://install-mod/my-mod
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
    if (!slug || !["install", "play", "uninstall", "join", "install-mod"].includes(action)) return null;
    /** @type {{ action: string, slug: string, host?: string, port?: number, name?: string }} */
    const parsed = { action, slug };
    if (action === "join") {
      parsed.host = u.searchParams.get("host") || "";
      parsed.port = Number(u.searchParams.get("port") || 0);
      parsed.name = u.searchParams.get("name") || "";
    }
    return parsed;
  } catch {
    return null;
  }
}

const CONNECTED_LIBRARY_MSG =
  "Connected. Close this window and refresh your library page.";

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

/** Sync every game in installed.json (skip __mods__) to the library. */
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
  if (!installs.length) return { synced: 0, skipped: [], error: null };

  try {
    const res = await fetch(`${getApiBase()}/api/library/sync/batch`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        "user-agent": "playbound-launcher",
      },
      body: JSON.stringify({ installs }),
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
      return { synced, skipped, error: null };
    }
    const data = await res.json();
    return {
      synced: Number(data.synced) || 0,
      skipped: Array.isArray(data.skipped) ? data.skipped : [],
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
    if (res.status === 401) return false;
    if (!res.ok) return true; // don't wipe token on transient errors
    const data = await res.json();
    return data.valid !== false;
  } catch {
    return true;
  }
}

function clearLocalToken(message) {
  const settings = loadSettings();
  delete settings.launcherToken;
  saveSettings(settings);
  notifyAccount({
    connected: false,
    message: message || "Token expired — reconnect from playbound.club/library.",
  });
}

async function connectWithToken(token) {
  persistLauncherToken(token, { notify: false });
  const valid = await validateLauncherToken(token);
  if (!valid) {
    clearLocalToken("Invalid launcher token — reconnect from your library page.");
    return { connected: false, synced: 0, skipped: [], error: "unauthorized" };
  }
  const { synced, skipped, error } = await syncAllInstalledGames();
  if (error === "unauthorized") {
    clearLocalToken("Token rejected — reconnect from your library page.");
    return { connected: false, synced: 0, skipped: [], error };
  }
  let message = CONNECTED_LIBRARY_MSG;
  if (synced > 0) {
    message = `${CONNECTED_LIBRARY_MSG} Synced ${synced} game${synced === 1 ? "" : "s"}.`;
  }
  if (skipped?.length) {
    message += ` Skipped ${skipped.length}: ${skipped.slice(0, 3).join(", ")}${skipped.length > 3 ? "…" : ""}.`;
  }
  if (error) {
    message = `Connected, but sync had issues: ${error}`;
  }
  notifyAccount({ connected: true, synced, skipped, message });
  return { connected: true, synced, skipped, error };
}

async function startupLibrarySync() {
  const settings = loadSettings();
  const token = settings.launcherToken;
  if (!token) return;
  const valid = await validateLauncherToken(token);
  if (!valid) {
    clearLocalToken("Saved token is no longer valid — reconnect from playbound.club/library.");
    return;
  }
  const { synced, skipped, error } = await syncAllInstalledGames();
  if (error === "unauthorized") {
    clearLocalToken("Token rejected — reconnect from your library page.");
    return;
  }
  let message = "Library sync complete.";
  if (synced > 0) {
    message = `Synced ${synced} installed game${synced === 1 ? "" : "s"} to your library.`;
  } else if (!error) {
    message = "Connected — no local installs to sync yet.";
  }
  if (skipped?.length) {
    message += ` Skipped ${skipped.length}.`;
  }
  if (error) {
    message = `Library sync issue: ${error}`;
  }
  notifyAccount({ connected: true, synced, skipped, message });
}

function openAuthInBrowser() {
  const authUrl = `${getApiBase()}/launcher/auth`;
  void shell.openExternal(authUrl);
}

async function handleSyncDeepLink() {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
  context = null;
  pushContext();

  const settings = loadSettings();
  const token = settings.launcherToken;
  if (!token) {
    notifyAccount({
      connected: false,
      message: "Not connected — opening Connect in your browser.",
    });
    openAuthInBrowser();
    return;
  }

  notifyAccount({ connected: true, message: "Syncing installs to your library…" });
  const valid = await validateLauncherToken(token);
  if (!valid) {
    clearLocalToken("Saved token is no longer valid — reconnect from playbound.club/library.");
    openAuthInBrowser();
    return;
  }

  const { synced, skipped, error } = await syncAllInstalledGames();
  if (error === "unauthorized") {
    clearLocalToken("Token rejected — reconnect from your library page.");
    openAuthInBrowser();
    return;
  }

  let message = "Library sync complete.";
  if (synced > 0) {
    message = `Synced ${synced} installed game${synced === 1 ? "" : "s"} to your library. Refresh the library page.`;
  } else if (!error) {
    message = "Connected — no local installs to sync yet.";
  }
  if (skipped?.length) {
    message += ` Skipped ${skipped.length}.`;
  }
  if (error) {
    message = `Library sync issue: ${error}`;
  }
  notifyAccount({ connected: true, synced, skipped, message });
}

function handleDeepLink(parsed) {
  if (!parsed) return;
  if (parsed.action === "auth") {
    openAuthInBrowser();
    return;
  }
  if (parsed.action === "sync") {
    void handleSyncDeepLink();
    return;
  }
  if (parsed.action === "link") {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
    if (parsed.token) {
      void connectWithToken(parsed.token);
    }
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

async function refreshRemoteCatalog() {
  try {
    const res = await fetch(`${getApiBase()}/api/launcher/catalog`, {
      headers: { "user-agent": "playbound-launcher", accept: "application/json" },
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
      headers: { "user-agent": "playbound-launcher", accept: "application/json" },
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
async function syncLibrary(slug, action, version) {
  const settings = loadSettings();
  const token = settings.launcherToken;
  if (!token) return;
  try {
    const res = await fetch(`${getApiBase()}/api/library/sync`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        "user-agent": "playbound-launcher",
      },
      body: JSON.stringify({ slug, action, version }),
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
    if (!/\.(zip|jar)$/i.test(name)) name = `${install.slug || "mod"}.zip`;
    return { url: install.url, name, version: "fixed" };
  }
  if (install.downloadKind !== "github-zip") {
    throw new Error(`Unsupported mod download kind: ${install.downloadKind}`);
  }
  if (!install.repo) throw new Error("Mod is missing a GitHub repo");
  const res = await fetch(`https://api.github.com/repos/${install.repo}/releases/latest`, {
    headers: { "user-agent": "playbound-launcher", accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${install.repo}`);
  const release = await res.json();
  const pattern = new RegExp(install.assetPattern || "\\.zip$", "i");
  const asset = (release.assets || []).find((a) => pattern.test(a.name));
  if (!asset) throw new Error(`No zip asset matching pattern for ${install.repo}`);
  return { url: asset.browser_download_url, name: asset.name, version: release.tag_name, size: asset.size };
}

/* ── download with progress ────────────────────────────────── */

function sendProgress(payload) {
  if (win && !win.isDestroyed()) win.webContents.send("progress", payload);
}

async function downloadTo(url, dest) {
  const res = await fetch(url, { headers: { "user-agent": "playbound-launcher" } });
  if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status}`);
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

function findKnownExecutable(entry) {
  for (const raw of entry.knownExePaths || []) {
    const full = expandWinPath(raw);
    if (full && fs.existsSync(full)) return full;
  }
  return null;
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
  markInstalled(slug, { version, exe, dir });
  notifyInstallDetected(slug);
  return { status: "installed", version, exe, dir };
}

function stopInstallerPoll() {
  if (installerPollTimer) {
    clearInterval(installerPollTimer);
    installerPollTimer = null;
    installerPollSlug = null;
  }
}

function startInstallerPoll(slug, entry, version) {
  stopInstallerPoll();
  installerPollSlug = slug;
  const started = Date.now();
  const maxMs = 10 * 60 * 1000;
  installerPollTimer = setInterval(() => {
    if (Date.now() - started > maxMs) {
      stopInstallerPoll();
      return;
    }
    const known = findKnownExecutable(entry);
    if (!known) return;
    stopInstallerPoll();
    markInstalledFromExe(slug, entry, known, version || "located");
  }, 3000);
}

/** One-shot: pick up games already installed via knownExePaths but missing from state. */
function scanKnownInstalls() {
  const state = loadState();
  let found = 0;
  for (const entry of catalog) {
    if (!entry?.slug || !entry.knownExePaths?.length) continue;
    const existing = state[entry.slug];
    if (existing?.exe && fs.existsSync(existing.exe)) continue;
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
  if (baseGameSlug === "mindustry") {
    return path.join(appData, "Mindustry", "mods");
  }
  if (baseGameSlug === "0ad") {
    return path.join(appData, "0ad", "mods");
  }

  let baseDir = baseDirOverride || null;
  if (!baseDir) {
    const state = loadState();
    const info = state[baseGameSlug];
    if (info?.dir && fs.existsSync(info.dir)) baseDir = info.dir;
  }
  if (!baseDir) return null;
  const rel = String(installRelativePath || "").replace(/^[/\\]+|[/\\]+$/g, "");
  return rel ? path.join(baseDir, ...rel.split(/[/\\]+/)) : baseDir;
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
    if (!isBaseGameReady(install.baseGameSlug) && !["mindustry", "0ad"].includes(install.baseGameSlug)) {
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

function markInstalled(slug, { version, exe, dir }) {
  const state = loadState();
  state[slug] = { version, exe, dir, installedAt: new Date().toISOString() };
  saveState(state);
  void syncLibrary(slug, "install", version);
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

async function installGame(slug, targetDir) {
  const entry = (await ensureCatalogEntry(slug)) || catalog.find((e) => e.slug === slug);
  if (!entry) throw new Error(`Unknown game: ${slug}`);

  if (entry.kind === "external") {
    await shell.openExternal(entry.url);
    return { status: "external" };
  }

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
      return markInstalledFromExe(slug, entry, known, dl.version);
    }
    startInstallerPoll(slug, entry, dl.version);
    return { status: "installer-opened", version: dl.version };
  }

  if (entry.kind === "direct-exe") {
    sendProgress({ phase: "extracting" });
    await fsp.mkdir(gameDir, { recursive: true });
    const destName = dl.name.toLowerCase().endsWith(".exe") ? dl.name : `${entry.slug}.exe`;
    const exe = path.join(gameDir, destName);
    await fsp.copyFile(downloadPath, exe);
    await fsp.rm(downloadPath, { force: true });
    markInstalled(slug, { version: dl.version, exe, dir: gameDir });
    sendProgress({ phase: "done" });
    return { status: "installed", version: dl.version, dir: gameDir };
  }

  if (entry.kind === "github-jar") {
    sendProgress({ phase: "extracting" });
    await fsp.mkdir(gameDir, { recursive: true });
    const jarPath = path.join(gameDir, dl.name);
    await fsp.copyFile(downloadPath, jarPath);
    await fsp.rm(downloadPath, { force: true });
    const exe = await writeJarLauncher(gameDir, dl.name);
    markInstalled(slug, { version: dl.version, exe, dir: gameDir });
    sendProgress({ phase: "done" });
    return { status: "installed", version: dl.version, dir: gameDir };
  }

  sendProgress({ phase: "extracting" });
  await fsp.rm(gameDir, { recursive: true, force: true });
  await extractZip(downloadPath, gameDir);
  await fsp.rm(downloadPath, { force: true });

  const exe = findExecutable(gameDir, entry.exeHint);
  if (!exe) throw new Error("Extracted, but no executable found");

  markInstalled(slug, { version: dl.version, exe, dir: gameDir });
  sendProgress({ phase: "done" });
  return { status: "installed", version: dl.version, dir: gameDir };
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
  if (/winportable/i.test(dl.name || "")) {
    targetDir = path.join(DEFAULT_GAMES_DIR, slug);
  }
  if (!targetDir) {
    throw new Error("Base game folder not found — install the game first or choose its folder.");
  }
  await fsp.mkdir(targetDir, { recursive: true });
  const downloadPath = path.join(app.getPath("temp"), "playbound-launcher", "mods", dl.name);
  await downloadTo(dl.url, downloadPath);

  const isZip = /\.zip$/i.test(dl.name) || install.downloadKind === "github-zip" || install.downloadKind === "direct-zip";
  if (isZip && !/\.jar$/i.test(dl.name)) {
    sendProgress({ phase: "extracting" });
    await extractZip(downloadPath, targetDir);
  } else {
    sendProgress({ phase: "extracting" });
    const dest = path.join(targetDir, path.basename(dl.name));
    await fsp.copyFile(downloadPath, dest);
  }
  await fsp.rm(downloadPath, { force: true });

  const state = loadState();
  if (!state.__mods__ || typeof state.__mods__ !== "object") state.__mods__ = {};
  state.__mods__[slug] = {
    version: dl.version,
    dir: targetDir,
    baseGameSlug: install.baseGameSlug,
    installedAt: new Date().toISOString(),
  };
  saveState(state);
  sendProgress({ phase: "done" });
  return { status: "installed", version: dl.version, dir: targetDir, baseGameSlug: install.baseGameSlug };
}

async function installMod(slug, baseDirOverride) {
  sendProgress({ phase: "resolving" });
  const install = await fetchModInstall(slug);

  if (install.downloadKind === "external") {
    await shell.openExternal(install.url || `${getApiBase()}/mods/${slug}`);
    return { status: "external" };
  }

  const appDataMods = install.baseGameSlug === "mindustry" || install.baseGameSlug === "0ad";
  let targetDir = resolveModTargetDir(install.baseGameSlug, install.installRelativePath, baseDirOverride);
  const baseReady = isBaseGameReady(install.baseGameSlug) || Boolean(baseDirOverride && fs.existsSync(baseDirOverride));

  if (!targetDir || (!baseReady && !appDataMods && !baseDirOverride)) {
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
  const useShell = /\.(cmd|bat)$/i.test(info.exe);
  spawn(info.exe, args, {
    cwd: path.dirname(info.exe),
    detached: true,
    stdio: "ignore",
    shell: useShell,
  }).unref();

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

async function uninstallGame(slug) {
  const state = loadState();
  const info = state[slug];
  if (!info) return { status: "not-installed" };
  if (info.dir) await fsp.rm(info.dir, { recursive: true, force: true });
  delete state[slug];
  saveState(state);
  void syncLibrary(slug, "uninstall");
  return { status: "uninstalled", dir: info.dir };
}

function listInstalledGames() {
  const state = loadState();
  const games = [];
  for (const [slug, info] of Object.entries(state)) {
    if (slug === "__mods__") continue;
    if (!info || typeof info !== "object") continue;
    if (!info.exe || !fs.existsSync(info.exe)) continue;
    const entry = catalog.find((e) => e.slug === slug);
    games.push({
      slug,
      title: entry?.title || slug,
      art: Array.isArray(entry?.art) && entry.art.length >= 2 ? entry.art : ["#312e81", "#a78bfa"],
      version: info.version || null,
      dir: info.dir || null,
      exe: info.exe,
    });
  }
  games.sort((a, b) => String(a.title).localeCompare(String(b.title)));
  return games;
}

function sanitizeShortcutName(name) {
  return String(name || "Game")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "Game";
}

function createGameShortcut(slug) {
  const state = loadState();
  const info = state[slug];
  if (!info?.exe || !fs.existsSync(info.exe)) {
    throw new Error("Not installed — no executable found");
  }
  const entry = catalog.find((e) => e.slug === slug);
  const title = sanitizeShortcutName(entry?.title || slug);
  const desktop = app.getPath("desktop");
  const shortcutPath = path.join(desktop, `${title}.lnk`);
  const ok = shell.writeShortcutLink(shortcutPath, {
    target: info.exe,
    cwd: path.dirname(info.exe),
    description: `Play ${title}`,
    icon: info.exe,
    iconIndex: 0,
  });
  if (!ok) throw new Error("Couldn't create desktop shortcut");
  return { path: shortcutPath, title };
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

ipcMain.handle("install", (_event, slug, targetDir) => installGame(slug, targetDir));
ipcMain.handle("install-mod", (_event, slug, baseDir) => installMod(slug, baseDir || null));
ipcMain.handle("locate-exe", (_event, slug) => locateGameExecutable(slug));
ipcMain.handle("play", (_event, slug, join) => playGame(slug, join || null));
ipcMain.handle("uninstall", (_event, slug) => uninstallGame(slug));
ipcMain.handle("get-installed", () => listInstalledGames());
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
ipcMain.handle("get-account", () => {
  const settings = loadSettings();
  return {
    connected: Boolean(settings.launcherToken),
    apiBase: getApiBase(),
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
  openAuthInBrowser();
  return true;
});
ipcMain.handle("get-catalog", () => {
  return catalog.map((e) => ({
    slug: e.slug,
    title: e.title,
    blurb: e.blurb,
    kind: e.kind,
    approxSize: e.approxSize || "",
    art: e.art,
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
ipcMain.handle("get-all-servers", async () => {
  const state = loadState();
  const results = [];
  for (const slug of Object.keys(state)) {
    if (slug === "__mods__") continue;
    try {
      const res = await fetch(`${getApiBase()}/api/games/${encodeURIComponent(slug)}/servers`, {
        headers: { "user-agent": "playbound-launcher", accept: "application/json" },
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.supported && Array.isArray(data.servers) && data.servers.length > 0) {
        const entry = catalog.find((e) => e.slug === slug);
        results.push({
          slug,
          title: entry?.title || slug,
          servers: data.servers,
        });
      }
    } catch { /* skip */ }
  }
  return results;
});
ipcMain.handle("get-settings", () => {
  const settings = loadSettings();
  return {
    apiBase: settings.apiBase || DEFAULT_API_BASE,
    gamesDir: settings.gamesDir || DEFAULT_GAMES_DIR,
    connected: Boolean(settings.launcherToken),
  };
});
ipcMain.handle("save-settings", (_event, patch) => {
  const settings = loadSettings();
  if (patch.apiBase != null) settings.apiBase = patch.apiBase;
  if (patch.gamesDir != null) settings.gamesDir = patch.gamesDir;
  saveSettings(settings);
  return true;
});
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
      art: Array.isArray(entry?.art) && entry.art.length >= 2 ? entry.art : ["#312e81", "#a78bfa"],
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
  return {
    ...entry,
    installed: Boolean(info?.exe && fs.existsSync(info.exe)),
    installedPath: info?.dir || null,
    version: info?.version || null,
  };
});

/* ── window ────────────────────────────────────────────────── */

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
  win.webContents.once("did-finish-load", () => {
    const n = scanKnownInstalls();
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
    scanKnownInstalls();

    const launchUrl = process.argv.find((a) => a.startsWith(`${PROTOCOL}://`));
    const parsedLaunch = launchUrl ? parseDeepLink(launchUrl) : null;
    createWindow();
    if (parsedLaunch && (parsedLaunch.action === "auth" || parsedLaunch.action === "link")) {
      handleDeepLink(parsedLaunch);
    } else if (parsedLaunch) {
      await setContext(parsedLaunch);
      void startupLibrarySync();
    } else {
      void startupLibrarySync();
    }
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  // macOS deep-link event (Windows/Linux use argv + second-instance instead).
  app.on("open-url", (event, url) => {
    event.preventDefault();
    handleDeepLink(parseDeepLink(url));
  });
}
