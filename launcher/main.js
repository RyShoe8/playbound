const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const catalog = require("./catalog");

const GAMES_DIR = path.join(app.getPath("home"), "PlayBound", "Games");
const STATE_FILE = path.join(app.getPath("userData"), "installed.json");

let win = null;

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

function sendProgress(slug, payload) {
  if (win && !win.isDestroyed()) win.webContents.send("progress", { slug, ...payload });
}

async function downloadTo(url, dest, slug) {
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
      sendProgress(slug, { phase: "downloading", received, total });
    }
  }
  await new Promise((r, j) => file.end((err) => (err ? j(err) : r())));
  sendProgress(slug, { phase: "downloading", received, total: total || received });
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

/* ── IPC ───────────────────────────────────────────────────── */

function catalogWithState() {
  const state = loadState();
  return catalog.map((entry) => ({
    ...entry,
    installed: Boolean(state[entry.slug]),
    version: state[entry.slug]?.version ?? null,
  }));
}

ipcMain.handle("catalog", () => catalogWithState());

ipcMain.handle("install", async (_event, slug) => {
  const entry = catalog.find((e) => e.slug === slug);
  if (!entry) throw new Error(`Unknown game: ${slug}`);

  if (entry.kind === "external") {
    await shell.openExternal(entry.url);
    return { status: "external" };
  }

  sendProgress(slug, { phase: "resolving" });
  const dl = await resolveDownload(entry);
  const downloadPath = path.join(GAMES_DIR, ".downloads", dl.name);
  await downloadTo(dl.url, downloadPath, slug);

  if (entry.kind === "github-installer") {
    // Setup wizards manage their own install location; hand off to the user.
    sendProgress(slug, { phase: "done" });
    await shell.openPath(downloadPath);
    return { status: "installer-opened" };
  }

  sendProgress(slug, { phase: "extracting" });
  const gameDir = path.join(GAMES_DIR, entry.slug);
  await fsp.rm(gameDir, { recursive: true, force: true });
  await extractZip(downloadPath, gameDir);
  await fsp.rm(downloadPath, { force: true });

  const exe = findExecutable(gameDir, entry.exeHint);
  if (!exe) throw new Error("Extracted, but no executable found");

  const state = loadState();
  state[slug] = { version: dl.version, exe, dir: gameDir, installedAt: new Date().toISOString() };
  saveState(state);
  sendProgress(slug, { phase: "done" });
  return { status: "installed", version: dl.version };
});

ipcMain.handle("play", async (_event, slug) => {
  const state = loadState();
  const info = state[slug];
  if (!info || !fs.existsSync(info.exe)) throw new Error("Not installed");
  spawn(info.exe, [], { cwd: path.dirname(info.exe), detached: true, stdio: "ignore" }).unref();
  return { status: "launched" };
});

ipcMain.handle("uninstall", async (_event, slug) => {
  const state = loadState();
  if (state[slug]?.dir) await fsp.rm(state[slug].dir, { recursive: true, force: true });
  delete state[slug];
  saveState(state);
  return { status: "uninstalled" };
});

ipcMain.handle("open-external", (_event, url) => shell.openExternal(url));

/* ── window ────────────────────────────────────────────────── */

function createWindow() {
  win = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 760,
    minHeight: 520,
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
    const dl = await resolveDownload(entry);
    console.log(`Resolved: ${dl.name} (${dl.version})`);
    const downloadPath = path.join(GAMES_DIR, ".downloads", dl.name);
    await downloadTo(dl.url, downloadPath, slug);
    console.log(`Downloaded: ${(fs.statSync(downloadPath).size / 1e6).toFixed(1)} MB`);
    const gameDir = path.join(GAMES_DIR, entry.slug);
    await fsp.rm(gameDir, { recursive: true, force: true });
    await extractZip(downloadPath, gameDir);
    await fsp.rm(downloadPath, { force: true });
    const exe = findExecutable(gameDir, entry.exeHint);
    console.log(`Executable: ${exe}`);
    if (!exe) throw new Error("no exe found");
    const state = loadState();
    state[slug] = { version: dl.version, exe, dir: gameDir, installedAt: new Date().toISOString() };
    saveState(state);
    console.log("Install pipeline OK");
    app.exit(0);
  } catch (err) {
    console.log(`FAIL: ${err.message}`);
    app.exit(1);
  }
}

app.whenReady().then(() => {
  if (process.argv.includes("--test-resolve")) {
    testResolve();
    return;
  }
  const installIdx = process.argv.indexOf("--test-install");
  if (installIdx !== -1) {
    testInstall(process.argv[installIdx + 1]);
    return;
  }
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
