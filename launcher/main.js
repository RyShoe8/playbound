const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const catalog = require("./catalog");

const PROTOCOL = "playbound";
const DEFAULT_GAMES_DIR = path.join(app.getPath("home"), "PlayBound", "Games");
const STATE_FILE = path.join(app.getPath("userData"), "installed.json");
const SETTINGS_FILE = path.join(app.getPath("userData"), "settings.json");
const DEFAULT_API_BASE = "https://playbound.club";

let win = null;
/** Auth BrowserWindow for optional sign-in (library sync). */
let authWin = null;
/** The single action this launch is for: { action: 'install'|'play'|'uninstall', slug } | null */
let context = null;

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
  // playbound://join/openra?host=1.2.3.4&port=1234&name=Server
  // playbound://auth
  // playbound://link?token=...
  try {
    const normalized = String(url).replace(/^playbound:\/\//i, "https://playbound.local/");
    const u = new URL(normalized);
    const action = u.hostname.toLowerCase();
    if (action === "auth") return { action: "auth" };
    if (action === "link") {
      return { action: "link", token: u.searchParams.get("token") || "" };
    }
    const slug = u.pathname.replace(/^\/+|\/+$/g, "").toLowerCase();
    if (!slug || !["install", "play", "uninstall", "join"].includes(action)) return null;
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

function notifyAccount() {
  if (win && !win.isDestroyed()) {
    win.webContents.send("account");
  }
}

function persistLauncherToken(token) {
  const settings = loadSettings();
  const trimmed = String(token || "").trim();
  if (!trimmed) {
    delete settings.launcherToken;
  } else {
    settings.launcherToken = trimmed;
  }
  if (!settings.apiBase) settings.apiBase = DEFAULT_API_BASE;
  saveSettings(settings);
  notifyAccount();
  return { connected: Boolean(settings.launcherToken) };
}

function closeAuthWindow() {
  if (authWin && !authWin.isDestroyed()) {
    authWin.close();
  }
  authWin = null;
}

function openAuthWindow() {
  if (authWin && !authWin.isDestroyed()) {
    authWin.focus();
    return;
  }
  authWin = new BrowserWindow({
    width: 520,
    height: 720,
    backgroundColor: "#131118",
    title: "PlayBound — Sign in",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const authUrl = `${getApiBase()}/launcher/auth`;
  authWin.loadURL(authUrl);

  const intercept = (targetUrl) => {
    if (!String(targetUrl).toLowerCase().startsWith(`${PROTOCOL}://`)) return false;
    handleDeepLink(parseDeepLink(targetUrl));
    return true;
  };

  authWin.webContents.on("will-navigate", (event, targetUrl) => {
    if (intercept(targetUrl)) event.preventDefault();
  });
  authWin.webContents.on("will-redirect", (event, targetUrl) => {
    if (intercept(targetUrl)) event.preventDefault();
  });
  authWin.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    if (intercept(targetUrl)) return { action: "deny" };
    return { action: "allow" };
  });
  authWin.on("closed", () => {
    authWin = null;
  });
}

function handleDeepLink(parsed) {
  if (!parsed) return;
  if (parsed.action === "auth") {
    openAuthWindow();
    return;
  }
  if (parsed.action === "link") {
    if (parsed.token) persistLauncherToken(parsed.token);
    closeAuthWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
    return;
  }
  setContext(parsed);
}

function setContext(parsed) {
  context = parsed;
  if (win && !win.webContents.isLoading()) {
    win.webContents.send("context", buildContextPayload());
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
  if (entry.kind === "direct-zip") {
    return { url: entry.url, name: path.basename(new URL(entry.url).pathname), version: "fixed" };
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

/* ── core actions ──────────────────────────────────────────── */

async function installGame(slug, targetDir) {
  const entry = catalog.find((e) => e.slug === slug);
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

  if (entry.kind === "github-installer") {
    sendProgress({ phase: "done" });
    await shell.openPath(downloadPath);
    return { status: "installer-opened" };
  }

  sendProgress({ phase: "extracting" });
  await fsp.rm(gameDir, { recursive: true, force: true });
  await extractZip(downloadPath, gameDir);
  await fsp.rm(downloadPath, { force: true });

  const exe = findExecutable(gameDir, entry.exeHint);
  if (!exe) throw new Error("Extracted, but no executable found");

  const state = loadState();
  state[slug] = { version: dl.version, exe, dir: gameDir, installedAt: new Date().toISOString() };
  saveState(state);
  void syncLibrary(slug, "install", dl.version);
  sendProgress({ phase: "done" });
  return { status: "installed", version: dl.version, dir: gameDir };
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
  spawn(info.exe, args, { cwd: path.dirname(info.exe), detached: true, stdio: "ignore" }).unref();
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
ipcMain.handle("play", (_event, slug, join) => playGame(slug, join || null));
ipcMain.handle("uninstall", (_event, slug) => uninstallGame(slug));
ipcMain.handle("open-external", (_event, url) => shell.openExternal(url));
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
ipcMain.handle("set-launcher-token", (_event, token) => persistLauncherToken(token));
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
  notifyAccount();
  return { connected: false };
});
ipcMain.handle("sign-in", () => {
  openAuthWindow();
  return true;
});

/* ── window ────────────────────────────────────────────────── */

function createWindow() {
  win = new BrowserWindow({
    width: 480,
    height: 560,
    resizable: false,
    backgroundColor: "#131118",
    title: "PlayBound Launcher",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
  win.webContents.once("did-finish-load", () => {
    win.webContents.send("context", buildContextPayload());
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
    ["playbound://link?token=abc", { action: "link", token: "abc" }],
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
  app.whenReady().then(() => {
    if (process.argv.includes("--test-resolve")) return testResolve();
    const installIdx = process.argv.indexOf("--test-install");
    if (installIdx !== -1) return testInstall(process.argv[installIdx + 1]);
    if (process.argv.includes("--test-deep-link")) return testDeepLink();
    const uninstallIdx = process.argv.indexOf("--test-uninstall");
    if (uninstallIdx !== -1) return testUninstall(process.argv[uninstallIdx + 1]);

    const launchUrl = process.argv.find((a) => a.startsWith(`${PROTOCOL}://`));
    const parsedLaunch = launchUrl ? parseDeepLink(launchUrl) : null;
    if (parsedLaunch && (parsedLaunch.action === "auth" || parsedLaunch.action === "link")) {
      context = null;
      createWindow();
      handleDeepLink(parsedLaunch);
    } else {
      context = parsedLaunch;
      createWindow();
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
