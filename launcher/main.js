const { app, BrowserWindow, ipcMain, shell, dialog, Tray, Menu, nativeImage, screen, safeStorage } = require("electron");
const { spawn, execFile, execFileSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const net = require("net");
const os = require("os");
const bundledCatalog = require("./catalog");
const { createTelemetry } = require("./telemetry");
const Platform = require("./platform");
const GameLauncher = require("./services/GameLauncher");
const { createManagedJava } = require("./services/ManagedJava");
const { createSaveData } = require("./services/SaveData");
const saveLocations = require("./services/saveLocations");
const { createCloudSaves } = require("./services/CloudSaves");
const { createSettings } = require("./services/settings");
const { createSecurity } = require("./services/security");
const { createDeepLinks } = require("./services/deepLinks");
const { withOutboundUtm } = require("./utm");
const {
  OPENCIV3_SLUG,
  ensureDefaultDisplaySettings,
  readDisplaySettings,
  writeDisplaySettings,
  resolveGameDir,
} = require("./openciv3Display");
const { prepareOpenRaNetwork, isOpenRaFamily } = require("./services/openraNat");
const virtualLan = require("./services/virtualLan");
const {
  clientConnectArgs,
  hasClientConnectArgs,
  joinsFromInGameMenu,
} = require("./services/connectArgs");

function loadHardwareModule() {
  try {
    return require("./hardware");
  } catch (err) {
    console.warn("[hardware] module unavailable:", err?.message || err);
    return null;
  }
}

const PROTOCOL = "playbound";
const DEFAULT_GAMES_DIR = Platform.getInstallDirectory("");
const STATE_FILE = path.join(app.getPath("userData"), "installed.json");
const SETTINGS_FILE = path.join(app.getPath("userData"), "settings.json");
const CATALOG_CACHE_FILE = path.join(app.getPath("userData"), "catalog-cache.json");
const LIVE_STATS_CACHE_FILE = path.join(app.getPath("userData"), "live-stats-cache.json");
const DEFAULT_API_BASE = "https://playbound.club";
/** Stable Blob prefix used by electron-updater (must match package.json build.publish). */
const UPDATER_FEED_URL = "https://mt8u2b96lweefbpb.public.blob.vercel-storage.com/launcher/";

/*
 * Both bound here, near the constants they need, rather than further down where
 * these functions used to be declared. They were hoisted function declarations
 * and are now const bindings, so anything calling loadSettings() earlier in the
 * module would hit the temporal dead zone — keeping them at the top means that
 * cannot happen.
 *
 * Security comes first because settings needs isAllowedApiBase to resolve the
 * API origin. The dependency runs both ways (the download allowlist trusts
 * whatever host the API base names), so getApiBase is passed as a thunk and
 * read at call time rather than now.
 */
const {
  registerDownloadHostFromUrl,
  registerCatalogEntryHosts,
  isAllowedApiBase,
  assertDownloadUrl,
  assertOpenExternalUrl,
} = createSecurity({
  isPackaged: () => app.isPackaged,
  getApiBase: () => getApiBase(),
});

const { loadSettings, saveSettings, gamesRoot, getApiBase } = createSettings({
  settingsFile: SETTINGS_FILE,
  defaultGamesDir: DEFAULT_GAMES_DIR,
  defaultApiBase: DEFAULT_API_BASE,
  isAllowedApiBase,
  safeStorage,
});

const { parseDeepLink, extractLinkHandoff } = createDeepLinks(PROTOCOL);

function loadCachedCatalog() {
  try {
    if (fs.existsSync(CATALOG_CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CATALOG_CACHE_FILE, "utf-8"));
      if (Array.isArray(data) && data.length > 0) {
        return data;
      }
    }
  } catch (err) {
    console.warn("[catalog-cache] Failed to read cached catalog:", err?.message || err);
  }
  return null;
}

function saveCatalogCache(entries) {
  try {
    if (Array.isArray(entries) && entries.length > 0) {
      fs.writeFileSync(CATALOG_CACHE_FILE, JSON.stringify(entries, null, 2), "utf-8");
    }
  } catch (err) {
    console.warn("[catalog-cache] Failed to write cached catalog:", err?.message || err);
  }
}

/** Mutable catalog: bundled fallback, overlaid with cached/remote entries from the site API. */
let catalog = (() => {
  const cached = loadCachedCatalog();
  const bySlug = new Map(bundledCatalog.map((e) => [e.slug, { ...e }]));
  if (cached) {
    for (const entry of cached) {
      if (!entry?.slug) continue;
      bySlug.set(entry.slug, { ...(bySlug.get(entry.slug) || {}), ...entry });
    }
  }
  const merged = [...bySlug.values()];
  for (const entry of merged) {
    registerCatalogEntryHosts(entry);
  }
  return merged;
})();

/**
 * @param {string} raw
 * @param {{ campaign?: string, content?: string, skipUtm?: boolean } | undefined} opts
 */
async function safeOpenExternal(raw, opts) {
  let url = assertOpenExternalUrl(raw);
  if (!opts?.skipUtm) {
    url = withOutboundUtm(url, {
      medium: "launcher",
      campaign: opts?.campaign || "launcher",
      content: opts?.content,
    });
  }
  await shell.openExternal(url);
  return true;
}

/**
 * Whether Steam is installed on this machine.
 *
 * Checked so a steam:// deep link is only ever handed to an OS that can
 * actually resolve it — without Steam, the protocol is unregistered and the
 * user gets a "no app associated" dialog instead of a page they can read.
 * Cached because the answer cannot change while the app is running.
 */
let _steamInstalled = null;
function isSteamInstalled() {
  if (_steamInstalled !== null) return _steamInstalled;
  _steamInstalled = false;
  try {
    if (process.platform === "win32") {
      const candidates = [
        path.join(process.env["ProgramFiles(x86)"] || "", "Steam", "steam.exe"),
        path.join(process.env.PROGRAMFILES || "", "Steam", "steam.exe"),
      ];
      _steamInstalled = candidates.some((p) => p && fs.existsSync(p));
    } else if (process.platform === "darwin") {
      _steamInstalled = fs.existsSync("/Applications/Steam.app");
    } else {
      const home = process.env.HOME || "";
      _steamInstalled = [
        path.join(home, ".steam"),
        path.join(home, ".local", "share", "Steam"),
      ].some((p) => p && fs.existsSync(p));
    }
  } catch {
    _steamInstalled = false;
  }
  return _steamInstalled;
}

/**
 * Whether the Discord desktop app is installed.
 *
 * Same reasoning as isSteamInstalled: `discord://` is only worth handing to the
 * OS when something is registered to answer it, otherwise the user gets a "no
 * app associated with this link" dialog instead of their party's voice channel.
 * Cached — this cannot change while the launcher is running.
 */
let _discordInstalled = null;
function isDiscordInstalled() {
  if (_discordInstalled !== null) return _discordInstalled;
  _discordInstalled = false;
  try {
    if (process.platform === "win32") {
      const local = process.env.LOCALAPPDATA || "";
      // Discord, PTB and Canary all register the discord:// scheme.
      _discordInstalled = ["Discord", "DiscordPTB", "DiscordCanary"].some(
        (dir) => local && fs.existsSync(path.join(local, dir, "Update.exe"))
      );
    } else if (process.platform === "darwin") {
      _discordInstalled = [
        "/Applications/Discord.app",
        "/Applications/Discord PTB.app",
        "/Applications/Discord Canary.app",
      ].some((p) => fs.existsSync(p));
    } else {
      const home = process.env.HOME || "";
      _discordInstalled = [
        "/usr/bin/discord",
        "/usr/share/discord",
        "/snap/bin/discord",
        "/var/lib/flatpak/app/com.discordapp.Discord",
        path.join(home, ".local", "share", "flatpak", "app", "com.discordapp.Discord"),
      ].some((p) => p && fs.existsSync(p));
    }
  } catch {
    _discordInstalled = false;
  }
  return _discordInstalled;
}

/** True for Discord's own web hosts, so "open Discord" can prefer the app. */
function isDiscordUrl(raw) {
  try {
    const host = new URL(String(raw || "")).hostname.replace(/^www\./, "").toLowerCase();
    return host === "discord.com" || host === "discord.gg" || host === "discordapp.com";
  } catch {
    return false;
  }
}

/** Invite code out of a discord.gg / discord.com/invite URL. */
function parseDiscordInviteCode(inviteUrl) {
  try {
    const u = new URL(String(inviteUrl || ""));
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    const parts = u.pathname.split("/").filter(Boolean);
    let code = null;
    if (host === "discord.gg" || host === "discordapp.com") code = parts[0] || null;
    else if (host === "discord.com" && parts[0] === "invite") code = parts[1] || null;
    // Only ever build a deep link from a plain invite code, so nothing from a
    // URL can smuggle its way into the discord:// we hand the OS.
    return code && /^[A-Za-z0-9_-]{1,32}$/.test(code) ? code : null;
  } catch {
    return null;
  }
}

/** Steam's own install directory, or null. */
function steamBaseDir() {
  try {
    if (process.platform === "win32") {
      const candidates = [
        path.join(process.env["ProgramFiles(x86)"] || "", "Steam"),
        path.join(process.env.PROGRAMFILES || "", "Steam"),
      ];
      return candidates.find((p) => p && fs.existsSync(path.join(p, "steam.exe"))) || null;
    }
    const home = process.env.HOME || "";
    if (process.platform === "darwin") {
      const mac = path.join(home, "Library", "Application Support", "Steam");
      return fs.existsSync(mac) ? mac : null;
    }
    return (
      [path.join(home, ".local", "share", "Steam"), path.join(home, ".steam", "steam")].find((p) =>
        fs.existsSync(p)
      ) || null
    );
  } catch {
    return null;
  }
}

/**
 * Every Steam library folder on this machine.
 *
 * Steam lets users put libraries on any drive, and the majority of gaming PCs
 * do exactly that. Without this, a game installed to D:\SteamLibrary sits
 * outside allowedExecutableRoots() and Play fails with "Executable path is
 * outside allowed install locations" even though the install is perfectly
 * valid — so this is read rather than assuming the default Program Files path.
 *
 * libraryfolders.vdf is Valve's own format; only the "path" entries are
 * needed, so this scrapes those rather than pulling in a VDF parser.
 * Cached — libraries do not change while the launcher is running.
 */
let _steamLibraryDirs = null;
function steamLibraryDirs() {
  if (_steamLibraryDirs) return _steamLibraryDirs;
  const dirs = [];
  const base = steamBaseDir();
  if (base) {
    dirs.push(base);
    // Current Steam writes steamapps/libraryfolders.vdf; older builds used
    // config/libraryfolders.vdf. Read whichever exists.
    for (const rel of [
      ["steamapps", "libraryfolders.vdf"],
      ["config", "libraryfolders.vdf"],
    ]) {
      const vdf = path.join(base, ...rel);
      try {
        if (!fs.existsSync(vdf)) continue;
        const text = fs.readFileSync(vdf, "utf8");
        for (const m of text.matchAll(/"path"\s*"([^"]+)"/gi)) {
          // VDF escapes backslashes.
          const p = m[1].replace(/\\\\/g, "\\");
          if (p && fs.existsSync(p)) dirs.push(p);
        }
      } catch {
        /* unreadable library index — fall back to what we have */
      }
    }
  }
  _steamLibraryDirs = [...new Set(dirs.map((d) => normalizeFsPath(d)))];
  return _steamLibraryDirs;
}

/** `<library>/steamapps/common` for every library, where games actually land. */
function steamCommonDirs() {
  return steamLibraryDirs().map((d) => path.join(d, "steamapps", "common"));
}

/**
 * Turn a Steam *store page* URL into a Steam client deep link.
 *
 * Steam depots can only be fetched by the Steam client, so these titles can
 * never be a true PlayBound one-click install. The next best thing is to skip
 * the web browser entirely and land the user inside Steam.
 *
 * The verb is "store", not "install", because steam://install/<appid> requires
 * an existing license: Steam looks the app up in the user's library and, when
 * it isn't there, does nothing at all — no dialog, no error. Every Steam title
 * PlayBound lists is free-to-play, and a free game confers no license until it
 * has been added to the library, so for the common case (player has never
 * claimed it) the install verb is silently inert. HoloCure's multiplayer
 * edition is where this surfaced: the button appeared to do nothing.
 *
 * steam://store/<appid> works either way — it opens the in-client store page,
 * whose button reads "Play Game" for an unclaimed free title (which claims and
 * installs it) and "Install" for one already owned.
 *
 * Returns null when Steam is absent or the URL is not a Steam store link, in
 * which case the caller falls back to opening the page normally.
 */
function steamDeepLinkFor(rawUrl) {
  if (!isSteamInstalled()) return null;
  try {
    const u = new URL(String(rawUrl || ""));
    if (!/(^|\.)steampowered\.com$/i.test(u.hostname)) return null;
    const m = u.pathname.match(/\/app\/(\d+)/);
    if (!m) return null;
    return `steam://store/${m[1]}`;
  } catch {
    return null;
  }
}

function normalizeFsPath(p) {
  return path.resolve(String(p || ""));
}

function pathUnderRoot(candidate, root) {
  const full = normalizeFsPath(candidate);
  const base = normalizeFsPath(root);
  const rel = path.relative(base, full);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** Roots where catalog knownExePaths / located installs may live. */
function allowedExecutableRoots() {
  const roots = [];
  try {
    roots.push(loadSettings().gamesDir || DEFAULT_GAMES_DIR);
  } catch {
    roots.push(DEFAULT_GAMES_DIR);
  }
  /*
   * Steam libraries count as trusted roots. They are frequently on a second
   * drive, outside every env-var root below, so without this a legitimate
   * Steam install is refused — and the drive scan was quietly adopting those
   * same paths anyway by calling markInstalledFromExe without checking.
   */
  for (const steamRoot of steamLibraryRoots()) roots.push(steamRoot);
  if (process.platform === "win32") {
    for (const key of ["LOCALAPPDATA", "APPDATA", "PROGRAMFILES", "ProgramFiles(x86)", "USERPROFILE"]) {
      if (process.env[key]) roots.push(process.env[key]);
    }
  } else {
    const home = app.getPath("home");
    roots.push(home);
    roots.push(path.join(home, "Applications"));
    roots.push(path.join(home, "PlayBound"));
    roots.push("/Applications");
    if (process.platform === "darwin") {
      roots.push(path.join(home, "Library", "Application Support"));
    }
  }
  // Steam libraries are frequently on a second drive, which is under none of
  // the roots above. Without these, Play on any Steam-installed catalog game
  // fails with "outside allowed install locations" despite a valid install.
  try {
    roots.push(...steamCommonDirs());
  } catch {
    /* no Steam / unreadable library index */
  }
  try {
    roots.push(app.getPath("userData"));
  } catch {
    /* ignore */
  }
  return roots.filter(Boolean);
}

/**
 * Every Steam library root on this machine, read from libraryfolders.vdf.
 *
 * Steam lets people put libraries on any drive, and catalog knownExePaths can
 * only ever name the default one. HoloCure sat in D:\SteamLibrary, so all three
 * of its known paths missed and detection fell through to the full-drive scan —
 * 50 seconds of grace followed by a BFS across every fixed disk, for a game
 * whose location Steam records in a text file.
 *
 * Cached: libraries cannot appear while the app is running without Steam
 * restarting too.
 */
let _steamLibraryRoots = null;
function steamLibraryRoots() {
  if (_steamLibraryRoots) return _steamLibraryRoots;
  const roots = [];
  const bases = [];
  try {
    if (process.platform === "win32") {
      for (const key of ["ProgramFiles(x86)", "PROGRAMFILES"]) {
        if (process.env[key]) bases.push(path.join(process.env[key], "Steam"));
      }
    } else if (process.platform === "darwin") {
      bases.push(path.join(app.getPath("home"), "Library", "Application Support", "Steam"));
    } else {
      const home = app.getPath("home");
      bases.push(path.join(home, ".steam", "steam"), path.join(home, ".local", "share", "Steam"));
    }
    for (const base of bases) {
      if (!base || !fs.existsSync(base)) continue;
      if (!roots.includes(base)) roots.push(base);
      try {
        const vdf = fs.readFileSync(
          path.join(base, "steamapps", "libraryfolders.vdf"),
          "utf8"
        );
        // Entries look like:  "path"    "D:\\SteamLibrary"
        for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/gi)) {
          const p = String(m[1] || "").replace(/\\\\/g, "\\").trim();
          if (p && fs.existsSync(p) && !roots.includes(p)) roots.push(p);
        }
      } catch {
        /* no libraryfolders.vdf — the base root alone is still useful */
      }
    }
  } catch {
    /* treat an unreadable Steam install as no libraries */
  }
  _steamLibraryRoots = roots;
  return roots;
}

/**
 * Re-resolve a catalog's Steam knownExePaths against every library on disk.
 *
 * Takes the `steamapps/common/…` tail off each known path and tries it under
 * each real library root, so a game installed to a second drive is found
 * immediately instead of by brute force.
 */
function findInSteamLibraries(entry) {
  const tails = [];
  for (const raw of entry?.knownExePaths || []) {
    const m = String(raw).match(/steamapps[/\\]common[/\\](.+)$/i);
    if (m) tails.push(m[1]);
  }
  if (!tails.length) return null;
  for (const root of steamLibraryRoots()) {
    for (const tail of tails) {
      const full = path.join(root, "steamapps", "common", tail);
      if (fs.existsSync(full)) return full;
    }
  }
  return null;
}

function isAllowedExecutablePath(exePath) {
  if (!exePath) return false;
  const full = normalizeFsPath(exePath);
  if (full.includes("\0")) return false;
  return allowedExecutableRoots().some((root) => pathUnderRoot(full, root));
}

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
/** Linked site account is role=admin — uses unsigned admin.yml updater channel. */
let linkedCanUseAdminChannel = false;
/** Original NSIS signature verifier — restored when leaving the admin channel. */
let defaultVerifyUpdateCodeSignature = null;

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
  for (const [slug, raw] of Object.entries(state)) {
    if (slug === "__mods__") continue;
    if (!raw || typeof raw !== "object") continue;
    const game = ensureGameInstallRecord(raw);
    const editions = listEditionEntries(game);
    const listed = Boolean(
      playableExePath(game) || game.pending || game.dir || editions.length
    );
    if (!listed) continue;
    installs.push({
      slug,
      ...(game.version ? { version: String(game.version) } : {}),
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

  try {
    const res = await fetch(`${getApiBase()}/api/library/sync/batch`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        "user-agent": "playbound-launcher",
      },
      body: JSON.stringify({ installs, modInstalls, prune: true }),
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
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 401) return { valid: false, canUseAdminChannel: false };
    // Don't wipe token (or admin channel) on transient errors.
    if (!res.ok) return { valid: true, canUseAdminChannel: linkedCanUseAdminChannel, transient: true };
    const data = await res.json();
    return {
      valid: data.valid !== false,
      userId: data.userId || null,
      email: data.email || null,
      username: data.username || null,
      canUseAdminChannel: Boolean(data.canUseAdminChannel === true || data.isAdmin === true || data.isTester === true || data.role === "admin"),
    };
  } catch {
    return { valid: true, canUseAdminChannel: linkedCanUseAdminChannel, transient: true };
  }
}

function getAutoUpdater() {
  try {
    return require("electron-updater").autoUpdater;
  } catch {
    return null;
  }
}

/**
 * Site admins may poll unsigned admin.yml (default) or signed latest.yml via Settings.
 * Non-admins always stay on signed latest.yml.
 * Signature verify is skipped only on the admin channel so a signed install can
 * still accept unsigned test builds while linked as an admin.
 */
/**
 * Order two dotted versions. Returns >0 when `a` is newer than `b`.
 *
 * Deliberately small: launcher versions are plain numeric triples, and the
 * only question asked of this is "is the channel offering something newer",
 * which string comparison gets wrong the moment a component reaches double
 * digits ("0.1.9" > "0.1.10" as text).
 */
function compareVersions(a, b) {
  const parse = (v) =>
    String(v || "")
      .split(/[.+-]/)
      .map((n) => parseInt(n, 10))
      .filter((n) => Number.isFinite(n));
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function getEffectiveUpdateChannel() {
  if (!linkedCanUseAdminChannel) return "latest";
  const pref = loadSettings().updateChannel;
  return pref === "latest" ? "latest" : "admin";
}

function applyUpdaterChannel() {
  if (!app.isPackaged) return;
  const autoUpdater = getAutoUpdater();
  if (!autoUpdater) return;
  const channel = getEffectiveUpdateChannel();
  const skipVerify = channel === "admin";
  autoUpdater.channel = channel;
  autoUpdater.allowPrerelease = skipVerify;
  try {
    if (!defaultVerifyUpdateCodeSignature && typeof autoUpdater.verifyUpdateCodeSignature === "function") {
      defaultVerifyUpdateCodeSignature = autoUpdater.verifyUpdateCodeSignature.bind(autoUpdater);
    }
    // Setter ignores falsy values — must pass a no-op verifier that returns null (OK).
    if (skipVerify) {
      autoUpdater.verifyUpdateCodeSignature = async () => null;
    } else if (defaultVerifyUpdateCodeSignature) {
      autoUpdater.verifyUpdateCodeSignature = defaultVerifyUpdateCodeSignature;
    }
  } catch (err) {
    console.warn("[updater] could not configure signature verify:", err?.message || err);
  }
  console.log(`[updater] channel=${channel} verifySignature=${skipVerify ? "off" : "on"}`);
}

function setLinkedCanUseAdminChannel(next) {
  linkedCanUseAdminChannel = Boolean(next);
  applyUpdaterChannel();
}

async function refreshAdminUpdateChannel() {
  const settings = loadSettings();
  if (!settings.launcherToken) {
    setLinkedCanUseAdminChannel(false);
    return false;
  }
  const check = await validateLauncherToken(settings.launcherToken);
  if (!check.valid) {
    setLinkedCanUseAdminChannel(false);
    return false;
  }
  setLinkedCanUseAdminChannel(Boolean(check.canUseAdminChannel));
  return Boolean(check.canUseAdminChannel);
}

function clearLocalToken(message) {
  const settings = loadSettings();
  delete settings.launcherToken;
  saveSettings(settings);
  setLinkedCanUseAdminChannel(false);
  notifyAccount({
    connected: false,
    message: message || "Session expired — sign in again from Settings.",
  });
}

async function exchangeHandoffCode(code) {
  const trimmed = String(code || "").trim();
  if (!trimmed) return { ok: false, error: "missing_code" };
  try {
    const res = await fetch(`${getApiBase()}/api/library/token/exchange`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        accept: "application/json",
        "user-agent": `playbound-launcher/${app.getVersion()} (${process.platform})`,
      },
      body: JSON.stringify({ code: trimmed }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      return { ok: false, error: res.status === 401 ? "unauthorized" : `http_${res.status}` };
    }
    const data = await res.json();
    if (!data?.token) return { ok: false, error: "no_token" };
    return { ok: true, token: String(data.token) };
  } catch (err) {
    console.warn("Handoff exchange failed:", err?.message || err);
    return { ok: false, error: "network" };
  }
}

async function connectWithHandoff(parsed) {
  if (parsed?.code) {
    const exchanged = await exchangeHandoffCode(parsed.code);
    if (!exchanged.ok) {
      clearLocalToken("Link expired — sign in again from Settings.");
      return { connected: false, synced: 0, skipped: [], error: exchanged.error };
    }
    return connectWithToken(exchanged.token);
  }
  return { connected: false, synced: 0, skipped: [], error: "missing_code" };
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
  setLinkedCanUseAdminChannel(Boolean(check.canUseAdminChannel));
  notifyAccount({
    connected: true,
    synced,
    skipped,
    message,
    email: check.email,
    username: check.username,
    canUseAdminChannel: linkedCanUseAdminChannel,
  });
  // Admins get testing titles once the bearer is present.
  void refreshRemoteCatalog();
  void pullCompatibilityPreference();
  void syncHardwareProfile({ quiet: true });
  startLauncherPresenceLoop();
  return {
    connected: true,
    synced,
    skipped,
    error,
    email: check.email,
    username: check.username,
    canUseAdminChannel: linkedCanUseAdminChannel,
  };
}

async function syncLibraryNow({ quiet = false } = {}) {
  const settings = loadSettings();
  const token = settings.launcherToken;
  if (!token) {
    setLinkedCanUseAdminChannel(false);
    if (!quiet) {
      notifyAccount({ connected: false, message: "Sign in to sync your library.", canUseAdminChannel: false });
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

  setLinkedCanUseAdminChannel(Boolean(check.canUseAdminChannel));
  startLauncherPresenceLoop();

  if (!quiet) {
    notifyAccount({
      connected: true,
      message: "Syncing installs…",
      email: check.email,
      username: check.username,
      canUseAdminChannel: linkedCanUseAdminChannel,
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
      canUseAdminChannel: linkedCanUseAdminChannel,
    });
  }
  return {
    connected: true,
    synced,
    skipped,
    error,
    email: check.email,
    username: check.username,
    canUseAdminChannel: linkedCanUseAdminChannel,
  };
}

async function startupLibrarySync() {
  await syncLibraryNow({ quiet: true });
  void syncHardwareProfile({ quiet: true, force: false });
}

function scheduleLibrarySync() {
  if (librarySyncTimer) return;
  librarySyncTimer = setInterval(() => {
    void syncLibraryNow({ quiet: true });
  }, LIBRARY_SYNC_INTERVAL_MS);
}

function clearAuthWindowSecrets() {
  if (!authWin || authWin.isDestroyed()) return;
  try {
    authWin.webContents.clearHistory();
  } catch {
    /* ignore */
  }
  try {
    void authWin.loadURL("about:blank");
  } catch {
    /* ignore */
  }
}

function openAuthWindow(targetUrl) {
  const authUrl = targetUrl || `${getApiBase()}/launcher/auth?from=app`;
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
      const handoff = extractLinkHandoff(url);
      if (!handoff) return false;
      clearAuthWindowSecrets();
      void connectWithHandoff(handoff).finally(() => {
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
    void safeOpenExternal(authUrl).catch((e) => console.warn(e?.message || e));
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
  const hw = await syncHardwareProfile({ quiet: true });
  if (hw?.success) {
    notifyAccount({
      connected: true,
      message: "Library and hardware profile synced.",
    });
    // Focus Settings so "Your Gaming PC" is obvious after a web compat CTA.
    if (win && !win.isDestroyed()) {
      win.webContents.send("navigate", { view: "settings" });
    }
  }
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
    if (parsed.code) {
      void connectWithHandoff(parsed);
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
    void uninstallGameFromDeepLink(parsed.slug, parsed.editionSlug || null).catch((err) => {
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
    void uninstallModFromDeepLink(parsed.slug).catch((err) => {
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

function afterUiReady(fn) {
  if (!win || win.isDestroyed()) return;
  if (!win.webContents.isLoading()) {
    fn();
    return;
  }
  win.webContents.once("did-finish-load", () => {
    try {
      fn();
    } catch (err) {
      console.warn("afterUiReady failed:", err?.message || err);
    }
  });
}

async function fetchModInstall(slug) {
  const res = await fetch(`${getApiBase()}/api/mods/${encodeURIComponent(slug)}`, {
    headers: { "user-agent": "playbound-launcher", accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Couldn't load mod (${res.status})`);
  const data = await res.json();
  if (!data?.install) throw new Error("Invalid mod response");
  // Game catalog entries and edition install configs already authorize their
  // own download hosts this way; mods did not, so every new mod host needed a
  // hardcoded allowlist entry and therefore a fresh signed launcher release.
  // The payload comes from our own API over an allowlisted API base, which is
  // the same trust boundary the catalog and edition paths rely on.
  registerDownloadHostFromUrl(data.install.url);
  registerDownloadHostFromUrl(data.install.directUrl);
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

const DEFAULT_EDITION_SLUG = "official";

/**
 * Ensure a game install record has an editions map. Legacy flat entries
 * (exe/dir at the top level) migrate into editions[editionSlug].
 */
function ensureGameInstallRecord(raw) {
  if (!raw || typeof raw !== "object") {
    return { editions: {} };
  }
  const game = { ...raw };
  if (!game.editions || typeof game.editions !== "object") {
    game.editions = {};
    if (game.exe || game.dir || game.pending) {
      const ed = game.editionSlug || DEFAULT_EDITION_SLUG;
      game.editions[ed] = {
        version: game.version || null,
        exe: game.exe || null,
        dir: game.dir || null,
        installedAt: game.installedAt || null,
        editionSlug: ed,
        editionName: game.editionName || "Official",
        editionType: game.editionType || "official",
        pending: Boolean(game.pending),
        scanning: Boolean(game.scanning),
        connectArgs: Array.isArray(game.connectArgs) ? game.connectArgs : undefined,
      };
    }
  }
  return game;
}

function listEditionEntries(game) {
  const g = ensureGameInstallRecord(game);
  return Object.values(g.editions || {}).filter((e) => e && typeof e === "object");
}

function findJarInDir(dir) {
  if (!dir || !fs.existsSync(dir)) return null;
  try {
    const names = fs.readdirSync(dir);
    const jar = names.find((n) => /\.jar$/i.test(n) && !/unins|setup|install/i.test(n));
    return jar ? path.join(dir, jar) : null;
  } catch {
    return null;
  }
}

/** .exe, .jar, or a folder that contains a .jar — all count as Play-ready. */
function playableExePath(info) {
  if (info?.exe && fs.existsSync(info.exe)) return info.exe;
  return findJarInDir(info?.dir) || null;
}

function pickPrimaryEdition(game) {
  const editions = listEditionEntries(game);
  const ready = editions.filter((e) => playableExePath(e));
  ready.sort((a, b) => String(b.installedAt || "").localeCompare(String(a.installedAt || "")));
  if (ready.length) return ready[0];
  const pending = editions.find((e) => e.pending);
  return pending || null;
}

/** Keep flat summary fields in sync for older callers. */
function syncGameInstallSummary(game) {
  const primary = pickPrimaryEdition(game);
  if (!primary) {
    delete game.exe;
    delete game.dir;
    delete game.version;
    delete game.editionSlug;
    delete game.editionName;
    delete game.editionType;
    delete game.pending;
    delete game.scanning;
    delete game.connectArgs;
    return game;
  }
  game.version = primary.version || null;
  game.exe = playableExePath(primary) || primary.exe || null;
  game.dir = primary.dir || null;
  game.installedAt = primary.installedAt || null;
  game.editionSlug = primary.editionSlug || DEFAULT_EDITION_SLUG;
  game.editionName = primary.editionName || "Official";
  game.editionType = primary.editionType || "official";
  game.pending = Boolean(primary.pending) && !playableExePath(primary);
  game.scanning = Boolean(primary.scanning);
  if (Array.isArray(primary.connectArgs)) game.connectArgs = primary.connectArgs;
  else delete game.connectArgs;
  return game;
}

function getEditionRecord(state, slug, editionSlug) {
  const game = ensureGameInstallRecord(state[slug]);
  const ed = editionSlug || game.editionSlug || DEFAULT_EDITION_SLUG;
  return game.editions?.[ed] || null;
}

function editionInstallDir(slug, editionSlug) {
  return path.join(gamesRoot(), slug, editionSlug || DEFAULT_EDITION_SLUG);
}

function installedEditionsPayload(slug) {
  const state = loadState();
  const game = ensureGameInstallRecord(state[slug]);
  return listEditionEntries(game)
    .filter((e) => playableExePath(e) || e.pending)
    .map((e) => {
      const exe = playableExePath(e);
      return {
        editionSlug: e.editionSlug || DEFAULT_EDITION_SLUG,
        editionName: e.editionName || "Official",
        editionType: e.editionType || "official",
        version: e.version || null,
        dir: e.dir || null,
        exe,
        pending: Boolean(e.pending) && !exe,
        connectArgs: Array.isArray(e.connectArgs) ? e.connectArgs : null,
      };
    });
}

/* loadSettings / saveSettings / gamesRoot / getApiBase now live in
 * services/settings.js and are bound near the top of this file. */

/**
 * Main-process analytics. Declared after its dependencies exist because the
 * helpers are injected rather than imported — see telemetry.js.
 */
const telemetry = createTelemetry({
  getApiBase,
  loadSettings,
  saveSettings,
  getAppVersion: () => app.getVersion(),
  getAuthHeaders: (extra = {}) => {
    const settings = loadSettings();
    const headers = { ...extra };
    if (settings.launcherToken) {
      headers.authorization = `Bearer ${settings.launcherToken}`;
    }
    return headers;
  },
});

/** Avoid double-reporting crashes bootstrap already wrote. */
let mainProcessErrorReported = false;

function reportMainProcessError(err, phase = "main") {
  if (mainProcessErrorReported) return;
  mainProcessErrorReported = true;
  const message = err?.message || String(err || "Unknown error");
  const code =
    err?.code === "MODULE_NOT_FOUND" || /Cannot find module/i.test(message)
      ? "MODULE_NOT_FOUND"
      : err?.code || "UNCAUGHT_EXCEPTION";
  void telemetry.error({
    code,
    message: String(message).slice(0, 1000),
    source: "launcher",
    phase,
  });
}

process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
  reportMainProcessError(err, "uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  console.error("[unhandledRejection]", err);
  reportMainProcessError(err, "unhandledRejection");
});

/** Replay a crash that happened before telemetry was available (offline/startup). */
async function flushLastCrashReport() {
  const file = path.join(app.getPath("userData"), "last-crash.json");
  try {
    if (!fs.existsSync(file)) return;
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    const code = raw?.code || "UNCAUGHT_EXCEPTION";
    const message = String(raw?.message || "Previous launcher crash").slice(0, 1000);
    void telemetry.error({
      code,
      message,
      source: "launcher",
      phase: raw?.phase ? `replay:${raw.phase}` : "replay",
    });
    fs.unlinkSync(file);
  } catch (err) {
    console.warn("[telemetry] flushLastCrashReport failed:", err?.message || err);
  }
}

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
    registerDownloadHostFromUrl(cfg.url);
    registerDownloadHostFromUrl(cfg.overlayUrl);
    // Mod-loader payloads are downloaded later (at install and again as a
    // launch-time repair), long after the catalog fetch that would normally
    // authorize their hosts, so register them up front.
    for (const file of cfg.modLoader?.files || []) {
      registerDownloadHostFromUrl(file?.url);
    }
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
      registryTitles: Array.isArray(cfg.registryTitles) ? cfg.registryTitles : undefined,
      installRoot: cfg.installRoot || undefined,
      connectArgs: Array.isArray(cfg.connectArgs) ? cfg.connectArgs : undefined,
      note: cfg.note || undefined,
      postInstallDiscord: cfg.postInstallDiscord || undefined,
      postInstallEqw: Boolean(cfg.postInstallEqw),
      overlayUrl: cfg.overlayUrl || undefined,
      overlayFileName: cfg.overlayFileName || undefined,
      requiresBaseDir: Boolean(cfg.requiresBaseDir),
      checksumMd5: cfg.checksumMd5 || cfg.md5 || undefined,
      modLoader: cfg.modLoader || undefined,
      art: Array.isArray(edition.art) ? edition.art : ["#312e81", "#a78bfa"],
      coverImage: edition.coverImage || null,
      approxSize: edition.sizeMB ? `~${edition.sizeMB} MB` : "",
      editionSlug: edition.editionSlug,
      editionName: edition.editionName,
      editionType: edition.editionType || "official",
      editionId: edition.editionId,
      editionLinks: edition.links || null,
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

let lastCatalogRefreshTime = 0;
const CATALOG_TTL_MS = 5 * 60 * 1000;

/** List-view catalog rows — no install URLs, exe paths, or registry keys. */
function mapCatalogList(entries = catalog) {
  return (Array.isArray(entries) ? entries : []).map((e) => ({
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
    isMultiplayer: e.isMultiplayer ?? Boolean(e.multiplayer),
    platforms: Array.isArray(e.platforms) ? e.platforms : [],
    browserPlayable: Boolean(e.browserPlayable),
    steamDeck: Boolean(e.steamDeck),
    createdAt: e.createdAt || null,
    testing: Boolean(e.testing),
    status: e.status || null,
  }));
}

function broadcastCatalogUpdated() {
  if (win && !win.isDestroyed()) {
    win.webContents.send("catalog-updated", mapCatalogList());
  }
}

function listRecentlyPlayed() {
  const settings = loadSettings();
  const recent = settings.recentlyPlayed || {};
  const state = loadState();
  const games = [];
  for (const [slug, data] of Object.entries(recent)) {
    const info = state[slug];
    if (!info || !info.exe || !fs.existsSync(info.exe)) continue;
    const entry = catalog.find((e) => e.slug === slug);
    /*
     * Spread the whole catalog entry rather than hand-picking fields. The old
     * list left out genres, tags, approxSize and kind, so Recently Played cards
     * on the home view rendered with no category chips, no size on the download
     * badge, and no Play badge for browser titles — visibly different from the
     * identical-in-every-other-respect cards on the Games page. Any field the
     * card learns to use in future is carried automatically now.
     */
    games.push({
      ...(entry || {}),
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
}

function buildSettingsPayload() {
  const settings = loadSettings();
  const updateChannel = getEffectiveUpdateChannel();
  const updateChannelPref =
    settings.updateChannel === "latest" || settings.updateChannel === "admin"
      ? settings.updateChannel
      : "admin";
  return {
    apiBase: settings.apiBase || DEFAULT_API_BASE,
    gamesDir: settings.gamesDir || DEFAULT_GAMES_DIR,
    connected: Boolean(settings.launcherToken),
    version: app.getVersion(),
    packaged: app.isPackaged,
    compatibilityFilter:
      settings.compatibilityFilter === "all" ? "all" : "compatible",
    canUseAdminChannel: linkedCanUseAdminChannel,
    updateChannel,
    updateChannelPref: linkedCanUseAdminChannel ? updateChannelPref : "latest",
    javaRuntime: managedJava.status(),
  };
}

function buildBootstrapAccount() {
  const settings = loadSettings();
  return {
    connected: Boolean(settings.launcherToken),
    apiBase: getApiBase(),
    canUseAdminChannel: linkedCanUseAdminChannel,
  };
}

async function refreshRemoteCatalog(force = false) {
  if (!force && Date.now() - lastCatalogRefreshTime < 15_000) {
    return;
  }
  try {
    /*
     * A deadline, because there is a working catalog on disk already. Without
     * one this waits on undici's default, which is long enough that a captive
     * portal or a dead connection keeps the catalog stale for minutes; ten
     * seconds is far past a healthy response and well short of that.
     */
    const res = await fetch(`${getApiBase()}/api/launcher/catalog`, {
      headers: launcherApiHeaders(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const remote = Array.isArray(data.games) ? data.games : [];
    if (remote.length === 0) return;
    const bySlug = new Map(bundledCatalog.map((e) => [e.slug, { ...e }]));
    const cached = loadCachedCatalog();
    if (cached) {
      for (const entry of cached) {
        if (!entry?.slug) continue;
        bySlug.set(entry.slug, { ...(bySlug.get(entry.slug) || {}), ...entry });
      }
    }
    for (const entry of remote) {
      if (!entry?.slug) continue;
      bySlug.set(entry.slug, { ...(bySlug.get(entry.slug) || {}), ...entry });
      registerCatalogEntryHosts(entry);
    }
    catalog = [...bySlug.values()];
    lastCatalogRefreshTime = Date.now();
    saveCatalogCache(catalog);
    console.log(`Remote catalog: ${remote.length} game(s) merged (${catalog.length} total).`);
    broadcastCatalogUpdated();
  } catch (err) {
    console.warn("Remote catalog refresh failed:", err.message || err);
  }
}

async function ensureCatalogEntry(slug) {
  const existing = catalog.find((e) => e.slug === slug);
  if (existing && existing.kind && existing.kind !== "external") {
    registerCatalogEntryHosts(existing);
    return existing;
  }
  try {
    const res = await fetch(`${getApiBase()}/api/games/${encodeURIComponent(slug)}/install`, {
      headers: launcherApiHeaders(),
    });
    if (!res.ok) return existing || null;
    const entry = await res.json();
    if (!entry?.slug) return existing || null;
    registerCatalogEntryHosts(entry);
    catalog = [...catalog.filter((e) => e.slug !== entry.slug), entry];
    saveCatalogCache(catalog);
    return entry;
  } catch (err) {
    console.warn(`ensureCatalogEntry(${slug}) failed:`, err.message || err);
    return existing || null;
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
      defaultDir: baseSlug ? path.join(gamesRoot(), baseSlug) : null,
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
    /*
     * Mods the link asked for alongside the game — the site's party
     * compatibility button sends the host's mod list this way so a member can
     * match their setup in one click. Already validated by parseDeepLink.
     */
    modSlugs: Array.isArray(context.modSlugs) ? context.modSlugs : [],
    installed: Boolean(installed),
    installedPath: installed?.dir ?? null,
    defaultDir: path.join(gamesRoot(), entry.slug),
    join: context.action === "join"
      ? { host: context.host || "", port: context.port || 0, name: context.name || "" }
      : null,
  };
}

/* ── release resolution ────────────────────────────────────── */

/**
 * Prefer a GitHub release asset that matches the host CPU.
 * Deprioritize arm64 on x64/ia32 hosts (libuv often reports spawn UNKNOWN).
 */
function hostArchAssetScore(assetName) {
  const n = String(assetName || "").toLowerCase();
  const isArm = /(?:^|[^a-z0-9])(arm64|aarch64)(?:[^a-z0-9]|$)/.test(n);
  const isX64 = /(?:^|[^a-z0-9])(x64|x86_64|win64|amd64)(?:[^a-z0-9]|$)/.test(n);
  const isX86 =
    !isX64 &&
    !isArm &&
    /(?:^|[^a-z0-9])(win32|ia32|x86)(?:[^a-z0-9]|$)/.test(n);
  const isUniversal = /(?:^|[^a-z0-9])(universal|fat)(?:[^a-z0-9]|$)/.test(n);
  const arch = process.arch;

  if (arch === "arm64") {
    if (isUniversal) return 110;
    if (isArm) return 100;
    if (isX64) return 40;
    if (isX86) return 20;
    return 10;
  }
  if (arch === "ia32") {
    if (isX86) return 100;
    if (isX64) return 30;
    if (isArm) return 0;
    return 10;
  }
  // x64 and anything else
  if (isUniversal) return 110;
  if (isArm) return 0;
  if (isX64) return 100;
  if (isX86) return 50;
  return 10;
}

/** Prefer OS-matching assets; strongly downrank clearly foreign packages. */
function hostOsAssetScore(assetName) {
  const n = String(assetName || "").toLowerCase();
  const isJar = /\.jar$/i.test(n);
  const isWin =
    /\.exe$/i.test(n) ||
    /(?:^|[^a-z0-9])(windows|win64|win32|winportable|win-x64|win_x64|-win-)(?:[^a-z0-9]|$)/.test(n);
  const isMac =
    /\.dmg$/i.test(n) ||
    /(?:^|[^a-z0-9])(macos|osx|darwin|mac)(?:[^a-z0-9]|$)/.test(n);
  const isLinux =
    /\.appimage$/i.test(n) ||
    /(?:^|[^a-z0-9])(linux|ubuntu)(?:[^a-z0-9]|$)/.test(n);

  if (process.platform === "darwin") {
    if (isMac) return 300;
    if (isJar) return 200;
    if (isWin) return -200;
    if (isLinux) return -100;
    return 0;
  }
  if (process.platform === "win32") {
    if (isWin) return 300;
    if (isJar) return 200;
    if (isMac) return -200;
    if (isLinux) return -100;
    return 0;
  }
  if (isLinux) return 300;
  if (isJar) return 200;
  if (isWin || isMac) return -100;
  return 0;
}

function sortAssetsForHost(assets) {
  return [...(assets || [])].sort(
    (a, b) =>
      hostOsAssetScore(b.name) - hostOsAssetScore(a.name) ||
      hostArchAssetScore(b.name) - hostArchAssetScore(a.name) ||
      String(a.name).localeCompare(String(b.name))
  );
}

/** Pick the best asset matching assetPattern for this machine. */
function pickGithubAsset(assets, assetPattern) {
  const pattern = new RegExp(assetPattern || ".*", "i");
  const matched = (assets || []).filter((a) => a?.name && pattern.test(a.name));
  if (!matched.length) return null;
  return sortAssetsForHost(matched)[0];
}

/** Ordered patterns to try when resolving a GitHub release for this OS. */
function assetPatternsForEntry(entry) {
  const patterns = [];
  const macPat = entry?.assetPatternMac || entry?.macAssetPattern;
  const winPat = entry?.assetPattern;
  if (process.platform === "darwin") {
    if (macPat) patterns.push(macPat);
    // Catalog recipes are often Windows-shaped; try portable Mac fallouts before failing.
    if (winPat && !/(win|windows|\.exe)/i.test(winPat)) patterns.push(winPat);
    patterns.push(
      "(macos|osx|darwin|mac).*\\.(zip|dmg)$",
      "\\.(dmg)$",
      "\\.jar$"
    );
    if (winPat) patterns.push(winPat);
  } else {
    if (winPat) patterns.push(winPat);
    if (macPat) patterns.push(macPat);
  }
  return [...new Set(patterns.filter(Boolean))];
}

async function resolveDownload(entry) {
  if (
    entry.kind === "direct-zip" ||
    // Same fetch as direct-zip; extractArchive dispatches on the extension.
    entry.kind === "direct-7z" ||
    entry.kind === "direct-installer" ||
    entry.kind === "direct-exe"
  ) {
    if (
      process.platform === "darwin" &&
      (entry.kind === "direct-installer" || entry.kind === "direct-exe") &&
      /\.(exe|msi)$/i.test(String(entry.url || entry.fileName || ""))
    ) {
      throw new Error(
        "This game only ships a Windows installer in the catalog. On Mac, use Locate to select the .app if you already installed it."
      );
    }
    let name = entry.fileName || path.basename(new URL(entry.url).pathname) || `${entry.slug}.bin`;
    if (name === "download" || !name.includes(".")) {
      const parts = new URL(entry.url).pathname.split("/").filter(Boolean);
      const fromPath = parts.find((p) => /\.(exe|zip|msi|dmg|jar)$/i.test(p));
      name = entry.fileName || fromPath || `${entry.slug}.bin`;
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
    let name;
    if (process.platform === "darwin") {
      name = `openttd-${version}-macos-universal.zip`;
    } else if (process.platform === "linux") {
      name = `openttd-${version}-linux-generic-amd64.tar.xz`;
    } else {
      name = `openttd-${version}-windows-win64.zip`;
    }
    return {
      url: `https://cdn.openttd.org/openttd-releases/${version}/${name}`,
      name,
      version,
    };
  }

  if (entry.kind === "itch-zip" || (entry.url && /itch\.io/i.test(entry.url))) {
    const pageUrl = entry.url || entry.itchUrl || "https://kay-yu.itch.io/holocure";
    const res = await fetch(pageUrl, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!res.ok) throw new Error(`itch.io returned ${res.status}`);
    const html = await res.text();
    const uploadMatches = [...html.matchAll(/data-upload_id=["'](\d+)["']/g)].map((m) => m[1]);
    if (!uploadMatches.length) throw new Error("No download files found on itch.io page");
    const uploadId = entry.uploadId || uploadMatches[0];
    const csrfMatch =
      html.match(/csrf_token["']?\s*[:=]\s*["']([^"']+)["']/i) ||
      html.match(/name=["']csrf_token["']\s+value=["']([^"']+)["']/i);
    const postRes = await fetch(
      `${pageUrl.replace(/\/+$/, "")}/file/${uploadId}?source=game_download`,
      {
        method: "POST",
        headers: {
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          cookie: res.headers.get("set-cookie") || "",
          "x-requested-with": "XMLHttpRequest",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: csrfMatch ? `csrf_token=${encodeURIComponent(csrfMatch[1])}` : "",
      }
    );
    if (!postRes.ok) throw new Error(`itch.io file download request returned ${postRes.status}`);
    const json = await postRes.json();
    if (!json.url) throw new Error("itch.io did not return a valid download URL");
    return {
      url: json.url,
      name: entry.fileName || `${entry.slug || "game"}.zip`,
      version: entry.versionLabel || "latest",
    };
  }

  if (!entry.repo) {
    throw new Error(`No download source configured for ${entry.title || entry.slug || "this game"}`);
  }

  const res = await fetch(`https://api.github.com/repos/${entry.repo}/releases/latest`, {
    headers: { "user-agent": "playbound-launcher", accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${entry.repo}`);
  const release = await res.json();
  let asset = null;
  for (const pattern of assetPatternsForEntry(entry)) {
    asset = pickGithubAsset(release.assets, pattern);
    if (asset && hostOsAssetScore(asset.name) >= 0) break;
    if (asset && process.platform !== "darwin") break;
    asset = null;
  }
  if (!asset && process.platform === "darwin") {
    const candidates = sortAssetsForHost(release.assets).filter((a) => hostOsAssetScore(a.name) >= 0);
    asset = candidates[0] || null;
  }
  if (!asset) {
    throw new Error(
      `No ${process.platform === "darwin" ? "macOS" : "matching"} asset for ${entry.repo} ${release.tag_name}`
    );
  }
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
    const asset = pickGithubAsset(release.assets, install.assetPattern || "\\.zip$");
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
      let current = assertDownloadUrl(url);
      let res = null;
      for (let hop = 0; hop < 8; hop++) {
        res = await fetch(current, {
          headers: { "user-agent": "playbound-launcher", accept: "*/*" },
          redirect: "manual",
        });
        if (res.status >= 300 && res.status < 400) {
          const location = res.headers.get("location");
          if (!location) throw new Error("Redirect without location");
          current = assertDownloadUrl(new URL(location, current).toString());
          continue;
        }
        break;
      }
      if (!res || !res.ok || !res.body) {
        throw new Error(`HTTP ${res ? res.status : "failed"}`);
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

/** PlayBound-managed Temurin JDK (portable under userData). */
const managedJava = createManagedJava({
  userDataPath: app.getPath("userData"),
  loadSettings,
  saveSettings,
  downloadTo,
  onProgress: (payload) => sendProgress(payload),
});
GameLauncher.managedJavaResolver = () => managedJava.findManagedJavaBinary();

/**
 * Save history lives under userData, beside settings — not in the game folder,
 * so uninstalling a game never takes its backups with it.
 */
const saveData = createSaveData({
  snapshotRoot: path.join(app.getPath("userData"), "saves"),
});

/**
 * Zip a directory, mirroring extractZip's approach on each platform.
 *
 * Uses the OS's own tooling rather than adding a compression dependency, and
 * passes paths as script parameters rather than interpolating them, for the
 * same reason extractZip does.
 */
function zipDirectory(sourceDir, zipPath) {
  return new Promise((resolve, reject) => {
    let child;
    let cleanup = () => {};

    if (process.platform === "win32") {
      const scriptPath = path.join(
        app.getPath("temp"),
        `playbound-zip-${process.pid}-${Date.now()}.ps1`
      );
      const script =
        "param([Parameter(Mandatory=$true)][string]$Src,[Parameter(Mandatory=$true)][string]$Zip)\r\n" +
        "Compress-Archive -Path (Join-Path $Src '*') -DestinationPath $Zip -Force\r\n";
      try {
        fs.writeFileSync(scriptPath, script, "utf8");
      } catch (err) {
        reject(err);
        return;
      }
      cleanup = () => {
        try {
          fs.unlinkSync(scriptPath);
        } catch {
          /* best effort */
        }
      };
      child = spawn(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath, "-Src", sourceDir, "-Zip", zipPath],
        { windowsHide: true }
      );
    } else {
      child = spawn("zip", ["-r", "-q", zipPath, "."], { cwd: sourceDir, windowsHide: true });
    }

    let err = "";
    child.stderr?.on("data", (d) => (err += d));
    child.on("error", (e) => {
      cleanup();
      reject(e);
    });
    child.on("close", (code) => {
      cleanup();
      if (code === 0) resolve();
      else reject(new Error(`Archiving saves failed (${err.trim() || code})`));
    });
  });
}

const cloudSaves = createCloudSaves({
  apiBase: getApiBase,
  authedFetch: (url, init = {}) =>
    fetch(url, { ...init, headers: launcherApiHeaders(init.headers || {}) }),
  saveData,
  zipDir: zipDirectory,
  unzip: extractZip,
  tempDir: () => app.getPath("temp"),
  fsp,
  path,
  log: (msg) => console.log(`[saves] ${msg}`),
});

/**
 * Prompt to install PlayBound-managed Java. Returns whether install succeeded.
 * @param {{ gameTitle?: string }} [opts]
 */
async function offerManagedJavaInstall(opts = {}) {
  const existing = managedJava.findManagedJavaBinary();
  if (existing) return { installed: true, alreadyPresent: true };

  const parent = win && !win.isDestroyed() ? win : null;
  const result = await dialog.showMessageBox(parent || undefined, {
    type: "info",
    title: "Java required",
    message: `${opts.gameTitle || "This game"} needs Java 17+`,
    detail:
      "PlayBound can download and install a private copy of Temurin JDK 17 for you (about 150–200 MB). It won’t change your system Java or PATH.",
    buttons: ["Install Java", "Cancel"],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });

  if (result.response !== 0) {
    return { installed: false, cancelled: true };
  }

  void telemetry.track("java_runtime_install_started", { version: "17" });
  sendProgress({ phase: "java", message: "Downloading Java 17…" });
  const outcome = await managedJava.ensureManagedJava();
  if (outcome.ok && outcome.javaBin) {
    void telemetry.track("java_runtime_install_succeeded", { version: "17" });
    sendProgress({ phase: "java", message: "Java 17 ready — launching…" });
    return { installed: true, javaBin: outcome.javaBin };
  }

  const error = outcome.error || "Install failed";
  void telemetry.track("java_runtime_install_failed", { message: error });
  return { installed: false, error };
}

async function verifyChecksumMd5(filePath, expectedMd5) {
  if (!expectedMd5) return;
  const want = String(expectedMd5).trim().toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(want)) return;
  const hash = crypto.createHash("md5");
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  const got = hash.digest("hex");
  if (got !== want) {
    throw new Error(
      `Download checksum mismatch (expected ${want}, got ${got}). Try again or open the project site for a manual download.`
    );
  }
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
    /** @type {import("child_process").ChildProcessWithoutNullStreams} */
    let child;
    let cleanup = () => {};

    if (process.platform === "win32") {
      const scriptPath = path.join(
        app.getPath("temp"),
        `playbound-extract-${process.pid}-${Date.now()}.ps1`
      );
      // Fixed script body; paths only via -File parameters (never interpolated).
      const script =
        "param([Parameter(Mandatory=$true)][string]$Zip,[Parameter(Mandatory=$true)][string]$Dest)\r\n" +
        "Expand-Archive -LiteralPath $Zip -DestinationPath $Dest -Force\r\n" +
        "Get-ChildItem -LiteralPath $Dest -Recurse -Force -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue\r\n";
      try {
        fs.writeFileSync(scriptPath, script, "utf8");
      } catch (err) {
        reject(err);
        return;
      }
      cleanup = () => {
        try {
          fs.unlinkSync(scriptPath);
        } catch {
          /* ignore */
        }
      };
      child = spawn(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          scriptPath,
          "-Zip",
          String(zipPath),
          "-Dest",
          String(destDir),
        ],
        { windowsHide: true }
      );
    } else if (process.platform === "darwin") {
      // ditto handles .zip (and preserves macOS metadata) without PowerShell.
      child = spawn("ditto", ["-x", "-k", String(zipPath), String(destDir)], {
        windowsHide: true,
      });
    } else {
      child = spawn("unzip", ["-o", "-q", String(zipPath), "-d", String(destDir)], {
        windowsHide: true,
      });
    }

    let err = "";
    child.stderr?.on("data", (d) => (err += d));
    child.on("error", (spawnErr) => {
      cleanup();
      reject(
        new Error(
          `Extract failed to start (${spawnErr.code || spawnErr.message}). ` +
            (process.platform === "win32"
              ? "PowerShell is required to unpack game archives."
              : "Install unzip/ditto tools or reinstall the game.")
        )
      );
    });
    child.on("close", (code) => {
      cleanup();
      code === 0 ? resolve() : reject(new Error(`Extract failed: ${err || code}`));
    });
  });
}

/** Mount a .dmg, copy .app / game files into destDir, then detach. macOS only. */
function extractDmg(dmgPath, destDir) {
  return new Promise((resolve, reject) => {
    if (process.platform !== "darwin") {
      reject(new Error("DMG installs are only supported on macOS"));
      return;
    }
    const mountPoint = path.join(
      app.getPath("temp"),
      `playbound-dmg-${process.pid}-${Date.now()}`
    );
    try {
      fs.mkdirSync(mountPoint, { recursive: true });
    } catch (err) {
      reject(err);
      return;
    }

    const detach = () => {
      try {
        execFileSync("hdiutil", ["detach", mountPoint, "-quiet", "-force"], {
          timeout: 60_000,
          stdio: "ignore",
        });
      } catch {
        /* ignore */
      }
      try {
        fs.rmSync(mountPoint, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    };

    try {
      execFileSync(
        "hdiutil",
        ["attach", String(dmgPath), "-nobrowse", "-readonly", "-mountpoint", mountPoint],
        { timeout: 120_000, stdio: ["ignore", "pipe", "pipe"] }
      );
      const entries = fs.readdirSync(mountPoint);
      const prefer = entries.filter((n) => n.endsWith(".app") && !n.startsWith("."));
      const copyNames = prefer.length ? prefer : entries.filter((n) => !n.startsWith("."));
      if (!copyNames.length) {
        detach();
        reject(new Error("DMG had no installable app contents"));
        return;
      }
      fs.mkdirSync(destDir, { recursive: true });
      for (const name of copyNames) {
        const from = path.join(mountPoint, name);
        const to = path.join(destDir, name);
        fs.cpSync(from, to, { recursive: true });
      }
      detach();
      resolve();
    } catch (err) {
      detach();
      reject(new Error(`DMG extract failed: ${err?.message || err}`));
    }
  });
}

/**
 * Resolve the bundled 7-Zip binary.
 *
 * Windows' own tar.exe is libarchive and does read the 7z container, but it is
 * built without the LZMA codec — it fails with "LZMA codec is unsupported" on
 * real archives, RetroArch's included. There is no other 7z reader guaranteed
 * to be present, so one is shipped.
 *
 * 7zip-bin is already in the tree as an electron-builder dependency and carries
 * per-platform binaries. Packaged builds must keep it outside the asar, since a
 * binary inside an archive cannot be executed — see asarUnpack in
 * electron-builder.js. app.asar.unpacked is where it lands there.
 */
function sevenZipBinary() {
  const platformDir =
    process.platform === "win32" ? "win" : process.platform === "darwin" ? "mac" : "linux";
  const archDir = process.arch === "arm64" ? "arm64" : process.arch === "ia32" ? "ia32" : "x64";
  const exe = process.platform === "win32" ? "7za.exe" : "7za";

  const roots = [
    path.join(__dirname, "node_modules", "7zip-bin"),
    // Packaged: asar-relative path rewritten to the unpacked copy.
    path.join(__dirname.replace(/app\.asar([\\/]|$)/, "app.asar.unpacked$1"), "node_modules", "7zip-bin"),
    path.join(process.resourcesPath || "", "app.asar.unpacked", "node_modules", "7zip-bin"),
  ];

  for (const root of roots) {
    if (!root) continue;
    for (const candidate of [
      path.join(root, platformDir, archDir, exe),
      // mac/linux builds are not always arch-nested.
      path.join(root, platformDir, exe),
    ]) {
      try {
        if (fs.existsSync(candidate)) return candidate;
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

/** Extract a .7z. Mirrors extractZip: shell out, no extraction library. */
function extract7z(archivePath, destDir) {
  return new Promise((resolve, reject) => {
    const bin = sevenZipBinary();
    if (!bin) {
      reject(
        new Error(
          "This game ships a .7z archive and the bundled 7-Zip helper is missing. Reinstall PlayBound."
        )
      );
      return;
    }
    // -bso0/-bse0/-bsp0 silence progress chatter; -y accepts overwrite prompts,
    // which a detached process could never answer.
    const child = spawn(
      bin,
      ["x", String(archivePath), `-o${String(destDir)}`, "-y", "-bso0", "-bsp0"],
      { windowsHide: true }
    );
    let err = "";
    child.stderr?.on("data", (d) => (err += d));
    child.on("error", (spawnErr) =>
      reject(new Error(`7z extract failed to start (${spawnErr.code || spawnErr.message}).`))
    );
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`7z extract failed: ${err.trim() || code}`))
    );
  });
}

async function extractArchive(archivePath, destDir) {
  const lower = String(archivePath || "").toLowerCase();
  await fsp.mkdir(destDir, { recursive: true });
  if (lower.endsWith(".dmg")) {
    await extractDmg(archivePath, destDir);
    return;
  }
  if (lower.endsWith(".7z")) {
    await extract7z(archivePath, destDir);
    return;
  }
  if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz") || lower.endsWith(".tar.xz")) {
    if (process.platform === "win32") {
      throw new Error("tar archives are not supported on Windows installs");
    }
    await new Promise((resolve, reject) => {
      const child = spawn("tar", ["-xaf", String(archivePath), "-C", String(destDir)], {
        windowsHide: true,
      });
      let err = "";
      child.stderr?.on("data", (d) => (err += d));
      child.on("error", reject);
      child.on("close", (code) =>
        code === 0 ? resolve() : reject(new Error(`tar extract failed: ${err || code}`))
      );
    });
    return;
  }
  await extractZip(archivePath, destDir);
}

/* ── executable discovery ──────────────────────────────────── */

function findExecutable(dir, exeHint) {
  const candidates = [];
  const skip = /unins|setup|install|crash|report|vcredist|dxsetup|server/i;
  const walk = (d, depth = 0) => {
    if (depth > 10) return;
    let names;
    try {
      names = fs.readdirSync(d);
    } catch {
      return;
    }
    for (const name of names) {
      const full = path.join(d, name);
      let stat;
      try {
        stat = fs.lstatSync(full);
      } catch {
        continue;
      }
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) {
        if (process.platform === "darwin" && name.endsWith(".app") && !skip.test(name)) {
          candidates.push({ full, name, size: stat.size, rank: 300 });
          continue;
        }
        walk(full, depth + 1);
        continue;
      }
      const lower = name.toLowerCase();
      if (lower.endsWith(".jar") && !skip.test(name)) {
        candidates.push({ full, name, size: stat.size, rank: 200 });
        continue;
      }
      if (process.platform === "win32") {
        if (lower.endsWith(".exe") && !skip.test(name)) {
          candidates.push({ full, name, size: stat.size, rank: 100 });
        }
        continue;
      }
      // Unix: prefer files without archive extensions (launch binaries often have no extension).
      if (/\.(zip|dmg|txt|md|html|json|xml|png|jpg|jpeg|gif|ico|pak|dat|cfg|ini)$/i.test(lower)) {
        continue;
      }
      if (!skip.test(name)) {
        const mode = stat.mode || 0;
        const executableBit = Boolean(mode & 0o111);
        candidates.push({
          full,
          name,
          size: stat.size,
          rank: executableBit ? 120 : 40,
        });
      }
    }
  };
  walk(dir);
  if (candidates.length === 0) return null;
  if (exeHint) {
    const hint = new RegExp(exeHint, "i");
    const hinted = candidates.filter((e) => hint.test(e.name));
    if (hinted.length > 0) {
      return hinted.sort((a, b) => b.rank - a.rank || b.size - a.size)[0].full;
    }
  }
  return candidates.sort((a, b) => b.rank - a.rank || b.size - a.size)[0].full;
}

function expandWinPath(p) {
  let out = String(p || "")
    .replace(/%LOCALAPPDATA%/gi, process.env.LOCALAPPDATA || "")
    .replace(/%APPDATA%/gi, process.env.APPDATA || "")
    .replace(/%PROGRAMFILES%/gi, process.env.PROGRAMFILES || "")
    .replace(/%PROGRAMFILES\(X86\)%/gi, process.env["ProgramFiles(x86)"] || "")
    // Daybreak titles (DCUO) install under C:\Users\Public by default, so an
    // unexpanded %PUBLIC% would leave a path that can never match.
    .replace(/%PUBLIC%/gi, process.env.PUBLIC || "C:\\Users\\Public")
    .replace(/%USERPROFILE%/gi, process.env.USERPROFILE || process.env.HOME || "");
  if (process.platform === "darwin") {
    const home = app.getPath("home");
    const support = path.join(home, "Library", "Application Support");
    out = out
      .replace(/^~(?=$|[\\/])/g, home)
      .replace(/%HOME%/gi, home)
      .replace(/%APPLICATIONS%/gi, "/Applications")
      .replace(/%HOME_APPLICATIONS%/gi, path.join(home, "Applications"))
      .replace(/%APPLICATION_SUPPORT%/gi, support);
  }
  return out;
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

/** existsSync on catalog knownExePaths only — no registry, no directory walk. */
/**
 * Bundle names a game might plausibly install as, e.g. "OpenRA.app".
 *
 * Exported shape is deliberately generous: a bundle is named for the product,
 * not the slug, and the two rarely match exactly ("tes-arena" → "OpenTESArena").
 */
function macAppCandidateNames(entry) {
  const names = new Set();
  const add = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return;
    const base = raw.replace(/\.(exe|cmd|bat|app)$/i, "").trim();
    if (base) names.add(`${base}.app`);
  };
  add(entry?.title);
  add(entry?.slug);
  // "Aleph One" also ships as "AlephOne.app".
  if (entry?.title) add(String(entry.title).replace(/\s+/g, ""));
  // A hint with alternation ("ysoccer|ysoccer19") is a pattern, not a name.
  if (entry?.exeHint && !/[|\\/]/.test(entry.exeHint)) add(entry.exeHint);
  for (const raw of entry?.knownExePaths || []) {
    const base = path.basename(String(raw));
    if (/\.app$/i.test(base)) names.add(base);
  }
  return [...names];
}

/** The installed .app for this game under /Applications, or null. macOS only. */
function findMacApplication(entry) {
  if (process.platform !== "darwin") return null;
  const wanted = macAppCandidateNames(entry).map((n) => n.toLowerCase());
  if (wanted.length === 0) return null;

  let roots;
  try {
    roots = ["/Applications", path.join(app.getPath("home"), "Applications")];
  } catch {
    roots = ["/Applications"];
  }

  for (const root of roots) {
    let names;
    try {
      names = fs.readdirSync(root);
    } catch {
      continue;
    }
    // Case-insensitive: the filesystem usually is, but the recipe's casing and
    // the vendor's rarely agree, so never rely on an exact hit.
    for (const name of names) {
      if (!/\.app$/i.test(name)) continue;
      if (!wanted.includes(name.toLowerCase())) continue;
      const full = path.join(root, name);
      if (isAllowedExecutablePath(full)) return full;
    }
  }
  return null;
}

function findKnownPathOnly(entry) {
  for (const raw of entry.knownExePaths || []) {
    const full = expandWinPath(raw);
    if (full && fs.existsSync(full) && isAllowedExecutablePath(full)) return full;
  }
  // Same paths, but under whichever Steam library the game actually landed in.
  const inSteam = findInSteamLibraries(entry);
  if (inSteam && isAllowedExecutablePath(inSteam)) return inSteam;
  return null;
}

/** Cheap check of Settings → gamesDir/<slug> without walking the whole tree. */
function findExeInSlugGamesDir(entry) {
  const settings = loadSettings();
  const gamesDir = settings.gamesDir || DEFAULT_GAMES_DIR;
  if (!gamesDir || !entry?.slug) return null;
  const slugDir = path.join(gamesDir, entry.slug);
  if (!fs.existsSync(slugDir)) return null;
  for (const base of expectedExeBasenames(entry)) {
    const candidates = [
      path.join(slugDir, base),
      path.join(slugDir, "binaries", "system", base),
    ];
    for (const c of candidates) {
      if (c && fs.existsSync(c) && isAllowedExecutablePath(c)) return c;
    }
  }
  return null;
}

function findKnownExecutable(entry) {
  const known = findKnownPathOnly(entry);
  if (known) return known;
  /*
   * macOS installs land in /Applications, and almost no recipe carries a mac
   * knownExePath — 28 of the 33 that define any are Windows-only. Every other
   * detection path below is Windows-shaped too: expectedExeBasenames only ever
   * emits .exe/.cmd/.bat, and the registry lookup does not exist here. So a
   * player could install a game, run it perfectly from Finder, and the launcher
   * would still show no Play button because nothing ever resolved an
   * executable. Looking in the Applications folders closes that gap without
   * needing a mac path added to every recipe.
   */
  const macApp = findMacApplication(entry);
  if (macApp) return macApp;
  const inSlugDir = findExeInSlugGamesDir(entry);
  if (inSlugDir) return inSlugDir;
  /*
   * Never claim a store-installed edition from our own games directory.
   *
   * findExeUnderGamesDir matches on executable basename across the whole games
   * folder, with no notion of which edition a hit belongs to. An "external"
   * entry is by definition installed by Steam or another store, somewhere
   * outside that folder — so any match inside it is a *different edition of the
   * same game*, and accepting it marks the store edition installed against its
   * sibling's files. For a modded edition that is destructive: ensureEditionMods
   * then writes the mod loader into the vanilla install the player expected to
   * stay unmodified. HoloCure has exactly this shape (vanilla from itch.io,
   * multiplayer from Steam) and is where it was caught.
   */
  if (entry?.kind !== "external") {
    const underGames = findExeUnderGamesDir(entry);
    if (underGames && isAllowedExecutablePath(underGames)) return underGames;
  }
  const fromReg = findExeFromUninstallRegistry(entry);
  if (fromReg && isAllowedExecutablePath(fromReg)) return fromReg;
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
  void telemetry.track("exe_located", { gameSlug: slug });
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
    connectArgs: Array.isArray(entry?.connectArgs) ? entry.connectArgs : undefined,
  });
  // Modded editions finish setting themselves up here — this is the one point
  // every detection path (known path, registry, drive scan) converges on.
  // Failures are reported but not fatal: the same routine runs again before
  // launch, so a transient download error self-corrects rather than leaving
  // the install permanently broken.
  if (entry?.modLoader) {
    void ensureEditionMods(slug, entry, dir, exe)
      .catch((err) => {
        reportInstallFailed(slug, entry?.editionSlug || null, err, "mod-setup");
        if (win && !win.isDestroyed()) {
          win.webContents.send("install-scan", {
            slug,
            phase: "error",
            message: `Installed, but the mods aren't active yet: ${err?.message || err}`,
          });
        }
      })
      .finally(() => sendProgress({ phase: "done" }));
    return { status: "installed", version, exe, dir };
  }
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

function startInstallerPoll(slug, entry, version) {
  stopInstallerPoll();
  stopExeScan(slug);
  installerPollSlug = slug;
  markPendingInstall(slug, version, {
    editionSlug: entry?.editionSlug,
    editionName: entry?.editionName,
    editionType: entry?.editionType,
  });

  const started = Date.now();
  const maxMs = 10 * 60 * 1000;
  const title = entry?.title || slug;

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
      message: `Waiting for the ${title} installer to finish…`,
    });
  }

  installerPollTimer = setInterval(() => {
    if (Date.now() - started > maxMs) {
      stopInstallerPoll();
      // Keep the pending Library card so Play is Locate, not a vanished install.
      // Do not start a full-disk exe scan — that freezes the launcher.
      setPendingScanning(
        slug,
        false,
        `Couldn't find ${title} automatically — choose the .exe in Library.`
      );
      return;
    }
    tryKnownPath();
  }, 3000);
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

function matchUninstallDump(entry, dump) {
  if (!Array.isArray(dump) || dump.length === 0) return null;
  const titles = [
    String(entry.title || "").trim().toLowerCase(),
    ...((entry.registryTitles || []).map((t) => String(t || "").trim().toLowerCase())),
  ].filter(Boolean);
  const bases = (entry.knownExePaths || [])
    .map((p) => path.basename(expandWinPath(p)).toLowerCase())
    .filter(Boolean);
  for (const row of dump) {
    const name = String(row.DisplayName || "").toLowerCase();
    const icon = stripRegQuotes(row.DisplayIcon);
    const loc = stripRegQuotes(row.InstallLocation);
    const titleHit = titles.some((t) => name === t || (t && name.startsWith(t)));
    const baseHit = bases.some(
      (b) =>
        (icon && icon.toLowerCase().includes(b)) ||
        (loc && fs.existsSync(path.join(loc, b)))
    );
    if (!titleHit && !baseHit) continue;
    if (icon && /\.exe$/i.test(icon) && fs.existsSync(icon) && isAllowedExecutablePath(icon)) {
      return icon;
    }
    if (loc && fs.existsSync(loc)) {
      for (const raw of entry.knownExePaths || []) {
        const base = path.basename(expandWinPath(raw));
        const c = path.join(loc, base);
        if (fs.existsSync(c) && isAllowedExecutablePath(c)) return c;
      }
    }
  }
  return null;
}

function listUninstallRegistryDump() {
  if (process.platform !== "win32") return Promise.resolve([]);
  const ps = `
$ErrorActionPreference = 'SilentlyContinue'
$paths = @(
  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
)
Get-ItemProperty $paths |
  Where-Object { $_.DisplayName -or $_.DisplayIcon -or $_.InstallLocation } |
  Select-Object DisplayName, InstallLocation, DisplayIcon |
  ConvertTo-Json -Compress
`;
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", ps],
      { encoding: "utf8", timeout: 12_000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          console.warn("[install] uninstall dump failed:", err.message || err);
          resolve([]);
          return;
        }
        try {
          const out = String(stdout || "").trim();
          if (!out) {
            resolve([]);
            return;
          }
          const parsed = JSON.parse(out);
          resolve(Array.isArray(parsed) ? parsed : [parsed]);
        } catch {
          resolve([]);
        }
      }
    );
  });
}

async function listLibraryScanCandidates() {
  const installed = loadState();
  const found = [];
  const remaining = [];
  for (const entry of catalog) {
    if (!entry?.slug) continue;
    const existing = installed[entry.slug];
    if (existing?.exe && fs.existsSync(existing.exe)) continue;
    const known = findKnownPathOnly(entry) || findExeInSlugGamesDir(entry);
    if (known) {
      found.push({
        slug: entry.slug,
        title: entry.title || entry.slug,
        exe: known,
      });
    } else {
      remaining.push(entry);
    }
  }
  if (remaining.length > 0) {
    await new Promise((r) => setImmediate(r));
    const dump = await listUninstallRegistryDump();
    for (const entry of remaining) {
      const fromReg = matchUninstallDump(entry, dump);
      if (!fromReg) continue;
      found.push({
        slug: entry.slug,
        title: entry.title || entry.slug,
        exe: fromReg,
      });
    }
  }
  return found;
}

function addScannedLibraryGames(slugs) {
  const installed = loadState();
  const added = [];
  for (const slug of slugs || []) {
    const entry = catalog.find((e) => e.slug === slug);
    if (!entry) continue;
    const existing = installed[slug];
    if (existing?.exe && fs.existsSync(existing.exe)) continue;
    const known =
      findKnownPathOnly(entry) || findExeInSlugGamesDir(entry) || findKnownExecutable(entry);
    if (!known) continue;
    markInstalledFromExe(slug, entry, known, existing?.version || "detected");
    added.push({ slug, title: entry.title || slug });
  }
  if (added.length > 0 && win && !win.isDestroyed()) {
    win.webContents.send("install-detected", { slug: added[0]?.slug || null, scanned: added.length });
  }
  return { added };
}

/**
 * One-shot: pick up games already installed via knownExePaths but missing from state.
 * Known paths and gamesDir/<slug> only — registry walks belong on Add Game, not startup.
 */
async function scanKnownInstalls() {
  const state = loadState();
  let found = 0;
  let checked = 0;
  for (const entry of catalog) {
    if (!entry?.slug || !entry.knownExePaths?.length) continue;
    const existing = state[entry.slug];
    if (existing?.exe && fs.existsSync(existing.exe)) continue;
    const known = findKnownPathOnly(entry) || findExeInSlugGamesDir(entry);
    if (known) {
      markInstalled(entry.slug, {
        version: existing?.version || "detected",
        exe: known,
        dir: resolveInstallDir(entry, known),
      });
      found += 1;
    }
    checked += 1;
    if (checked % 6 === 0) await new Promise((r) => setImmediate(r));
  }
  if (found > 0 && win && !win.isDestroyed()) {
    win.webContents.send("install-detected", { slug: null, scanned: found });
  }
  return found;
}

function isFlightGearAircraftMod(installRelativePath) {
  const rel = String(installRelativePath || "")
    .replace(/^[/\\]+/, "")
    .replace(/\\/g, "/");
  return /^aircraft(\/|$)/i.test(rel);
}

/** FG_HOME Addons root — not the fgfs bin/ tree. */
function flightGearHomeAddons() {
  const home = app.getPath("home");
  if (process.platform === "win32") {
    const roaming = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    return path.join(roaming, "flightgear.org", "Addons");
  }
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "FlightGear", "Addons");
  }
  return path.join(home, ".fgfs", "Addons");
}

function findDirContainingFile(root, fileName, maxDepth = 5) {
  if (!root || !fs.existsSync(root)) return null;
  const queue = [{ dir: root, depth: 0 }];
  while (queue.length) {
    const { dir, depth } = queue.shift();
    if (fs.existsSync(path.join(dir, fileName))) return dir;
    if (depth >= maxDepth) continue;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (!ent.isDirectory() || ent.name.startsWith(".")) continue;
      queue.push({ dir: path.join(dir, ent.name), depth: depth + 1 });
    }
  }
  return null;
}

function flightGearAddonLaunchArgs(state) {
  const mods = state.__mods__ && typeof state.__mods__ === "object" ? state.__mods__ : {};
  const args = [];
  for (const info of Object.values(mods)) {
    if (!info || info.baseGameSlug !== "flightgear") continue;
    const dir = info.dir;
    if (!dir || !fs.existsSync(dir)) continue;
    if (!fs.existsSync(path.join(dir, "addon-main.nas"))) continue;
    args.push(`--addon=${dir}`);
  }
  return args;
}

function resolveModTargetDir(baseGameSlug, installRelativePath, baseDirOverride, modSlug) {
  const home = app.getPath("home");
  const appData =
    process.env.APPDATA ||
    (process.platform === "darwin"
      ? path.join(home, "Library", "Application Support")
      : path.join(home, ".config"));
  const documents =
    process.platform === "darwin"
      ? path.join(home, "Documents")
      : path.join(process.env.USERPROFILE || home, "Documents");
  const rel = String(installRelativePath || "mods").replace(/^[/\\]+|[/\\]+$/g, "") || "mods";
  const under = (root) => path.join(root, ...rel.split(/[/\\]+/));

  if (baseGameSlug === "flightgear" && !isFlightGearAircraftMod(installRelativePath)) {
    const folder = String(modSlug || "addon").replace(/[<>:"|?*]/g, "_");
    return path.join(flightGearHomeAddons(), folder);
  }

  if (baseGameSlug === "mindustry") {
    return under(path.join(appData, "Mindustry"));
  }
  if (baseGameSlug === "0ad") {
    if (process.platform === "darwin") {
      return under(path.join(appData, "0ad", "mods"));
    }
    return under(path.join(documents, "My Games", "0ad"));
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

function modUsesUserDataFolder(baseGameSlug, installRelativePath) {
  if (baseGameSlug === "flightgear") {
    return !isFlightGearAircraftMod(installRelativePath);
  }
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
    if (
      !isBaseGameReady(install.baseGameSlug) &&
      !modUsesUserDataFolder(install.baseGameSlug, install.installRelativePath)
    ) {
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

function markInstalled(slug, { version, exe, dir, editionSlug, editionName, editionType, connectArgs }) {
  stopExeScan(slug);
  stopInstallerPoll();
  const state = loadState();
  const game = ensureGameInstallRecord(state[slug]);
  const ed = editionSlug || game.editionSlug || DEFAULT_EDITION_SLUG;
  const prev = game.editions[ed] || {};
  game.editions[ed] = {
    version,
    exe,
    dir,
    installedAt: new Date().toISOString(),
    editionSlug: ed,
    editionName: editionName || prev.editionName || "Official",
    editionType: editionType || prev.editionType || "official",
    pending: false,
    scanning: false,
    connectArgs: Array.isArray(connectArgs)
      ? connectArgs
      : Array.isArray(prev.connectArgs)
        ? prev.connectArgs
        : undefined,
  };
  syncGameInstallSummary(game);
  state[slug] = game;
  saveState(state);
  clearPendingInstaller(slug);
  void syncLibrary(slug, "install", version);
  notifyInstallDetected(slug);
}

/** Show the game in Library immediately while we look for the exe. */
function markPendingInstall(slug, version, editionExtra = {}) {
  const state = loadState();
  const game = ensureGameInstallRecord(state[slug]);
  const ed = editionExtra.editionSlug || game.editionSlug || DEFAULT_EDITION_SLUG;
  const existing = game.editions[ed];
  if (existing?.exe && fs.existsSync(existing.exe)) return existing;
  const alreadyPending = Boolean(existing?.pending);
  game.editions[ed] = {
    ...(existing || {}),
    pending: true,
    scanning: false,
    version: version || existing?.version || null,
    installedAt: existing?.installedAt || new Date().toISOString(),
    editionSlug: ed,
    editionName: editionExtra.editionName || existing?.editionName || "Official",
    editionType: editionExtra.editionType || existing?.editionType || "official",
  };
  syncGameInstallSummary(game);
  state[slug] = game;
  saveState(state);
  setPendingInstaller(slug, version);
  if (!alreadyPending && win && !win.isDestroyed()) {
    win.webContents.send("install-scan", {
      slug,
      phase: "pending",
      message: `Waiting for ${slug} install to finish…`,
    });
  }
  return game.editions[ed];
}

function setPendingScanning(slug, scanning, message) {
  const state = loadState();
  const game = ensureGameInstallRecord(state[slug]);
  const ed = game.editionSlug || DEFAULT_EDITION_SLUG;
  const info = game.editions[ed];
  if (!info?.pending) return;
  info.scanning = Boolean(scanning);
  game.editions[ed] = info;
  syncGameInstallSummary(game);
  state[slug] = game;
  saveState(state);
  if (win && !win.isDestroyed()) {
    win.webContents.send("install-scan", {
      slug,
      phase: scanning ? "scanning" : "needs-locate",
      ...(message ? { message } : {}),
    });
  }
}

function dismissPendingInstall(slug, editionSlug = null) {
  stopExeScan(slug);
  stopInstallerPoll();
  const state = loadState();
  const game = ensureGameInstallRecord(state[slug]);
  const ed = editionSlug || game.editionSlug || DEFAULT_EDITION_SLUG;
  const info = game.editions[ed];
  if (info?.pending && !(info.exe && fs.existsSync(info.exe))) {
    delete game.editions[ed];
  }
  if (Object.keys(game.editions).length === 0) {
    delete state[slug];
  } else {
    syncGameInstallSummary(game);
    state[slug] = game;
  }
  saveState(state);
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
  /*
   * These names are matched against files in the games directory, and on macOS
   * the thing sitting there is a .app bundle — an .exe name can never hit one.
   * Added last so Windows keeps the exact list it had.
   */
  if (process.platform === "darwin") {
    for (const name of macAppCandidateNames(entry)) bases.add(name.toLowerCase());
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
 *
 * Installer flows (github-installer / direct-installer) must not call this —
 * a full-drive walk freezes the launcher. Those poll knownExePaths only.
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
  /*
   * Store-installed editions are never under our games directory, so a basename
   * hit there is a sibling edition's copy — the same trap findKnownExecutable
   * avoids. Cut the directory out of the walk rather than merely deprioritising
   * it, or the full-drive pass wanders back in and adopts the wrong install.
   */
  const isExternal = entry?.kind === "external";
  const skipGamesDir =
    isExternal && gamesDir ? normalizeFsPath(gamesDir).toLowerCase() : null;
  /** Prefer games directory roots so managed installs are found before full-drive BFS. */
  const preferred = [];
  if (!isExternal && gamesDir && fs.existsSync(gamesDir)) {
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
          if (shouldSkipScanDir(ent.name)) continue;
          if (skipGamesDir && normalizeFsPath(full).toLowerCase() === skipGamesDir) continue;
          queue.push(full);
        } else if (ent.isFile() && want.has(ent.name.toLowerCase())) {
          /*
           * The allowlist applies here too. This path adopted whatever matched
           * the executable name anywhere on any fixed drive and handed it
           * straight to markInstalledFromExe — every other detection route
           * checks first, and a basename match from an arbitrary folder is the
           * least trustworthy of them, not the most.
           */
          if (!isAllowedExecutablePath(full)) continue;
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
  void telemetry.track("exe_locate_failed", { gameSlug: slug });
  if (win && !win.isDestroyed()) {
    win.webContents.send("install-detect-failed", { slug });
  }
}

async function writeJarLauncher(gameDir, jarName) {
  if (process.platform === "win32") {
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

  const shPath = path.join(gameDir, "play.sh");
  const body = [
    "#!/bin/sh",
    `DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"`,
    `exec java -jar "$DIR/${jarName}" "$@"`,
    "",
  ].join("\n");
  await fsp.writeFile(shPath, body, { encoding: "utf8", mode: 0o755 });
  return shPath;
}

/* ── core actions ──────────────────────────────────────────── */

function installErrorCode(err) {
  const msg = String(err?.message || err || "");
  if (/Download host not allowed/i.test(msg)) return "DOWNLOAD_HOST_BLOCKED";
  if (/Invalid download URL/i.test(msg)) return "INVALID_DOWNLOAD_URL";
  if (/checksum/i.test(msg)) return "CHECKSUM_MISMATCH";
  if (/no executable found/i.test(msg)) return "EXE_NOT_FOUND";
  if (/Unknown game/i.test(msg)) return "UNKNOWN_GAME";
  if (/HTTP \d+/i.test(msg)) return "DOWNLOAD_HTTP_ERROR";
  if (/Couldn't install the base game/i.test(msg)) return "BASE_GAME_INSTALL_FAILED";
  if (/Download failed/i.test(msg)) return "DOWNLOAD_FAILED";
  return "INSTALL_FAILED";
}

function reportInstallFailed(slug, editionSlug, err, phase = "install") {
  try {
    void telemetry.installFailed({
      ...editionInfoFor(slug, { editionSlug: editionSlug || undefined }),
      code: installErrorCode(err),
      message: String(err?.message || err || "Install failed").slice(0, 1000),
      phase,
    });
  } catch {
    /* never block installs on telemetry */
  }
}

async function installGame(slug, targetDir, editionSlug, selectedAddons) {
  try {
    return await installGameInner(slug, targetDir, editionSlug, selectedAddons);
  } catch (err) {
    reportInstallFailed(slug, editionSlug || null, err, "install");
    throw err;
  }
}

async function installGameInner(slug, targetDir, editionSlug, selectedAddons) {
  let entry =
    (await ensureCatalogEntry(slug)) ||
    catalog.find((e) => e.slug === slug) ||
    bundledCatalog.find((e) => e.slug === slug);

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
    } else {
      const bundled = bundledCatalog.find((e) => e.slug === slug);
      if (bundled && bundled.kind && bundled.kind !== "external") {
        entry = { ...(entry || {}), ...bundled };
      } else if (editionMeta.installMethod === "official_download") {
        const url =
          editionMeta.installConfig?.official_download?.url ||
          editionMeta.links?.website ||
          editionMeta.installAction?.href;
        if (url) {
          await safeOpenExternal(url, { campaign: "launcher_install_external", content: slug });
          return { status: "external", editionSlug: editionMeta.editionSlug };
        }
      } else if (editionMeta.installMethod === "external_installer") {
        const url = editionMeta.installConfig?.external_installer?.url || editionMeta.installAction?.href;
        if (url) {
          await safeOpenExternal(url, { campaign: "launcher_install_external", content: slug });
          return { status: "external", editionSlug: editionMeta.editionSlug };
        }
      } else if (editionMeta.installAction?.kind === "link" && editionMeta.installAction.href) {
        await safeOpenExternal(editionMeta.installAction.href, {
          campaign: "launcher_install_external",
          content: slug,
        });
        return { status: "external", editionSlug: editionMeta.editionSlug };
      } else if (editionMeta.installAction?.kind === "browser" && editionMeta.installAction.href) {
        await safeOpenExternal(editionMeta.installAction.href, {
          campaign: "launcher_install_external",
          content: slug,
        });
        return { status: "external", editionSlug: editionMeta.editionSlug };
      }
    }
  }

  if (!entry) {
    const fallback = bundledCatalog.find((e) => e.slug === slug);
    if (fallback) entry = fallback;
  }

  if (entry.url && String(entry.url).includes("sahaquiel.us")) {
    entry.kind = "external";
    entry.url = "https://www.projectquarm.com/";
  }

  if (entry.kind === "external") {
    await safeOpenExternal(steamDeepLinkFor(entry.url) || entry.url, {
      campaign: "launcher_install_external",
      content: slug,
    });
    // No post-install hand-off here: there is no install directory yet at this
    // point, so it had nothing to open and only ever fired the Discord jump.
    // A plain external entry is a hand-off and we are done. One that also
    // carries a mod loader is not: PlayBound still has to place the mod files
    // once the store finishes installing, so watch for the executable the same
    // way a downloaded installer is watched. Without this the store opens and
    // the mods are never applied.
    if (entry.modLoader) {
      const externalEntry = {
        ...entry,
        editionSlug: entry.editionSlug || editionMeta?.editionSlug || DEFAULT_EDITION_SLUG,
        editionName: entry.editionName || editionMeta?.editionName || "Official",
        editionType: entry.editionType || editionMeta?.editionType || "official",
      };
      const known = findKnownExecutable(externalEntry);
      if (known) {
        // Already installed — apply the mods now rather than waiting.
        return markInstalledFromExe(slug, externalEntry, known, "external");
      }
      startInstallerPoll(slug, externalEntry, "external");
      return { status: "installer-opened", editionSlug: externalEntry.editionSlug };
    }
    return { status: "external", editionSlug: entry.editionSlug || editionMeta?.editionSlug };
  }

  const editionExtra = {
    editionSlug: entry.editionSlug || editionMeta?.editionSlug || DEFAULT_EDITION_SLUG,
    editionName: entry.editionName || editionMeta?.editionName || "Official",
    editionType: entry.editionType || editionMeta?.editionType || "official",
    connectArgs: Array.isArray(entry.connectArgs) ? entry.connectArgs : undefined,
  };

  if (entry.kind === "locate-then-zip") {
    return installLocateThenZip(slug, entry, editionExtra);
  }

  const gameDir =
    targetDir ||
    (editionExtra.editionSlug && editionExtra.editionSlug !== DEFAULT_EDITION_SLUG
      ? editionInstallDir(entry.slug, editionExtra.editionSlug)
      : path.join(gamesRoot(), entry.slug));

  sendProgress({ phase: "resolving" });
  const dl = await resolveDownload(entry);
  const downloadPath = path.join(app.getPath("temp"), "playbound-launcher", dl.name);
  try {
    await downloadTo(dl.url, downloadPath);
  } catch (err) {
    const site = entry.editionLinks?.website || entry.url;
    const hint =
      site && String(site).startsWith("http")
        ? ` Open ${site} if the mirror is down.`
        : "";
    throw new Error(`${err.message || err}.${hint}`);
  }
  if (entry.checksumMd5) {
    await verifyChecksumMd5(downloadPath, entry.checksumMd5);
  }

  if (entry.kind === "github-installer" || entry.kind === "direct-installer") {
    sendProgress({
      phase: "installer-ready",
      addon: `Waiting for the ${entry.title || slug} installer to finish…`,
    });
    await shell.openPath(downloadPath);
    const known = findKnownExecutable(entry);
    if (known) {
      const result = markInstalledFromExe(slug, { ...entry, ...editionExtra }, known, dl.version);
      void reportInstall(slug);
      void telemetry.editionInstalled(editionInfoFor(slug, { version: dl?.version, ...editionExtra }));
      return result;
    }
    startInstallerPoll(slug, { ...entry, ...editionExtra }, dl.version);
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
    // Keep play.cmd for Explorer / shortcuts; Play Now launches the jar via javaw.
    await writeJarLauncher(gameDir, dl.name);
    await processAddons(entry, gameDir, selectedAddons);
    markInstalled(slug, { version: dl.version, exe: jarPath, dir: gameDir, ...editionExtra });
    sendProgress({ phase: "done" });
    void reportInstall(slug);
    void telemetry.editionInstalled(editionInfoFor(slug, { version: dl?.version, ...editionExtra }));
    return { status: "installed", version: dl.version, dir: gameDir, editionSlug: editionExtra.editionSlug };
  }

  sendProgress({ phase: "extracting" });
  // Only wipe the edition-specific folder — never the parent game folder.
  await fsp.rm(gameDir, { recursive: true, force: true });
  await extractArchive(downloadPath, gameDir);
  await fsp.rm(downloadPath, { force: true });

  if (entry.overlayUrl) {
    sendProgress({ phase: "downloading", addon: "Game Assets" });
    const overlayName = entry.overlayFileName || "overlay.zip";
    const overlayPath = path.join(app.getPath("temp"), "playbound-launcher", overlayName);
    await downloadTo(entry.overlayUrl, overlayPath);
    sendProgress({ phase: "extracting" });
    await extractArchive(overlayPath, gameDir);
    await fsp.rm(overlayPath, { force: true });
    await flattenWadFiles(gameDir);
  }

  const exe = findExecutable(gameDir, entry.exeHint);
  if (!exe) throw new Error("Extracted, but no executable found");

  await processAddons(entry, gameDir, selectedAddons);
  await maybeApplyEditionPostInstall(entry, gameDir);
  if (entry?.modLoader) {
    await ensureEditionMods(slug, entry, gameDir, exe);
  }
  if (slug === OPENCIV3_SLUG) {
    try {
      // Fresh wipe — write default windowed 1080p beside the exe.
      await ensureDefaultDisplaySettings(exe || gameDir);
    } catch (err) {
      console.warn("[openciv3] display override skipped:", err?.message || err);
    }
  }
  markInstalled(slug, { version: dl.version, exe, dir: gameDir, ...editionExtra });
  sendProgress({ phase: "done" });
  void reportInstall(slug);
  void telemetry.editionInstalled(editionInfoFor(slug, { version: dl?.version, ...editionExtra }));

  const postNote = await maybeOpenEditionPostInstallHandoff(entry, gameDir);
  return {
    status: "installed",
    version: dl.version,
    dir: gameDir,
    editionSlug: editionExtra.editionSlug,
    note: postNote || null,
  };
}

async function flattenWadFiles(gameDir) {
  try {
    const walk = async (dir) => {
      const entries = await fsp.readdir(dir, { withFileTypes: true });
      for (const ent of entries) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          await walk(full);
        } else if (ent.isFile() && ent.name.toLowerCase().endsWith(".wad")) {
          const dest = path.join(gameDir, ent.name);
          if (full !== dest && !fs.existsSync(dest)) {
            await fsp.copyFile(full, dest);
          }
        }
      }
    };
    await walk(gameDir);
  } catch (err) {
    console.warn("[flattenWadFiles] Warning:", err?.message || err);
  }
}

/**
 * Resolve a recipe-supplied relative path inside the game folder.
 *
 * Recipes come from the server, so a crafted `dest` like "../../Windows" must
 * not be able to write outside the install. Returns null when the path would
 * escape, and callers treat that as a failed step rather than falling back to
 * the game root.
 */
function resolveInsideGameDir(gameDir, relative) {
  const rel = String(relative || "").replace(/^[/\\]+/, "");
  if (!rel) return normalizeFsPath(gameDir);
  if (rel.includes("\0")) return null;
  const full = normalizeFsPath(path.resolve(gameDir, rel));
  return pathUnderRoot(full, gameDir) ? full : null;
}

async function processAddons(entry, gameDir, selectedAddons) {
  if (!entry.addons || !Array.isArray(selectedAddons) || selectedAddons.length === 0) return;
  for (const addonId of selectedAddons) {
    const addon = entry.addons.find((a) => a.id === addonId);
    if (!addon) continue;
    sendProgress({ phase: "downloading", addon: addon.name });
    // `dest` places a file in a subfolder (mod loaders expect exact layouts);
    // omitted keeps the historical behaviour of dropping it in the game root.
    const targetDir = resolveInsideGameDir(gameDir, addon.dest || "");
    if (!targetDir) {
      throw new Error(`Addon "${addon.name || addonId}" has an unsafe destination path`);
    }
    await fsp.mkdir(targetDir, { recursive: true });
    const dest = path.join(targetDir, addon.fileName);
    await downloadTo(addon.url, dest);
    if (addon.extract) {
      await extractArchive(dest, targetDir);
      await fsp.rm(dest, { force: true });
    }
  }
}

/* ── mod-loader patching (Aurie) ───────────────────────────────────────── */

/**
 * Whether a PE already carries a named section.
 *
 * Aurie installs itself by appending a ".aurie" section to the game exe, so
 * the section table is the authoritative answer to "are the mods active?" —
 * more reliable than a flag we store, because Steam silently restores the
 * original exe whenever the game updates or is verified, which would leave any
 * stored flag lying.
 */
function peHasSection(exePath, sectionName) {
  let fd = null;
  try {
    fd = fs.openSync(exePath, "r");
    const dos = Buffer.alloc(0x40);
    if (fs.readSync(fd, dos, 0, 0x40, 0) < 0x40) return false;
    if (dos.readUInt16LE(0) !== 0x5a4d) return false; // "MZ"
    const peOffset = dos.readUInt32LE(0x3c);
    const head = Buffer.alloc(0x18);
    if (fs.readSync(fd, head, 0, 0x18, peOffset) < 0x18) return false;
    if (head.readUInt32LE(0) !== 0x00004550) return false; // "PE\0\0"
    const numberOfSections = head.readUInt16LE(6);
    const sizeOfOptionalHeader = head.readUInt16LE(20);
    const sectionTable = peOffset + 0x18 + sizeOfOptionalHeader;
    const want = sectionName.toLowerCase();
    for (let i = 0; i < numberOfSections; i++) {
      const entry = Buffer.alloc(40);
      if (fs.readSync(fd, entry, 0, 40, sectionTable + i * 40) < 40) break;
      const name = entry.subarray(0, 8).toString("latin1").replace(/\0+$/, "").toLowerCase();
      if (name === want) return true;
    }
    return false;
  } catch {
    return false;
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  }
}

function isAuriePatched(exePath) {
  return peHasSection(exePath, ".aurie");
}

/**
 * Bring a modded edition's files and exe patch up to date, idempotently.
 *
 * Called both after install and again before every launch. The second call is
 * not redundant: these editions mod a Steam game in place, and Steam restores
 * the original executable on any update or file verification. Re-checking at
 * launch means the mods quietly repair themselves instead of the player
 * finding the multiplayer menu gone with no explanation.
 *
 * Every step is skipped when already satisfied, so the common case costs a few
 * fs.existsSync calls and one section-table read.
 *
 * @returns {Promise<{ changed: boolean, steps: string[] }>}
 */
async function ensureEditionMods(slug, entry, gameDir, exePath) {
  const spec = entry?.modLoader;
  /*
   * The file-placement loop below is kind-agnostic — download a file, drop it
   * at a destination inside the game folder, optionally unpack it. Only the
   * executable patching after it is Aurie's. Gating the whole function on
   * "aurie" meant no other install shape could reuse the placement half, which
   * is exactly what a RetroArch core needs: fetch the core, drop it in cores/.
   */
  if (!spec) return { changed: false, steps: [] };
  if (!gameDir || !exePath || !fs.existsSync(exePath)) {
    throw new Error("Game folder not found — reinstall the game.");
  }

  const steps = [];
  const files = Array.isArray(spec.files) ? spec.files : [];

  /*
   * A recipe can move a file between dests — YYToolkit went mods/Native ->
   * mods/Aurie once we learned native modules are mapped raw at process attach
   * and never run the Aurie module lifecycle, so the interface it registers
   * from mods/Aurie never appeared. Placement below is copy-only, so without
   * this an already-installed player keeps the old copy and loads the DLL
   * twice. Bounded to filenames and folders this same recipe declares, and
   * skips any pair the recipe actually wants, so it can only clean up after
   * itself.
   */
  const wanted = new Set(files.map((f) => `${f.dest || ""}|${f.fileName}`));
  const dests = [...new Set(files.map((f) => f.dest || ""))];
  for (const file of files) {
    if (file.extract) continue;
    for (const dest of dests) {
      if (dest === (file.dest || "") || wanted.has(`${dest}|${file.fileName}`)) continue;
      const staleDir = resolveInsideGameDir(gameDir, dest);
      if (!staleDir) continue;
      const stale = path.join(staleDir, file.fileName);
      if (!fs.existsSync(stale)) continue;
      await fsp.rm(stale, { force: true });
      steps.push(`removed stale ${file.fileName} from ${dest}`);
    }
  }

  for (const file of files) {
    const targetDir = resolveInsideGameDir(gameDir, file.dest || "");
    if (!targetDir) {
      throw new Error(`Mod file "${file.fileName}" has an unsafe destination path`);
    }
    // For archives the marker is what the archive unpacks to, so a completed
    // extraction is not repeated on every launch.
    const marker = path.join(targetDir, file.extract ? file.extractedMarker || file.fileName : file.fileName);
    if (fs.existsSync(marker)) continue;

    sendProgress({ phase: "downloading", addon: file.fileName });
    await fsp.mkdir(targetDir, { recursive: true });
    const dl = path.join(targetDir, file.fileName);
    await downloadTo(file.url, dl);
    if (file.extract) {
      sendProgress({ phase: "extracting", addon: file.fileName });
      await extractArchive(dl, targetDir);
      await fsp.rm(dl, { force: true });
    }
    steps.push(`placed ${file.fileName}`);
  }

  // Everything past here patches the game executable, which only Aurie does.
  // A RetroArch-style recipe is finished once its files are in place.
  if (spec.kind !== "aurie") return { changed: steps.length > 0, steps };

  if (!isAuriePatched(exePath)) {
    const patcherDir = resolveInsideGameDir(gameDir, spec.patcherDest || "");
    const nativeDir = resolveInsideGameDir(gameDir, spec.nativeDllDest || "");
    if (!patcherDir || !nativeDir) {
      throw new Error("Mod loader has an unsafe destination path");
    }
    const patcher = path.join(patcherDir, spec.patcherFileName);
    const nativeDll = path.join(nativeDir, spec.nativeDllFileName);
    if (!fs.existsSync(patcher) || !fs.existsSync(nativeDll)) {
      throw new Error("Mod loader files are missing — reinstall the edition.");
    }
    await waitForWritableExecutable(exePath, entry?.title || entry?.gameTitle);
    sendProgress({ phase: "installer-ready", addon: "Enabling mods" });
    await runAuriePatcher(patcher, exePath, nativeDll, "install");
    // Trust the executable, not the patcher's exit code.
    if (!isAuriePatched(exePath)) {
      throw new Error("Mod loader ran but the game executable is not patched.");
    }
    steps.push("patched executable");
  }

  return { changed: steps.length > 0, steps };
}

/** Undo the exe patch so the game is left exactly as Steam shipped it. */
async function removeEditionModPatch(entry, gameDir, exePath) {
  const spec = entry?.modLoader;
  if (!spec || spec.kind !== "aurie") return;
  if (!gameDir || !exePath || !fs.existsSync(exePath)) return;
  if (!isAuriePatched(exePath)) return;
  const patcherDir = resolveInsideGameDir(gameDir, spec.patcherDest || "");
  const nativeDir = resolveInsideGameDir(gameDir, spec.nativeDllDest || "");
  if (!patcherDir || !nativeDir) return;
  const patcher = path.join(patcherDir, spec.patcherFileName);
  const nativeDll = path.join(nativeDir, spec.nativeDllFileName);
  if (!fs.existsSync(patcher)) return;
  try {
    await runAuriePatcher(patcher, exePath, nativeDll, "remove");
  } catch (err) {
    // Non-fatal: Steam's "Verify integrity of game files" also restores the
    // original executable, so a failed unpatch is recoverable by the user.
    console.warn("Aurie unpatch failed:", err?.message || err);
  }
}

/**
 * Whether the executable is currently locked against writing.
 *
 * Windows maps a running image with FILE_SHARE_READ and no write sharing, so
 * asking for write access to a game that is on screen fails with a sharing
 * violation, which Node surfaces as EBUSY. Anything else — missing file, an
 * unexpected errno — is reported as "not locked" so the caller's real error
 * path handles it rather than this probe inventing a diagnosis.
 */
function isExecutableLocked(exePath) {
  let fd;
  try {
    fd = fs.openSync(exePath, "r+");
    return false;
  } catch (err) {
    const code = err?.code;
    return code === "EBUSY" || code === "EPERM" || code === "EACCES";
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        /* nothing useful to do */
      }
    }
  }
}

/**
 * Block until the game executable can be written, or give up with an
 * instruction the player can act on.
 *
 * AuriePatcher rewrites the executable in place and exits 5
 * (ERROR_ACCESS_DENIED) when it cannot, saying nothing about why. That is the
 * common case rather than an edge one: Steam's button for an unclaimed
 * free-to-play title reads "Play Game", so the click that installs the game
 * also launches it, and our installer poll notices the new executable while it
 * is still running. Writing *new* files into the game folder keeps working
 * throughout, which is why the mod payload lands and only the patch step
 * fails — a shape that reads as a permissions problem but is not one.
 *
 * Waiting rather than failing means the ordinary path (player alt-tabs out and
 * quits) needs nothing explained to them at all.
 */
async function waitForWritableExecutable(exePath, title, timeoutMs = 90_000) {
  if (!isExecutableLocked(exePath)) return;
  const name = title || path.basename(exePath);
  sendProgress({ phase: "installer-ready", addon: `Waiting for ${name} to close` });
  if (win && !win.isDestroyed()) {
    win.webContents.send("install-scan", {
      slug: null,
      phase: "waiting",
      message: `${name} is running — close it to finish enabling mods.`,
    });
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    if (!isExecutableLocked(exePath)) return;
  }
  throw new Error(
    `${name} is still running, so the mod loader can't modify it. Close the game, then press Install again.`
  );
}

/**
 * Run AuriePatcher headlessly.
 *
 * With four argv entries the patcher takes the non-interactive path and every
 * MessageBox is suppressed (see g_InteractiveInstall in AuriePatcher's
 * main.cpp), so this completes without any dialog for the user to dismiss.
 */
function runAuriePatcher(patcherPath, exePath, nativeDllPath, action) {
  return new Promise((resolve, reject) => {
    const child = spawn(patcherPath, [exePath, nativeDllPath, action], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout?.on("data", (d) => (out += d));
    child.stderr?.on("data", (d) => (out += d));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(out);
        return;
      }
      /*
       * Exit 5 is ERROR_ACCESS_DENIED, which here almost always means the game
       * was launched between the writability check and this call rather than
       * anything to do with file permissions — the patcher rewrites the
       * executable in place and Windows refuses while it is running.
       */
      const hint =
        code === 5
          ? " The game appears to be running — close it and press Install again."
          : "";
      reject(
        new Error(
          `AuriePatcher ${action} failed (exit ${code}).${hint} ${out.trim().slice(0, 300)}`
        )
      );
    });
  });
}

/**
 * Quarm: drop latest eqw.dll into the client folder when a GitHub recipe
 * (or default CoastalRedwood repo) is available.
 */
async function maybeApplyEditionPostInstall(entry, gameDir) {
  if (!entry?.postInstallEqw && entry?.editionSlug !== "project-quarm") return;
  try {
    const repo = "CoastalRedwood/eqw_takp";
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { accept: "application/vnd.github+json", "user-agent": "playbound-launcher" },
    });
    if (!res.ok) return;
    const data = await res.json();
    const asset = (data.assets || []).find((a) => /\.dll$/i.test(a.name) || /eqw/i.test(a.name));
    const url = asset?.browser_download_url;
    if (!url) return;
    const destName = asset.name.toLowerCase().endsWith(".dll") ? asset.name : "eqw.dll";
    const dest = path.join(gameDir, destName === "eqw.dll" ? "eqw.dll" : destName);
    sendProgress({ phase: "downloading", addon: "eqw.dll" });
    await downloadTo(url, dest);
    if (destName.toLowerCase() !== "eqw.dll") {
      await fsp.copyFile(dest, path.join(gameDir, "eqw.dll")).catch(() => {});
    }
  } catch (err) {
    console.warn("eqw.dll post-install skipped:", err?.message || err);
  }
}

/**
 * Post-install hand-off for editions that still need a manual patch step.
 *
 * This used to throw the player out to Discord in the middle of installing,
 * including for any edition whose slug happened to be project-quarm even when
 * the recipe asked for no such thing. Being bounced into a chat app by an
 * install reads as the install going wrong, so the folder is opened and the
 * remaining step is stated in the launcher instead. The Discord link is still
 * on the edition page for whoever wants it.
 */
async function maybeOpenEditionPostInstallHandoff(entry, gameDir) {
  if (!entry?.postInstallDiscord) return null;
  if (gameDir && fs.existsSync(gameDir)) {
    try {
      await shell.openPath(gameDir);
    } catch {
      /* ignore */
    }
  }
  return "Base client installed. Add the latest patch from the edition's Discord #server-files to the opened folder before logging in.";
}

/**
 * P99-style: user picks an existing Titanium client folder, we copy it into
 * the edition dir, then merge an overlay zip (P99Files) without wiping assets.
 */
async function installLocateThenZip(slug, entry, editionExtra) {
  const result = await dialog.showOpenDialog(win || undefined, {
    title: `Select existing ${entry.title || slug} / Titanium folder (eqgame.exe)`,
    properties: ["openDirectory"],
  });
  if (result.canceled || !result.filePaths?.[0]) {
    const wiki =
      entry?.editionLinks?.wiki ||
      entry?.note ||
      "https://www.project1999.com/";
    try {
      await safeOpenExternal(
        typeof wiki === "string" && wiki.startsWith("http") ? wiki : "https://wiki.project1999.com/"
      );
    } catch {
      /* ignore */
    }
    return {
      status: "cancelled",
      note: "Select a legal Titanium EverQuest install folder, then try Install again.",
    };
  }

  let sourceDir = result.filePaths[0];
  const sourceExe = path.join(sourceDir, "eqgame.exe");
  if (!fs.existsSync(sourceExe)) {
    // Allow picking a parent; search one level down.
    const nested = fs
      .readdirSync(sourceDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(sourceDir, d.name))
      .find((dir) => fs.existsSync(path.join(dir, "eqgame.exe")));
    if (nested) sourceDir = nested;
    else {
      throw new Error("That folder does not contain eqgame.exe. Pick your Titanium EverQuest install.");
    }
  }

  const gameDir =
    editionExtra.editionSlug && editionExtra.editionSlug !== DEFAULT_EDITION_SLUG
      ? editionInstallDir(slug, editionExtra.editionSlug)
      : path.join(gamesRoot(), slug);

  sendProgress({ phase: "extracting" });
  await fsp.rm(gameDir, { recursive: true, force: true });
  await fsp.mkdir(path.dirname(gameDir), { recursive: true });
  await fsp.cp(sourceDir, gameDir, { recursive: true });

  const overlayUrl = entry.overlayUrl || entry.url;
  if (!overlayUrl) throw new Error("No overlay zip URL configured for this edition.");

  sendProgress({ phase: "resolving" });
  const overlayName = entry.overlayFileName || entry.fileName || "overlay.zip";
  const downloadPath = path.join(app.getPath("temp"), "playbound-launcher", overlayName);
  await downloadTo(overlayUrl, downloadPath);
  sendProgress({ phase: "extracting" });
  // Merge overlay into the copied Titanium tree (do not delete gameDir).
  await extractArchive(downloadPath, gameDir);
  await fsp.rm(downloadPath, { force: true });

  const exe = findExecutable(gameDir, entry.exeHint || "eqgame");
  if (!exe) throw new Error("Install copied, but eqgame.exe was not found.");

  const version = entry.versionLabel || "located+overlay";
  markInstalled(slug, {
    version,
    exe,
    dir: gameDir,
    ...editionExtra,
    connectArgs: editionExtra.connectArgs || entry.connectArgs || ["patchme"],
  });
  sendProgress({ phase: "done" });
  void reportInstall(slug);
  void telemetry.editionInstalled(editionInfoFor(slug, { version, ...editionExtra }));
  return {
    status: "installed",
    version,
    dir: gameDir,
    editionSlug: editionExtra.editionSlug,
  };
}

async function locateGameExecutable(slug) {
  stopExeScan(slug);
  const entry = (await ensureCatalogEntry(slug)) || catalog.find((e) => e.slug === slug);
  if (!entry) throw new Error(`Unknown game: ${slug}`);

  const known = findKnownExecutable(entry);
  if (known) {
    return markInstalledFromExe(slug, entry, known, "located");
  }

  const result = await dialog.showOpenDialog(win, {
    title:
      process.platform === "darwin"
        ? `Locate ${entry.title}`
        : `Locate ${entry.title} executable`,
    filters:
      process.platform === "darwin"
        ? [
            { name: "Applications", extensions: ["app"] },
            { name: "Java / binaries", extensions: ["jar", "*"] },
            { name: "All Files", extensions: ["*"] },
          ]
        : [{ name: "Executables", extensions: ["exe", "cmd", "bat", "jar"] }],
    properties:
      process.platform === "darwin"
        ? ["openFile", "treatPackageAsDirectory"]
        : ["openFile"],
  });
  if (result.canceled || result.filePaths.length === 0) return { status: "cancelled" };

  let exe = result.filePaths[0];
  // If the user opened an .app package as a directory and picked Contents/..., climb to .app.
  if (process.platform === "darwin" && !exe.endsWith(".app")) {
    const parts = exe.split(path.sep);
    const appIdx = parts.findIndex((p) => p.endsWith(".app"));
    if (appIdx >= 0) {
      exe = parts.slice(0, appIdx + 1).join(path.sep);
    }
  }
  return markInstalledFromExe(slug, entry, exe, "located");
}

async function addCustomGameExecutable(customTitle = null) {
  const result = await dialog.showOpenDialog(win, {
    title:
      process.platform === "darwin"
        ? "Select Game Application"
        : "Select Game Executable",
    filters:
      process.platform === "darwin"
        ? [
            { name: "Applications", extensions: ["app"] },
            { name: "Java / binaries", extensions: ["jar", "*"] },
            { name: "All Files", extensions: ["*"] },
          ]
        : [{ name: "Executables", extensions: ["exe", "cmd", "bat", "jar"] }],
    properties:
      process.platform === "darwin"
        ? ["openFile", "treatPackageAsDirectory"]
        : ["openFile"],
  });
  if (result.canceled || result.filePaths.length === 0) return { status: "cancelled" };

  let exe = result.filePaths[0];
  if (process.platform === "darwin" && !exe.endsWith(".app")) {
    const parts = exe.split(path.sep);
    const appIdx = parts.findIndex((p) => p.endsWith(".app"));
    if (appIdx >= 0) {
      exe = parts.slice(0, appIdx + 1).join(path.sep);
    }
  }

  const baseName = path.basename(exe, path.extname(exe));
  const rawTitle =
    customTitle ||
    baseName
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim() ||
    "Custom Game";
  const slug = `custom-${baseName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || Date.now()}`;
  const dir = path.dirname(exe);

  const state = loadState();
  const game = {
    slug,
    title: rawTitle,
    exe,
    dir,
    custom: true,
    version: "local",
    installedAt: new Date().toISOString(),
    editionSlug: "default",
    editionName: "Custom",
    editions: {
      default: {
        exe,
        dir,
        editionSlug: "default",
        editionName: "Custom",
        installedAt: new Date().toISOString(),
      },
    },
  };
  state[slug] = game;
  saveState(state);
  notifyInstallDetected(slug);
  return { status: "installed", slug, title: rawTitle, exe, dir };
}

async function placeModFiles(slug, install, baseDirOverride) {
  const dl = await resolveModDownload(install);
  let targetDir = resolveModTargetDir(
    install.baseGameSlug,
    install.installRelativePath,
    baseDirOverride,
    slug
  );
  // Full portable clients (OpenRA-style) install beside other PlayBound games.
  const portable = /winportable/i.test(dl.name || "");
  if (portable) {
    targetDir = path.join(gamesRoot(), slug);
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
  const isArchive = /\.(zip|dmg|tar\.gz|tgz|tar\.xz)$/i.test(dl.name);
  if (isArchive && !/\.jar$/i.test(dl.name)) {
    sendProgress({ phase: "extracting" });
    await extractArchive(downloadPath, targetDir);
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

  let installedDir = targetDir;
  if (install.baseGameSlug === "flightgear" && !isFlightGearAircraftMod(install.installRelativePath)) {
    const addonDir = findDirContainingFile(targetDir, "addon-main.nas");
    if (addonDir) installedDir = addonDir;
  }

  const state = loadState();
  if (!state.__mods__ || typeof state.__mods__ !== "object") state.__mods__ = {};
  state.__mods__[slug] = {
    title: install.title || slug,
    version: dl.version,
    dir: installedDir,
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
    dir: installedDir,
    baseGameSlug: install.baseGameSlug,
    exe: exe || null,
    portable,
  };
}

async function installMod(slug, baseDirOverride) {
  try {
    return await installModInner(slug, baseDirOverride);
  } catch (err) {
    reportInstallFailed(slug, null, err, "install-mod");
    throw err;
  }
}

async function installModInner(slug, baseDirOverride) {
  sendProgress({ phase: "resolving" });
  const install = await fetchModInstall(slug);

  if (install.downloadKind === "external") {
    await safeOpenExternal(install.url || `${getApiBase()}/mods/${slug}`, {
      campaign: "launcher_mod_website",
      content: slug,
    });
    return { status: "external", url: install.url || null };
  }

  // OpenRA-style portable clients ship their own engine — no base game required.
  const portableAsset = /winportable/i.test(String(install.assetPattern || ""));
  if (portableAsset && !baseDirOverride) {
    return placeModFiles(slug, install, null);
  }

  const userDataMod = modUsesUserDataFolder(install.baseGameSlug, install.installRelativePath);
  let targetDir = resolveModTargetDir(
    install.baseGameSlug,
    install.installRelativePath,
    baseDirOverride,
    slug
  );
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

/**
 * Outer safety net so every launch failure is reported, not just the ones
 * playGameInner already knows how to classify. Anything thrown before
 * reaching (or outside) its try/catch — a corrupted settings read, a future
 * code path that forgets to call telemetry itself — still gets a
 * launch_failed event instead of silently rejecting the IPC call.
 * playGameInner tags errors it already reported so this doesn't double them.
 */
async function playGame(slug, join = null, editionSlug = null) {
  try {
    return await playGameInner(slug, join, editionSlug);
  } catch (err) {
    if (!err || !err.__launchFailedReported) {
      try {
        void telemetry.launchFailed({
          ...editionInfoFor(slug, { editionSlug: editionSlug || DEFAULT_EDITION_SLUG }),
          code: err?.code || "UNKNOWN",
          message: String(err?.message || err || "Launch failed").slice(0, 1000),
          phase: "play",
        });
      } catch {
        /* never block launch failure surfacing on telemetry */
      }
    }
    throw err;
  }
}

async function playGameInner(slug, join = null, editionSlug = null) {
  const state = loadState();
  const game = ensureGameInstallRecord(state[slug]);
  const edSlug = editionSlug || game.editionSlug || DEFAULT_EDITION_SLUG;
  const launchInfo = () =>
    editionInfoFor(slug, {
      version: game.version,
      editionSlug: edSlug,
    });

  void telemetry.launchAttempted({ ...launchInfo(), phase: join?.host ? "join" : "play" });

  let info = game.editions?.[edSlug] || null;
  if ((!info || !(info.exe && fs.existsSync(info.exe))) && game.exe && fs.existsSync(game.exe)) {
    info = {
      exe: game.exe,
      dir: game.dir,
      version: game.version,
      editionSlug: game.editionSlug,
      connectArgs: game.connectArgs,
    };
  }
  if (!info || !info.exe || !fs.existsSync(info.exe)) {
    const message = editionSlug ? "That edition is not installed" : "Not installed";
    void telemetry.launchFailed({
      ...launchInfo(),
      code: "NOT_INSTALLED",
      message,
      phase: "resolve-install",
    });
    const notInstalledErr = new Error(message);
    notInstalledErr.__launchFailedReported = true;
    throw notInstalledErr;
  }

  if (slug === OPENCIV3_SLUG) {
    try {
      await ensureDefaultDisplaySettings(info.exe || info.dir);
    } catch (err) {
      console.warn("[openciv3] display ensure skipped:", err?.message || err);
    }
  }

  if (isOpenRaFamily(slug, catalog.find((e) => e.slug === slug))) {
    try {
      await prepareOpenRaNetwork({ exePath: info.exe });
    } catch (err) {
      console.warn("[openra-nat] prepare skipped:", err?.message || err);
    }
  }

  // Prefer connectArgs stored on the edition install; fall back to catalog entry.
  let connectArgs = Array.isArray(info.connectArgs) ? info.connectArgs : null;
  const entry = catalog.find((e) => e.slug === slug);
  if (!connectArgs && Array.isArray(entry?.connectArgs)) connectArgs = entry.connectArgs;

  /*
   * Games we host dedicated servers for take their connect syntax from
   * services/connectArgs.js instead. The install record captures connectArgs at
   * install time, so a catalog fix would never reach an existing install, and a
   * wrong template here means "Join Game" on a party lands the player on the
   * main menu with no indication why.
   */
  if (hasClientConnectArgs(slug)) {
    connectArgs = clientConnectArgs(slug);
  }

  // Edition recipe may not be on the base catalog — refresh from launcher editions API.
  if (!connectArgs && editionSlug) {
    try {
      const ed = await resolveEditionForInstall(slug, editionSlug);
      const fromEd = catalogEntryFromEdition(ed);
      if (Array.isArray(fromEd?.connectArgs)) connectArgs = fromEd.connectArgs;
    } catch {
      /* offline */
    }
  }

  const args = [];
  if (join?.host && join?.port && Array.isArray(connectArgs)) {
    for (const template of connectArgs) {
      args.push(
        String(template)
          .replaceAll("{host}", join.host)
          .replaceAll("{port}", String(join.port))
          .replaceAll("{name}", join.name || "")
      );
    }
  } else if (Array.isArray(connectArgs) && connectArgs.length) {
    // Static args like "patchme" (P99) — apply when not templated for server join.
    const staticArgs = connectArgs.filter((t) => !String(t).includes("{host}"));
    args.push(...staticArgs.map(String));
  }

  if (join?.host && join?.port) {
    void telemetry.track("join_attempted", {
      ...launchInfo(),
      host: join.host,
      port: join.port,
      connectArgsApplied: args.length > 0,
      manualConnect: Boolean(!connectArgs?.length),
    });
  }

  if (slug === "flightgear") {
    args.push(...flightGearAddonLaunchArgs(state));
  }

  // Legacy github-jar installs pointed at play.cmd — prefer the sidecar .jar.
  const launchPath = GameLauncher.preferJarBesideLauncher(info.exe);
  if (launchPath !== info.exe && /\.jar$/i.test(launchPath)) {
    try {
      const st = loadState();
      const g = ensureGameInstallRecord(st[slug]);
      if (g.editions?.[edSlug]) {
        g.editions[edSlug].exe = launchPath;
        syncGameInstallSummary(g);
        st[slug] = g;
        saveState(st);
      }
    } catch {
      /* ignore heal persist */
    }
  }

  // Repair modded editions before launching. Steam restores the original
  // executable on update or file verification, which silently strips the mod
  // loader; without this the player would just find the modded menus gone.
  if (entry?.modLoader) {
    try {
      const result = await ensureEditionMods(slug, entry, info.dir, info.exe);
      if (result.changed) {
        void telemetry.track("edition_mods_repaired", {
          gameSlug: slug,
          editionSlug: info.editionSlug || edSlug,
          steps: result.steps.join(", "),
        });
      }
    } catch (err) {
      const message = `Couldn't enable this edition's mods: ${err?.message || err}`;
      void telemetry.launchFailed({
        ...editionInfoFor(slug, { version: info.version, editionSlug: info.editionSlug || edSlug }),
        code: "MOD_LOADER_FAILED",
        message,
        phase: "mod-repair",
      });
      const out = new Error(message);
      out.code = "MOD_LOADER_FAILED";
      out.__launchFailedReported = true;
      throw out;
    }
  }

  try {
    await spawnTrackedExe(slug, launchPath, args);
  } catch (err) {
    const rawMessage = err?.message || String(err);
    const exeName = path.basename(launchPath || "") || "game";
    let code = "UNKNOWN";
    let message = rawMessage;
    if (err?.code === "JAVA_MISSING" || /Java 17\+/i.test(rawMessage)) {
      code = "JAVA_MISSING";
    } else if (/exited immediately/i.test(rawMessage)) {
      code = "JAVA_EARLY_EXIT";
    } else if (err?.code === "SHELL_LAUNCH_BLOCKED" || /bat\/\.cmd launcher/i.test(rawMessage)) {
      code = "SHELL_LAUNCH_BLOCKED";
    } else if (/outside allowed install locations/i.test(rawMessage)) {
      code = "SPAWN_PATH_DENIED";
    } else if (
      err?.code === "UNKNOWN" ||
      /^spawn\s+UNKNOWN/i.test(rawMessage) ||
      /spawn\s+unknown/i.test(rawMessage)
    ) {
      code = "SPAWN_UNKNOWN";
      message = `Couldn't start ${exeName} (wrong CPU architecture or blocked executable). Try reinstalling or use Locate to pick the correct .exe.`;
    } else if (err?.code === "ENOENT" || /ENOENT|not runnable|file missing/i.test(rawMessage)) {
      code = "SPAWN_ENOENT";
    }

    // Offer one-click managed Java install, then retry once.
    if (code === "JAVA_MISSING") {
      const offered = await offerManagedJavaInstall({ gameTitle: entry?.title || slug });
      if (offered.installed) {
        try {
          await spawnTrackedExe(slug, launchPath, args);
          // Fall through to success path below via jumping past failure
          void telemetry.editionLaunched(
            editionInfoFor(slug, {
              version: info.version,
              editionSlug: info.editionSlug || edSlug,
            })
          );
          const settingsOk = loadSettings();
          if (!settingsOk.recentlyPlayed) settingsOk.recentlyPlayed = {};
          settingsOk.recentlyPlayed[slug] = { lastPlayed: new Date().toISOString() };
          saveSettings(settingsOk);
          try {
            const st = loadState();
            const g = ensureGameInstallRecord(st[slug]);
            if (g.editions?.[edSlug]) {
              g.editions[edSlug].installedAt = new Date().toISOString();
              syncGameInstallSummary(g);
              st[slug] = g;
              saveState(st);
            }
          } catch {
            /* ignore */
          }
          return {
            status: "launched",
            connect: args.length > 0 && join?.host ? `${join.host}:${join.port}` : null,
            manualConnect: Boolean(join?.host && join?.port && !connectArgs?.length),
            editionSlug: info.editionSlug || edSlug,
            javaInstalled: true,
          };
        } catch (retryErr) {
          const retryMessage = retryErr?.message || String(retryErr);
          void telemetry.launchFailed({
            ...editionInfoFor(slug, {
              version: info.version,
              editionSlug: info.editionSlug || edSlug,
            }),
            code: "JAVA_MISSING",
            message: retryMessage,
            phase: "spawn-after-java-install",
          });
          const reportedRetryErr = retryErr instanceof Error ? retryErr : new Error(retryMessage);
          reportedRetryErr.__launchFailedReported = true;
          throw reportedRetryErr;
        }
      }
      if (offered.cancelled) {
        void telemetry.launchFailed({
          ...editionInfoFor(slug, {
            version: info.version,
            editionSlug: info.editionSlug || edSlug,
          }),
          code: "JAVA_MISSING",
          message: "User declined managed Java install",
          phase: "spawn",
        });
        const declinedErr = new Error(
          "Java 17+ is required. Install it from Settings → Java runtime, then try again."
        );
        declinedErr.__launchFailedReported = true;
        throw declinedErr;
      }
      if (offered.error) {
        void telemetry.launchFailed({
          ...editionInfoFor(slug, {
            version: info.version,
            editionSlug: info.editionSlug || edSlug,
          }),
          code: "JAVA_MISSING",
          message: offered.error,
          phase: "java-install",
        });
        const javaInstallErr = new Error(
          `Couldn’t install Java automatically (${offered.error}). Install JDK 17+ from https://adoptium.net/ or retry from Settings.`
        );
        javaInstallErr.__launchFailedReported = true;
        throw javaInstallErr;
      }
    }

    void telemetry.launchFailed({
      ...editionInfoFor(slug, {
        version: info.version,
        editionSlug: info.editionSlug || edSlug,
      }),
      code,
      message,
      phase: "spawn",
    });
    const out = new Error(message);
    out.code = code;
    out.__launchFailedReported = true;
    throw out;
  }

  void telemetry.editionLaunched(
    editionInfoFor(slug, {
      version: info.version,
      editionSlug: info.editionSlug || edSlug,
    })
  );

  const settings = loadSettings();
  if (!settings.recentlyPlayed) settings.recentlyPlayed = {};
  settings.recentlyPlayed[slug] = { lastPlayed: new Date().toISOString() };
  saveSettings(settings);

  // Touch summary so "primary" edition matches last played.
  try {
    const st = loadState();
    const g = ensureGameInstallRecord(st[slug]);
    if (g.editions?.[edSlug]) {
      g.editions[edSlug].installedAt = new Date().toISOString();
      syncGameInstallSummary(g);
      st[slug] = g;
      saveState(st);
    }
  } catch {
    /* ignore */
  }

  return {
    status: "launched",
    connect: args.length > 0 && join?.host ? `${join.host}:${join.port}` : null,
    manualConnect: Boolean(join?.host && join?.port && !connectArgs?.length),
    editionSlug: info.editionSlug || edSlug,
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
  void snapshotSavesAfterPlay(slug);
  if (win && !win.isDestroyed()) {
    win.webContents.send("game-exited", { slug });
  }
}

function playingGameSlug() {
  return activeLaunches.keys().next().value || null;
}

function sendGameStarted(slug) {
  if (win && !win.isDestroyed()) {
    win.webContents.send("game-started", { slug });
  }
}

/**
 * Back up a game's saves once it closes.
 *
 * Deliberately local-only and shipped ahead of any cloud transport: the thing
 * that actually loses people's progress is a game corrupting its own save or a
 * player overwriting the wrong slot, and a local versioned history fixes that
 * without a server, an account, or a network round trip.
 *
 * Exiting is the right moment — the files have just been written and are not
 * being held open. Failures are logged and swallowed; a backup must never be
 * able to interfere with having just finished playing.
 */
async function snapshotSavesAfterPlay(slug) {
  try {
    if (!saveLocations.supportsCloudSaves(slug)) return;
    const saveDir = saveLocations.saveDirFor(slug);
    if (!saveDir || !fs.existsSync(saveDir)) return;

    const state = loadState();
    const game = ensureGameInstallRecord(state[slug]);
    const editionSlug = game.editionSlug || DEFAULT_EDITION_SLUG;

    const policy = saveLocations.policyFor(slug);
    const result = await saveData.snapshot(slug, editionSlug, saveDir, {
      reason: "after-play",
      maxSnapshotMb: policy.maxSnapshotMb,
    });

    if (result.status === "too-large") {
      // Sandbox worlds outgrow this legitimately. Say so once rather than
      // silently doing nothing, so a player is never under the impression
      // their saves are protected when they are not.
      console.warn(
        `[saves] ${slug}: saves are ${(result.bytes / 1048576).toFixed(0)}MB, over the ` +
          `${policy.maxSnapshotMb}MB limit — skipping backup.`
      );
      return;
    }
    if (result.status !== "captured") return;

    await saveData.prune(slug, editionSlug, policy.keep);
    console.log(`[saves] ${slug}: captured ${result.files} file(s) as ${result.id}`);
  } catch (err) {
    console.warn(`[saves] snapshot after play failed for ${slug}:`, err?.message || err);
  }
}

function clearLaunchTracking(slug, { beat = false } = {}) {
  const launch = activeLaunches.get(slug);
  if (!launch) return;
  if (launch.settleTimer) clearTimeout(launch.settleTimer);
  if (launch.pollTimer) clearInterval(launch.pollTimer);
  activeLaunches.delete(slug);
  if (beat) void beatLauncherPresence();
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
          clearLaunchTracking(slug, { beat: true });
          sendGameExited(slug);
        }
      }, GAME_RUNNING_POLL_MS);
    } else {
      clearLaunchTracking(slug, { beat: true });
      sendGameExited(slug);
    }
  }, GAME_EXIT_DEBOUNCE_MS);
}

/**
 * Spawn a game exe (detached so it can outlive the launcher) and watch for exit.
 * Handles short bootstrap processes (e.g. OpenRA.exe → RedAlert.exe) by polling
 * catalog exeHint image names after the child exits.
 * Rejects on immediate spawn failure (ENOENT / missing Java) so Play Now is not a false success.
 * All launches wait briefly so a process that dies instantly is not reported as success.
 */
function spawnTrackedExe(slug, exePath, args = []) {
  clearLaunchTracking(slug);
  if (!isAllowedExecutablePath(exePath)) {
    throw new Error("Executable path is outside allowed install locations");
  }
  const isJar = /\.jar$/i.test(exePath);
  const EARLY_WATCH_MS = 2000;

  let child;
  try {
    child = GameLauncher.spawnGame(exePath, args);
  } catch (err) {
    const msg =
      err?.code === "JAVA_MISSING" || /Java 17\+/i.test(String(err?.message || ""))
        ? err.message || GameLauncher.JAVA_MISSING_MSG
        : err?.message || String(err);
    throw new Error(msg);
  }

  const entry = catalog.find((e) => e.slug === slug);
  const imageNames = [
    ...new Set(
      [
        normalizeProcessImageName(exePath),
        ...(isJar ? ["javaw.exe", "java.exe"] : []),
        ...hintProcessNames(entry?.exeHint),
      ].filter(Boolean)
    ),
  ];

  activeLaunches.set(slug, {
    child,
    imageNames,
    pollTimer: null,
    settleTimer: null,
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    const succeed = () => {
      if (settled) return;
      settled = true;
      try {
        child.unref();
      } catch {
        /* ignore */
      }
      void beatLauncherPresence();
      sendGameStarted(slug);
      resolve(child);
    };
    const fail = (err) => {
      if (settled) return;
      settled = true;
      clearLaunchTracking(slug);
      const code = err?.code;
      if (code === "ENOENT") {
        reject(
          new Error(
            isJar
              ? GameLauncher.JAVA_MISSING_MSG
              : `Couldn't start ${path.basename(exePath)} (file missing or not runnable).`
          )
        );
        return;
      }
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    const earlyExitMsg = isJar
      ? GameLauncher.JAVA_EARLY_EXIT_MSG
      : `The game exited immediately after launch (${path.basename(exePath)}). Open Folder and try running it manually, check GPU drivers, or reinstall.`;

    const failEarly = () => fail(new Error(earlyExitMsg));

    const processStillAlive = () => {
      if (child.exitCode == null && child.signalCode == null && child.pid) return true;
      return isAnyImageRunning(imageNames);
    };

    child.once("error", fail);

    const onEarlyExit = () => {
      if (settled) {
        onSpawnedProcessGone(slug);
        return;
      }
      // Bootstrap exes (OpenRA → RedAlert) exit quickly while the real game keeps running.
      if (isAnyImageRunning(imageNames)) {
        onSpawnedProcessGone(slug);
        succeed();
        return;
      }
      failEarly();
    };
    child.once("exit", onEarlyExit);

    setTimeout(() => {
      if (settled) return;
      if (!processStillAlive()) {
        failEarly();
        return;
      }
      child.removeListener("exit", onEarlyExit);
      child.on("exit", () => onSpawnedProcessGone(slug));
      succeed();
    }, EARLY_WATCH_MS);
  });
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
    await spawnTrackedExe(slug, exe, []);
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

async function confirmAndUninstallGame(slug, editionSlug = null) {
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
    message: editionSlug ? `Uninstall ${title} — ${editionSlug}?` : `Uninstall ${title}?`,
    detail: editionSlug
      ? "Removes this edition folder and every PlayBound mod for this game. Other editions stay installed."
      : "This removes all PlayBound edition folders for this game from this PC, including its mods.",
  });
  if (response !== 0) return { status: "cancelled" };
  return uninstallGame(slug, editionSlug || null);
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
    message: `Uninstall ${title}?`,
    detail: "This removes the mod from this PC, including its PlayBound install folder.",
  });
  if (response !== 0) return { status: "cancelled" };
  return uninstallMod(slug);
}

/** Web handoff already confirmed intent — uninstall without a second dialog. */
/**
 * Ask before a deep link destroys anything.
 *
 * Deep links are reachable by any web page: a link in a chat message is enough
 * to invoke one. That is fine for install or play, which are additive and
 * visible, but uninstall deletes a directory — and for plenty of games the save
 * files live inside it. Nothing outside the app gets to make that call silently.
 */
async function confirmDestructiveDeepLink(title, detail) {
  showMainWindow();
  const parent = win && !win.isDestroyed() ? win : null;
  const opts = {
    type: "warning",
    buttons: ["Cancel", "Remove"],
    defaultId: 0,
    cancelId: 0,
    title: "PlayBound",
    message: title,
    detail,
  };
  const { response } = parent
    ? await dialog.showMessageBox(parent, opts)
    : await dialog.showMessageBox(opts);
  return response === 1;
}

async function uninstallGameFromDeepLink(slug, editionSlug = null) {
  await ensureCatalogEntry(slug);
  const entry = catalog.find((e) => e.slug === slug);
  const title = entry?.title || slug;
  const state = loadState();
  if (!state[slug]) {
    context = null;
    afterUiReady(() => {
      pushContext();
      notifyAccount({
        connected: Boolean(loadSettings().launcherToken),
        message: `${title} is not installed in the launcher.`,
      });
    });
    return { status: "not-installed" };
  }
  const confirmed = await confirmDestructiveDeepLink(
    `Uninstall ${title}?`,
    "A link outside PlayBound asked to remove this game. Its install folder and any PlayBound mods for it will be deleted, which may include saved games."
  );
  if (!confirmed) return { status: "cancelled" };
  const result = await uninstallGame(slug, editionSlug || null);
  context = null;
  afterUiReady(() => {
    pushContext();
    notifyAccount({
      connected: Boolean(loadSettings().launcherToken),
      message: `Uninstalled ${title}.`,
    });
    if (win && !win.isDestroyed()) {
      win.webContents.send("install-detected", { slug, uninstalled: true });
    }
  });
  return result;
}

async function uninstallModFromDeepLink(slug) {
  const state = loadState();
  const mods = state.__mods__ && typeof state.__mods__ === "object" ? state.__mods__ : {};
  const info = mods[slug];
  const title = info?.title || slug;
  if (!info) {
    context = null;
    afterUiReady(() => {
      pushContext();
      notifyAccount({
        connected: Boolean(loadSettings().launcherToken),
        message: `${title} is not tracked as an installed mod.`,
      });
    });
    return { status: "not-installed" };
  }
  const confirmed = await confirmDestructiveDeepLink(
    `Uninstall ${title}?`,
    "A link outside PlayBound asked to remove this mod from this PC, including its PlayBound install folder."
  );
  if (!confirmed) return { status: "cancelled" };
  const result = await uninstallMod(slug);
  context = null;
  afterUiReady(() => {
    pushContext();
    notifyAccount({
      connected: Boolean(loadSettings().launcherToken),
      message: `Removed ${title}.`,
    });
    if (win && !win.isDestroyed()) {
      win.webContents.send("install-detected", { slug, uninstalled: true });
    }
  });
  return result;
}

/** Best-effort taskkill for recorded / hinted game image names (Windows). */
function killGameImageNames(imageNames) {
  if (process.platform !== "win32") return;
  for (const image of [...new Set((imageNames || []).filter(Boolean))]) {
    try {
      execFileSync("taskkill", ["/F", "/IM", image], {
        windowsHide: true,
        timeout: 5000,
        stdio: "ignore",
      });
    } catch {
      /* not running */
    }
  }
}

/**
 * Kill any Windows process whose executable lives under one of the install dirs.
 * Covers Godot/OpenCiv3 cases where Task Manager shows a different display name
 * but the binary is still under playbound/games/<slug>.
 */
function killProcessesUnderDirs(dirs) {
  if (process.platform !== "win32") return;
  const roots = [...new Set((dirs || []).filter(Boolean).map((d) => path.resolve(d)))]
    .filter((d) => fs.existsSync(d))
    .map((d) => d.replace(/\//g, "\\").replace(/\\+$/, ""));
  if (!roots.length) return;

  const rootsLiteral = roots.map((r) => r.replace(/'/g, "''")).join("','");
  const ps = `
$ErrorActionPreference = 'SilentlyContinue'
$roots = @('${rootsLiteral}')
Get-CimInstance Win32_Process | ForEach-Object {
  $exe = [string]$_.ExecutablePath
  if (-not $exe) { return }
  $norm = $exe.Replace('/', '\\')
  foreach ($root in $roots) {
    if ($norm.StartsWith($root + '\\', [StringComparison]::OrdinalIgnoreCase) -or
        $norm.Equals($root, [StringComparison]::OrdinalIgnoreCase)) {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
      break
    }
  }
}
`;
  try {
    execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], {
      windowsHide: true,
      timeout: 15000,
      stdio: "ignore",
    });
  } catch {
    /* best-effort */
  }
}

function collectUninstallImageNames(slug, infos) {
  const entry = catalog.find((e) => e.slug === slug);
  const names = [...hintProcessNames(entry?.exeHint)];
  for (const info of infos) {
    if (info?.exe) names.push(normalizeProcessImageName(info.exe));
  }
  return [...new Set(names.filter(Boolean))];
}

function prepareDirRemoval(slug, infos) {
  const list = (infos || []).filter(Boolean);
  killGameImageNames(collectUninstallImageNames(slug, list));
  killProcessesUnderDirs(list.map((i) => i.dir).filter(Boolean));
}

function isProtectedSaveDirectory(dir) {
  if (!dir) return false;
  const norm = path.normalize(dir).toLowerCase();
  const localAppData = (process.env.LOCALAPPDATA || "").toLowerCase();
  if (localAppData && norm === path.join(localAppData, "holocure").toLowerCase()) {
    return true;
  }
  return false;
}

async function removeDirWithRetries(dir) {
  if (!dir || !fs.existsSync(dir)) return;
  if (isProtectedSaveDirectory(dir)) {
    console.warn(`[uninstall] Refusing to delete protected user save directory: ${dir}`);
    return;
  }
  const waits = [0, 350, 500, 500, 700];
  let lastErr = null;
  for (let i = 0; i < waits.length; i++) {
    const wait = waits[i];
    if (wait) await new Promise((r) => setTimeout(r, wait));
    // Re-kill path-based processes mid-retry (Godot can respawn briefly).
    if (i > 0) killProcessesUnderDirs([dir]);
    try {
      await fsp.rm(dir, { recursive: true, force: true });
      return;
    } catch (err) {
      lastErr = err;
      const code = err?.code;
      if (!["EBUSY", "EPERM", "ENOTEMPTY", "EACCES"].includes(code)) throw err;
    }
  }
  throw new Error(
    `Could not remove "${dir}" (folder still in use). Close the game and any Explorer windows on that folder, then try again.${
      lastErr?.message ? ` (${lastErr.message})` : ""
    }`
  );
}

function notifyUninstalled(slug) {
  if (win && !win.isDestroyed()) {
    win.webContents.send("install-detected", { slug, uninstalled: true });
  }
}

function sameFsPath(a, b) {
  if (!a || !b) return false;
  const left = path.resolve(String(a));
  const right = path.resolve(String(b));
  return process.platform === "win32"
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

function isPlayBoundManagedModDir(slug, dir) {
  if (!slug || !dir) return false;
  return sameFsPath(dir, path.join(gamesRoot(), slug));
}

function isBaseGameInstallDir(baseGameSlug, dir) {
  if (!baseGameSlug || !dir) return false;
  const state = loadState();
  const game = ensureGameInstallRecord(state[baseGameSlug]);
  if (!game) return false;
  const dirs = [
    game.dir,
    ...Object.values(game.editions || {}).map((e) => e && e.dir),
  ].filter(Boolean);
  return dirs.some((d) => sameFsPath(d, dir));
}

function listModSlugsForBaseGame(baseGameSlug) {
  if (!baseGameSlug) return [];
  const state = loadState();
  const mods = state.__mods__ && typeof state.__mods__ === "object" ? state.__mods__ : {};
  const out = [];
  for (const [modSlug, info] of Object.entries(mods)) {
    if (info && typeof info === "object" && info.baseGameSlug === baseGameSlug) {
      out.push(modSlug);
    }
  }
  return out;
}

async function uninstallModsForGame(baseGameSlug) {
  for (const modSlug of listModSlugsForBaseGame(baseGameSlug)) {
    try {
      await uninstallMod(modSlug);
    } catch (err) {
      console.warn(`[uninstall] failed to remove mod ${modSlug}:`, err?.message || err);
    }
  }
}

function isPlayBoundManagedInstallDir(slug, dir) {
  if (!slug || !dir) return false;
  const root = path.resolve(gamesRoot());
  const slugRoot = path.resolve(path.join(root, slug));
  const resolved = path.resolve(dir);
  if (sameFsPath(resolved, root)) return false;
  if (sameFsPath(resolved, slugRoot)) return true;
  if (process.platform === "win32") {
    const rel = path.relative(slugRoot.toLowerCase(), resolved.toLowerCase());
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  }
  return pathUnderRoot(resolved, slugRoot);
}

function isUnsafeUninstallDir(dir) {
  if (!dir) return true;
  const resolved = path.resolve(dir);
  const { root } = path.parse(resolved);
  if (root && sameFsPath(resolved, root)) return true;
  try {
    if (sameFsPath(resolved, app.getPath("home"))) return true;
    if (sameFsPath(resolved, app.getPath("userData"))) return true;
  } catch {
    /* ignore */
  }
  for (const envKey of ["ProgramFiles", "ProgramFiles(x86)", "SystemRoot", "windir"]) {
    const val = process.env[envKey];
    if (val && sameFsPath(resolved, val)) return true;
  }
  return sameFsPath(resolved, path.resolve(gamesRoot()));
}

/**
 * Delete a folder only when it lives under PlayBound's games/<slug> tree.
 * Steam / MSI / located installs are never deleted — we only drop tracking.
 */
async function tryRemovePlayBoundInstallDir(slug, dir) {
  if (!dir || !fs.existsSync(dir)) return null;
  if (!isPlayBoundManagedInstallDir(slug, dir) || isUnsafeUninstallDir(dir) || isProtectedSaveDirectory(dir)) {
    console.warn(`[uninstall] skipping folder PlayBound does not own: ${dir}`);
    return null;
  }
  try {
    prepareDirRemoval(slug, [{ dir }]);
    await removeDirWithRetries(dir);
    return null;
  } catch (err) {
    const message = err?.message || String(err);
    console.warn(`[uninstall] could not delete ${dir}:`, message);
    return message;
  }
}

async function finishGameUninstall(slug, state, extra = {}) {
  saveState(state);
  clearPendingInstaller(slug);
  if (!state[slug]) {
    await syncLibrary(slug, "uninstall");
  } else {
    const game = ensureGameInstallRecord(state[slug]);
    await syncLibrary(slug, "install", game.version || undefined);
  }
  void telemetry.editionUninstalled(editionInfoFor(slug, extra));
  notifyUninstalled(slug);
}

async function uninstallGame(slug, editionSlug = null) {
  stopExeScan(slug);
  stopInstallerPoll();
  clearLaunchTracking(slug);
  if (!loadState()[slug]) return { status: "not-installed" };
  await uninstallModsForGame(slug);
  const state = loadState();
  const game = ensureGameInstallRecord(state[slug]);
  if (!state[slug]) return { status: "not-installed" };

  // A modded edition patches an executable PlayBound does not own — the game
  // belongs to Steam. Restore it before dropping our records, so uninstalling
  // the edition never leaves a modified binary behind.
  try {
    const modEntry = catalog.find((e) => e.slug === slug);
    if (modEntry?.modLoader) {
      const info = editionSlug ? game.editions?.[editionSlug] : game;
      if (info?.exe) await removeEditionModPatch(modEntry, info.dir, info.exe);
    }
  } catch (err) {
    console.warn("edition unpatch skipped:", err?.message || err);
  }

  // For custom non-catalog games, remove the record from launcher library without deleting external game files.
  if (state[slug]?.custom || game?.custom || slug.startsWith("custom-")) {
    delete state[slug];
    await finishGameUninstall(slug, state);
    return { status: "uninstalled", dir: null };
  }

  const warnings = [];

  if (editionSlug) {
    if (!game.editions?.[editionSlug]) {
      return { status: "not-installed", editionSlug };
    }
    const info = game.editions[editionSlug];
    if (info.pending && !(info.exe && fs.existsSync(info.exe))) {
      delete game.editions[editionSlug];
    } else {
      if (info.dir) {
        const warning = await tryRemovePlayBoundInstallDir(slug, info.dir);
        if (warning) warnings.push(warning);
      }
      delete game.editions[editionSlug];
    }
    if (Object.keys(game.editions).length === 0) {
      delete state[slug];
    } else {
      syncGameInstallSummary(game);
      state[slug] = game;
    }
    await finishGameUninstall(slug, state, { editionSlug });
    return {
      status: "uninstalled",
      dir: info?.dir || null,
      editionSlug,
      warning: warnings[0] || null,
    };
  }

  const editions = listEditionEntries(game);
  const dirs = [
    ...editions.map((info) => info.dir),
    game.dir,
  ].filter(Boolean);
  const seen = new Set();
  for (const dir of dirs) {
    const key = process.platform === "win32" ? path.resolve(dir).toLowerCase() : path.resolve(dir);
    if (seen.has(key)) continue;
    seen.add(key);
    const warning = await tryRemovePlayBoundInstallDir(slug, dir);
    if (warning) warnings.push(warning);
  }
  delete state[slug];
  await finishGameUninstall(slug, state);
  return { status: "uninstalled", dir: game.dir || null, warning: warnings[0] || null };
}

function listInstalledGames() {
  const state = loadState();
  const games = [];
  for (const [slug, raw] of Object.entries(state)) {
    if (slug === "__mods__") continue;
    if (!raw || typeof raw !== "object") continue;
    const game = ensureGameInstallRecord(raw);
    syncGameInstallSummary(game);
    const editions = installedEditionsPayload(slug);
    const ready = Boolean(playableExePath(game));
    const pending = Boolean(game.pending) && !ready;
    if (!ready && !pending && editions.length === 0) continue;
    const entry = catalog.find((e) => e.slug === slug);
    const isCustom = Boolean(raw.custom || slug.startsWith("custom-"));
    const displayTitle =
      raw.title ||
      entry?.title ||
      slug.replace(/^custom-/, "").replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    games.push({
      slug,
      title: displayTitle,
      blurb: raw.blurb || entry?.blurb || (isCustom ? "Custom Game" : ""),
      art: Array.isArray(entry?.art) && entry.art.length >= 2 ? entry.art : ["#1e1b4b", "#6366f1"],
      coverImage: resolveMediaUrl(raw.coverImage || entry?.coverImage) || null,
      approxSize: entry?.approxSize || "",
      genres: entry?.genres || (isCustom ? ["Custom"] : []),
      tags: entry?.tags || [],
      multiplayer: Boolean(entry?.multiplayer),
      platforms: Array.isArray(entry?.platforms) ? entry.platforms : ["Windows"],
      browserPlayable: Boolean(entry?.browserPlayable),
      steamDeck: Boolean(entry?.steamDeck),
      version: game.version || null,
      dir: game.dir || null,
      exe: ready ? game.exe : null,
      pending,
      scanning: Boolean(pending && game.scanning),
      editionSlug: game.editionSlug || null,
      editionName: game.editionName || null,
      installedEditions: editions,
      custom: isCustom,
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

/** Prefer exe folder for Godot override.cfg; fall back to install dir. */
function resolveOpenCiv3InstallDir() {
  const state = loadState();
  const game = ensureGameInstallRecord(state[OPENCIV3_SLUG]);
  if (!game) return null;
  const edSlug = game.editionSlug || DEFAULT_EDITION_SLUG;
  const info = game.editions?.[edSlug] || null;
  const exe = (info?.exe && fs.existsSync(info.exe) && info.exe) || (game.exe && fs.existsSync(game.exe) && game.exe) || null;
  if (exe) return resolveGameDir(exe);
  const dir = info?.dir || game.dir;
  if (dir && fs.existsSync(dir)) return resolveGameDir(dir);
  return null;
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

  const portableDir =
    info.dir &&
    (info.portable || isPlayBoundManagedModDir(slug, info.dir)) &&
    !isBaseGameInstallDir(baseGameSlug, info.dir)
      ? info.dir
      : null;
  let warning = null;
  if (portableDir) {
    warning = await tryRemovePlayBoundInstallDir(slug, portableDir);
  }

  delete state.__mods__[slug];
  saveState(state);
  if (baseGameSlug) {
    await syncLibrary(slug, "uninstall", undefined, { kind: "mod", baseGameSlug });
  }
  notifyUninstalled(slug);
  return { status: "uninstalled", dir: info.dir || null, baseGameSlug, restored, warning };
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
  // .lnk to a .jar is unreliable; prefer play.cmd when present (github-jar installs).
  let targetPath = info.exe;
  if (/\.jar$/i.test(targetPath)) {
    const cmdBeside = path.join(path.dirname(targetPath), "play.cmd");
    if (fs.existsSync(cmdBeside)) targetPath = cmdBeside;
  }
  await Platform.createShortcut({
    title,
    targetPath,
    args: "",
    description: `Play ${title}`,
    icon: info.exe,
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
ipcMain.handle("scan-library-candidates", () => listLibraryScanCandidates());
ipcMain.handle("add-scanned-games", (_event, slugs) => addScannedLibraryGames(slugs));
ipcMain.handle("add-custom-game", (_event, customTitle) =>
  addCustomGameExecutable(customTitle || null)
);
ipcMain.handle("dismiss-pending-install", (_event, slug) => dismissPendingInstall(slug));
ipcMain.handle("play", (_event, slug, join, editionSlug) =>
  playGame(slug, join || null, editionSlug || null)
);
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
          }
        : null;
    if (!body?.event || body.sessionId.length < 8 || body.anonymousId.length < 8) {
      return { ok: false };
    }
    const res = await fetch(`${getApiBase()}/api/telemetry`, {
      method: "POST",
      headers: launcherApiHeaders({
        "Content-Type": "application/json",
        accept: "application/json",
        "user-agent": `playbound-launcher/${app.getVersion()} (${process.platform})`,
      }),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
});
ipcMain.handle("uninstall", (_event, slug, editionSlug) =>
  uninstallGame(slug, editionSlug || null)
);
ipcMain.handle("get-installed", () => listInstalledGames());
ipcMain.handle("get-installed-mods", () => listInstalledMods());

/* ── saves ─────────────────────────────────────────────────── */

/** Snapshots for a game, newest first, plus whether saves are supported here. */
ipcMain.handle("saves-list", async (_event, slug, editionSlug) => {
  if (!saveLocations.supportsCloudSaves(slug)) {
    // Distinguish "this game keeps nothing locally" from "we haven't got to it
    // yet" — the first is a permanent answer the player deserves to be told.
    return {
      supported: false,
      noLocalSaves: saveLocations.noLocalSavesReason(slug),
      snapshots: [],
    };
  }
  const saveDir = saveLocations.saveDirFor(slug);
  const snapshots = await saveData.list(slug, editionSlug || DEFAULT_EDITION_SLUG);
  return {
    supported: true,
    saveDir,
    saveDirExists: Boolean(saveDir && fs.existsSync(saveDir)),
    snapshots: snapshots.map((s) => ({
      id: s.id,
      createdAt: s.createdAt || null,
      files: s.files ?? null,
      bytes: s.bytes ?? null,
      reason: s.reason || null,
    })),
  };
});

/** Back up the current saves on demand, rather than waiting for the game to exit. */
ipcMain.handle("saves-snapshot", async (_event, slug, editionSlug) => {
  if (!saveLocations.supportsCloudSaves(slug)) throw new Error("Saves are not supported for this game yet.");
  const saveDir = saveLocations.saveDirFor(slug);
  if (!saveDir || !fs.existsSync(saveDir)) throw new Error("No save folder found for this game yet.");
  const policy = saveLocations.policyFor(slug);
  const result = await saveData.snapshot(slug, editionSlug || DEFAULT_EDITION_SLUG, saveDir, {
    reason: "manual",
    maxSnapshotMb: policy.maxSnapshotMb,
  });
  if (result.status === "captured") await saveData.prune(slug, editionSlug || DEFAULT_EDITION_SLUG, policy.keep);
  return result;
});

/**
 * Put a snapshot back.
 *
 * The engine takes its own safety snapshot first, so this is reversible — the
 * renderer surfaces that id so "undo" is a real option rather than advice.
 */
ipcMain.handle("saves-restore", async (_event, slug, editionSlug, snapshotId) => {
  if (!snapshotId) throw new Error("No snapshot chosen.");
  const saveDir = saveLocations.saveDirFor(slug);
  if (!saveDir) throw new Error("No save folder is known for this game.");
  return saveData.restore(slug, editionSlug || DEFAULT_EDITION_SLUG, saveDir, snapshotId);
});

/**
 * What syncing would do right now, without doing it.
 *
 * The renderer asks before acting so a conflict can be surfaced as a choice
 * rather than resolved silently — see decideSync, which refuses to guess when
 * both sides changed.
 */
ipcMain.handle("saves-sync-status", async (_event, slug, editionSlug) => {
  const ed = editionSlug || DEFAULT_EDITION_SLUG;
  if (!saveLocations.supportsCloudSaves(slug)) return { supported: false };
  if (!loadSettings().launcherToken) return { supported: true, signedIn: false };

  const saveDir = saveLocations.saveDirFor(slug);
  const [local] = await saveData.list(slug, ed);
  let remote = [];
  try {
    remote = await cloudSaves.listRemote(slug, ed);
  } catch (err) {
    return { supported: true, signedIn: true, error: err?.message || String(err) };
  }

  const localUpdatedAt =
    (saveDir && (await cloudSaves.newestMtime(fsp, path, saveDir))) || local?.createdAt || null;
  const settings = loadSettings();
  const syncKey = `${slug}::${ed}`;
  const lastSyncedAt = settings.saveSyncedAt?.[syncKey] || null;

  const decision = cloudSaves.decideSync({
    localUpdatedAt,
    remoteUpdatedAt: remote[0]?.uploadedAt || null,
    lastSyncedAt,
    deviceId: settings.analyticsId || "this-device",
  });

  return {
    supported: true,
    signedIn: true,
    decision,
    remote: remote[0] || null,
    localUpdatedAt,
    lastSyncedAt,
  };
});

/** Record a successful sync so the next decision has a baseline. */
function markSynced(slug, editionSlug) {
  const settings = loadSettings();
  settings.saveSyncedAt = settings.saveSyncedAt || {};
  settings.saveSyncedAt[`${slug}::${editionSlug}`] = new Date().toISOString();
  saveSettings(settings);
}

ipcMain.handle("saves-upload", async (_event, slug, editionSlug) => {
  const ed = editionSlug || DEFAULT_EDITION_SLUG;
  const saveDir = saveLocations.saveDirFor(slug);
  if (!saveDir) throw new Error("No save folder is known for this game.");
  const result = await cloudSaves.upload(slug, ed, saveDir, {
    maxSnapshotMb: saveLocations.cloudPolicyFor().maxSnapshotMb,
  });
  if (result.status === "uploaded") markSynced(slug, ed);
  return result;
});

ipcMain.handle("saves-download", async (_event, slug, editionSlug, snapshotId) => {
  const ed = editionSlug || DEFAULT_EDITION_SLUG;
  const saveDir = saveLocations.saveDirFor(slug);
  if (!saveDir) throw new Error("No save folder is known for this game.");
  const result = await cloudSaves.download(slug, ed, saveDir, snapshotId || null);
  if (result.status === "restored") markSynced(slug, ed);
  return result;
});

/** Open the folder holding this game's snapshots, so recovery never needs us. */
ipcMain.handle("saves-open-folder", async (_event, slug, editionSlug) => {
  const dir = saveData.gameRoot(slug, editionSlug || DEFAULT_EDITION_SLUG);
  await fsp.mkdir(dir, { recursive: true });
  return shell.openPath(dir);
});
ipcMain.handle("uninstall-mod", (_event, slug) => uninstallMod(slug));
ipcMain.handle("create-shortcut", (_event, slug) => createGameShortcut(slug));
ipcMain.handle("get-openciv3-display", async () => {
  const target = resolveOpenCiv3InstallDir();
  if (!target) throw new Error("OpenCiv3 is not installed");
  return readDisplaySettings(target);
});
ipcMain.handle("set-openciv3-display", async (_event, payload = {}) => {
  const target = resolveOpenCiv3InstallDir();
  if (!target) throw new Error("OpenCiv3 is not installed");
  return writeDisplaySettings(target, {
    width: payload?.width,
    height: payload?.height,
  });
});
ipcMain.handle("open-folder", async (_event, dir) => {
  const target = String(dir || "");
  if (!target || !fs.existsSync(target)) throw new Error("Folder not found");
  /*
   * shell.openPath hands a *file* to its default handler, which for .exe, .bat
   * or .lnk means running it. This handler takes a raw path from the renderer,
   * so without this check any script execution in the renderer would escalate
   * to running an arbitrary program on the host. Every caller passes an install
   * directory, so requiring a directory costs nothing.
   *
   * Deliberately not constrained to allowedExecutableRoots(): players can point
   * an install anywhere via Locate, and refusing to open a folder they chose
   * would break a working feature to no benefit — the execution primitive is
   * what mattered here, and it is gone.
   */
  let stat;
  try {
    stat = fs.statSync(target);
  } catch {
    throw new Error("Folder not found");
  }
  if (!stat.isDirectory()) throw new Error("Not a folder");
  await shell.openPath(target);
  return true;
});
ipcMain.handle("clear-context", () => clearContext());
/**
 * Open a Discord invite in the desktop app when it is installed, falling back
 * to the browser otherwise.
 *
 * Handing the raw https invite to the browser — which is what this used to do —
 * always landed people in web Discord even with the app open, so party voice
 * never actually joined the channel they were already signed into.
 *
 * The discord:// URL is rebuilt here from a validated invite code rather than
 * forwarded, so the security allowlist stays https-only and no caller can push
 * an arbitrary protocol URL through this path.
 */
ipcMain.handle("open-discord-invite", async (_event, inviteUrl) => {
  const httpsUrl = String(inviteUrl || "");
  const code = parseDiscordInviteCode(httpsUrl);

  if (isDiscordInstalled()) {
    // With an invite, join that channel; without one (the plain "open Discord"
    // buttons), just bring the app up rather than a browser tab.
    const deepLink = code ? `discord://-/invite/${code}` : isDiscordUrl(httpsUrl) ? "discord://" : null;
    if (deepLink) {
      try {
        await shell.openExternal(deepLink);
        return { ok: true, openedApp: true };
      } catch (err) {
        console.warn("discord app handoff failed, falling back to web:", err?.message || err);
      }
    }
  }

  try {
    await safeOpenExternal(httpsUrl, { campaign: "launcher_party_voice" });
    return { ok: true, openedApp: false };
  } catch (err) {
    console.warn("open-discord-invite blocked:", err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
});

ipcMain.handle("open-external", async (_event, url, opts) => {
  try {
    const options =
      opts && typeof opts === "object"
        ? {
            campaign: opts.campaign ? String(opts.campaign) : undefined,
            content: opts.content ? String(opts.content) : undefined,
            skipUtm: Boolean(opts.skipUtm),
          }
        : undefined;
    return await safeOpenExternal(url, options);
  } catch (err) {
    console.warn("open-external blocked:", err?.message || err);
    return false;
  }
});
ipcMain.handle("open-deep-link", (_event, url) => {
  const raw = String(url || "");
  if (!/^playbound:\/\//i.test(raw)) {
    console.warn("open-deep-link rejected non-playbound URL");
    return false;
  }
  const parsed = parseDeepLink(raw);
  if (!parsed) return false;
  handleDeepLink(parsed);
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
    setLinkedCanUseAdminChannel(false);
    return { connected: false, apiBase: getApiBase(), canUseAdminChannel: false };
  }
  const check = await validateLauncherToken(settings.launcherToken);
  if (!check.valid) {
    clearLocalToken("Saved session is no longer valid — sign in again from Settings.");
    return { connected: false, apiBase: getApiBase(), canUseAdminChannel: false };
  }
  setLinkedCanUseAdminChannel(Boolean(check.canUseAdminChannel));
  startLauncherPresenceLoop();
  return {
    connected: true,
    apiBase: getApiBase(),
    userId: check.userId || null,
    email: check.email || null,
    username: check.username || null,
    canUseAdminChannel: linkedCanUseAdminChannel,
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
  stopLauncherPresenceLoop();
  setLinkedCanUseAdminChannel(false);
  notifyAccount({ connected: false, canUseAdminChannel: false });
  return { connected: false, canUseAdminChannel: false };
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
ipcMain.handle("get-catalog", async (_event, opts = {}) => {
  const forceRefresh = Boolean(opts && opts.refresh);
  if (forceRefresh) {
    await refreshRemoteCatalog(true);
  } else if (Date.now() - lastCatalogRefreshTime > CATALOG_TTL_MS) {
    void refreshRemoteCatalog(false);
  }
  return mapCatalogList();
});
ipcMain.handle("get-bootstrap-state", () => ({
  catalog: mapCatalogList(),
  recent: listRecentlyPlayed(),
  account: buildBootstrapAccount(),
  settings: buildSettingsPayload(),
  context: buildContextPayload(),
  version: app.getVersion(),
}));
ipcMain.handle("get-servers", async (_event, slug) => {
  try {
    const res = await fetch(`${getApiBase()}/api/games/${encodeURIComponent(slug)}/servers`, {
      headers: launcherApiHeaders({ accept: "application/json" }),
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
ipcMain.handle("get-gear-catalog", async () => {
  try {
    const res = await fetch(`${getApiBase()}/api/launcher/gear`, {
      headers: launcherApiHeaders(),
    });
    if (!res.ok) return { items: [], categories: [], grouped: {} };
    return await res.json();
  } catch {
    return { items: [], categories: [], grouped: {} };
  }
});
ipcMain.handle("get-gear-detail", async (_event, slug) => {
  try {
    const res = await fetch(`${getApiBase()}/api/launcher/gear/${encodeURIComponent(slug)}`, {
      headers: launcherApiHeaders(),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
});
ipcMain.handle("get-events", async () => {
  try {
    const res = await fetch(`${getApiBase()}/api/events`, {
      headers: launcherApiHeaders({ accept: "application/json" }),
    });
    if (!res.ok) return { events: [] };
    return await res.json();
  } catch {
    return { events: [] };
  }
});
ipcMain.handle("get-friends-upcoming-events", async () => {
  try {
    const res = await fetch(`${getApiBase()}/api/events/friends-upcoming`, {
      headers: launcherApiHeaders({ accept: "application/json" }),
    });
    if (!res.ok) return { events: [] };
    return await res.json();
  } catch {
    return { events: [] };
  }
});
ipcMain.handle("get-event-detail", async (_event, eventId) => {
  try {
    const res = await fetch(`${getApiBase()}/api/events/${encodeURIComponent(eventId)}`, {
      headers: launcherApiHeaders({ accept: "application/json" }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
});
ipcMain.handle("create-event", async (_event, payload) => {
  try {
    const res = await fetch(`${getApiBase()}/api/events`, {
      method: "POST",
      headers: launcherApiHeaders({
        "content-type": "application/json",
      }),
      body: JSON.stringify(payload || {}),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, error: data?.error || `Failed to create event (HTTP ${res.status})` };
    }
    return { ok: true, event: data?.event };
  } catch (err) {
    return { ok: false, error: err?.message || "Network error while creating event" };
  }
});
ipcMain.handle("upload-event-cover", async (_event, fileBuffer, fileName, mimeType) => {
  try {
    const boundary = "----WebKitFormBoundary" + Math.random().toString(36).substring(2);
    const buf = Buffer.from(fileBuffer);
    const head = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName || "cover.png"}"\r\nContent-Type: ${mimeType || "image/png"}\r\n\r\n`
    );
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([head, buf, tail]);

    const res = await fetch(`${getApiBase()}/api/events/upload`, {
      method: "POST",
      headers: launcherApiHeaders({
        "content-type": `multipart/form-data; boundary=${boundary}`,
      }),
      body,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, error: data?.error || `Upload failed (${res.status})` };
    }
    return { ok: true, url: data.url };
  } catch (err) {
    return { ok: false, error: err?.message || "Upload failed" };
  }
});
ipcMain.handle("rsvp-event", async (_event, eventId, status) => {
  try {
    const res = await fetch(`${getApiBase()}/api/events/${encodeURIComponent(eventId)}/rsvp`, {
      method: "POST",
      headers: launcherApiHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ status }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, error: data?.error || `Failed to RSVP (HTTP ${res.status})` };
    }
    return { ok: true, ...data };
  } catch (err) {
    return { ok: false, error: err?.message || "Network error while setting RSVP" };
  }
});
ipcMain.handle("cancel-event", async (_event, eventId) => {
  try {
    const res = await fetch(`${getApiBase()}/api/events/${encodeURIComponent(eventId)}`, {
      method: "PATCH",
      headers: launcherApiHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ cancel: true }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, error: data?.error || `Failed to cancel event (HTTP ${res.status})` };
    }
    return { ok: true, ...data };
  } catch (err) {
    return { ok: false, error: err?.message || "Network error while cancelling event" };
  }
});
ipcMain.handle("delete-event", async (_event, eventId) => {
  try {
    const res = await fetch(`${getApiBase()}/api/events/${encodeURIComponent(eventId)}`, {
      method: "DELETE",
      headers: launcherApiHeaders({ accept: "application/json" }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, error: data?.error || `Failed to delete event (HTTP ${res.status})` };
    }
    return { ok: true, ...data };
  } catch (err) {
    return { ok: false, error: err?.message || "Network error while deleting event" };
  }
});
ipcMain.handle("tournament-action", async (_event, eventId, action, payload) => {
  try {
    const res = await fetch(`${getApiBase()}/api/events/${encodeURIComponent(eventId)}/tournament`, {
      method: "POST",
      headers: launcherApiHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ action, ...(payload || {}) }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, error: data?.error || `Tournament action failed (HTTP ${res.status})` };
    }
    return { ok: true, ...data };
  } catch (err) {
    return { ok: false, error: err?.message || "Network error while performing tournament action" };
  }
});
ipcMain.handle("get-free-offers", async () => {
  try {
    const res = await fetch(`${getApiBase()}/api/free-offers`, {
      headers: launcherApiHeaders({ accept: "application/json" }),
    });
    if (!res.ok) return { offers: [], count: 0 };
    return await res.json();
  } catch {
    return { offers: [], count: 0 };
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
          headers: launcherApiHeaders({ accept: "application/json" }),
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
ipcMain.handle("get-settings", () => buildSettingsPayload());
ipcMain.handle("ensure-managed-java", async (_event, opts) => {
  try {
    const force = Boolean(opts?.force);
    if (!force && managedJava.findManagedJavaBinary()) {
      return { ok: true, ...managedJava.status(), alreadyPresent: true };
    }
    void telemetry.track("java_runtime_install_started", { version: "17", surface: "settings" });
    const outcome = await managedJava.ensureManagedJava({ force });
    if (outcome.ok) {
      void telemetry.track("java_runtime_install_succeeded", { version: "17", surface: "settings" });
      return { ok: true, ...managedJava.status() };
    }
    void telemetry.track("java_runtime_install_failed", {
      message: outcome.error,
      surface: "settings",
    });
    return { ok: false, error: outcome.error };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("get-java-status", async () => {
  try {
    const managed = managedJava.status();
    const resolved = GameLauncher.resolveJavaBinary();
    return {
      managed,
      systemAvailable: Boolean(resolved) && !(managed.javaBin && resolved === managed.javaBin),
      resolvedJavaBin: resolved || null,
      usable: Boolean(resolved || managed.installed),
    };
  } catch (err) {
    return { error: err.message, managed: { installed: false }, systemAvailable: false, usable: false };
  }
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
    await refreshAdminUpdateChannel();
    applyUpdaterChannel();
    const autoUpdater = getAutoUpdater();
    if (!autoUpdater) {
      return { ok: false, reason: "error", message: "electron-updater unavailable" };
    }
    const channel = getEffectiveUpdateChannel();
    const result = await autoUpdater.checkForUpdates();
    const info = result?.updateInfo || null;
    const current = app.getVersion();
    const offered = info?.version || null;
    const delta = offered ? compareVersions(offered, current) : 0;

    /*
     * A newer build, by version order rather than mere inequality.
     *
     * This used to be `info.version !== app.getVersion()`, which treats an
     * older channel version as an update and offers a downgrade.
     */
    if (offered && delta > 0) {
      pendingUpdate = info;
      return { ok: true, updateAvailable: true, version: offered, channel };
    }

    /*
     * Running ahead of the channel is not "up to date" — it means this build
     * came from somewhere the channel does not know about, and no update will
     * ever arrive here. That strands testers: an unsigned admin build is
     * newer than the signed latest channel, so anyone whose admin access stops
     * resolving silently falls back to a channel that is behind them and is
     * told everything is fine, forever.
     */
    if (offered && delta < 0) {
      return {
        ok: true,
        updateAvailable: false,
        behindChannel: true,
        version: current,
        channelVersion: offered,
        channel,
        message:
          channel === "latest"
            ? `You're on ${current}, which is newer than the public ${offered} release. ` +
              `Link an admin or tester account to receive test builds, or reinstall from the site to return to the public channel.`
            : `You're on ${current}, which is newer than ${offered} on the ${channel} channel.`,
      };
    }

    return { ok: true, updateAvailable: false, version: current, channel };
  } catch (err) {
    return { ok: false, reason: "error", message: err?.message || String(err) };
  }
});
ipcMain.handle("install-update", () => {
  if (!app.isPackaged) return { ok: false, message: "Not packaged" };
  try {
    const autoUpdater = getAutoUpdater();
    if (!autoUpdater) return { ok: false, message: "electron-updater unavailable" };
    autoUpdater.quitAndInstall(false, true);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err?.message || String(err) };
  }
});
ipcMain.handle("save-settings", (_event, patch) => {
  const settings = loadSettings();
  if (patch.apiBase != null) {
    if (isAllowedApiBase(patch.apiBase)) {
      settings.apiBase = String(patch.apiBase).replace(/\/$/, "");
    } else {
      console.warn("save-settings rejected apiBase:", patch.apiBase);
    }
  }
  if (patch.gamesDir != null) settings.gamesDir = patch.gamesDir;
  if (patch.compatibilityFilter === "compatible" || patch.compatibilityFilter === "all") {
    settings.compatibilityFilter = patch.compatibilityFilter;
    void pushCompatibilityPreference(patch.compatibilityFilter);
  }
  if (linkedCanUseAdminChannel && (patch.updateChannel === "admin" || patch.updateChannel === "latest")) {
    settings.updateChannel = patch.updateChannel;
  }
  saveSettings(settings);
  applyUpdaterChannel();
  return {
    ok: true,
    updateChannel: getEffectiveUpdateChannel(),
    canUseAdminChannel: linkedCanUseAdminChannel,
  };
});

const CATALOG_LIVE_STATS_TTL_MS = 15 * 60 * 1000;

function loadLiveStatsDiskCache() {
  try {
    if (!fs.existsSync(LIVE_STATS_CACHE_FILE)) return { at: 0, data: null };
    const parsed = JSON.parse(fs.readFileSync(LIVE_STATS_CACHE_FILE, "utf-8"));
    if (parsed?.data && typeof parsed.data.gameCount === "number") {
      return { at: Number(parsed.at) || 0, data: parsed.data };
    }
  } catch (err) {
    console.warn("[live-stats] disk cache read failed:", err instanceof Error ? err.message : err);
  }
  return { at: 0, data: null };
}

function saveLiveStatsDiskCache(data) {
  try {
    fs.writeFileSync(LIVE_STATS_CACHE_FILE, JSON.stringify({ at: Date.now(), data }), "utf-8");
  } catch (err) {
    console.warn("[live-stats] disk cache write failed:", err instanceof Error ? err.message : err);
  }
}

/** Shared homepage snapshot — memory first, then last-good on disk. */
const liveStatsDisk = loadLiveStatsDiskCache();
let catalogLiveStatsCache = { at: liveStatsDisk.at, data: liveStatsDisk.data, inflight: null };

async function fetchCatalogLiveStats() {
  const res = await fetch(`${getApiBase()}/api/launcher/live-stats`, {
    headers: {
      "user-agent": "playbound-launcher",
      accept: "application/json",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
  return await res.json();
}

function rememberCatalogLiveStats(data) {
  if (!data || typeof data.gameCount !== "number") return catalogLiveStatsCache.data;
  catalogLiveStatsCache = { at: Date.now(), data, inflight: null };
  saveLiveStatsDiskCache(data);
  if (win && !win.isDestroyed()) {
    win.webContents.send("live-stats-updated", data);
  }
  return data;
}

/** Stale-while-revalidate: return last-good immediately, refresh in the background. */
function getOrRefreshCatalogLiveStats() {
  const now = Date.now();
  if (
    catalogLiveStatsCache.data &&
    now - catalogLiveStatsCache.at < CATALOG_LIVE_STATS_TTL_MS
  ) {
    return Promise.resolve(catalogLiveStatsCache.data);
  }
  if (!catalogLiveStatsCache.inflight) {
    catalogLiveStatsCache.inflight = (async () => {
      try {
        const data = await fetchCatalogLiveStats();
        return rememberCatalogLiveStats(data) || catalogLiveStatsCache.data;
      } catch (err) {
        console.warn("[live-stats] catalog snapshot failed:", err instanceof Error ? err.message : err);
        return catalogLiveStatsCache.data;
      } finally {
        catalogLiveStatsCache.inflight = null;
      }
    })();
  }
  if (catalogLiveStatsCache.data) return Promise.resolve(catalogLiveStatsCache.data);
  return catalogLiveStatsCache.inflight;
}

function prefetchCatalogLiveStats() {
  void getOrRefreshCatalogLiveStats();
}

ipcMain.handle("get-live-stats", async (_event, opts = {}) => {
  const params = new URLSearchParams();
  if (opts?.game) params.set("game", opts.game);
  if (opts?.mod) params.set("mod", opts.mod);
  if (opts?.edition) params.set("edition", opts.edition);
  const scoped = Boolean(opts?.game || opts?.mod || opts?.edition);
  const qs = params.toString();
  const url = `${getApiBase()}/api/launcher/live-stats${qs ? `?${qs}` : ""}`;

  async function attempt(headers) {
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(scoped ? 30_000 : 20_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
    }
    return await res.json();
  }

  if (!scoped) {
    return getOrRefreshCatalogLiveStats();
  }

  try {
    return await attempt(launcherApiHeaders());
  } catch (err) {
    const first = err instanceof Error ? err.message : String(err);
    console.warn("[live-stats] first attempt failed:", first);
    try {
      return await attempt(launcherApiHeaders());
    } catch (err2) {
      const second = err2 instanceof Error ? err2.message : String(err2);
      console.warn("[live-stats] retry failed:", second);
      return null;
    }
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

ipcMain.handle("get-mod-guides", async (_event, slug) => {
  try {
    const res = await fetch(
      `${getApiBase()}/api/launcher/mods/${encodeURIComponent(slug)}/guides`,
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

ipcMain.handle("get-game-reviews", async (_event, slug) => {
  try {
    const res = await fetch(
      `${getApiBase()}/api/launcher/games/${encodeURIComponent(slug)}/reviews`,
      { headers: launcherApiHeaders() }
    );
    if (!res.ok) return { reviews: [] };
    return await res.json();
  } catch {
    return { reviews: [] };
  }
});

ipcMain.handle("get-game-discussions", async (_event, slug) => {
  try {
    const res = await fetch(
      `${getApiBase()}/api/launcher/games/${encodeURIComponent(slug)}/discussions`,
      { headers: launcherApiHeaders() }
    );
    if (!res.ok) return { topics: [], boardUrl: null };
    return await res.json();
  } catch {
    return { topics: [], boardUrl: null };
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

async function launcherJson(path, { method = "GET", body } = {}) {
  const res = await fetch(`${getApiBase()}${path}`, {
    method,
    headers: launcherApiHeaders(body != null ? { "content-type": "application/json" } : {}),
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { error: data.error || `HTTP ${res.status}` };
  }
  return data;
}

ipcMain.handle("get-parties", async () => {
  try {
    return await launcherJson("/api/parties");
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("create-party", async (_event, opts = {}) => {
  try {
    return await launcherJson("/api/parties", { method: "POST", body: opts });
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("join-party", async (_event, partyId, password) => {
  try {
    return await launcherJson(`/api/parties/${encodeURIComponent(partyId)}/join`, {
      method: "POST",
      body: password ? { password } : {},
    });
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("leave-party", async (_event, partyId) => {
  try {
    return await launcherJson(`/api/parties/${encodeURIComponent(partyId)}/leave`, { method: "POST" });
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("invite-to-party", async (_event, partyId, friendIds = []) => {
  try {
    return await launcherJson(`/api/parties/${encodeURIComponent(partyId)}/invite`, {
      method: "POST",
      body: { friendIds },
    });
  } catch (err) {
    return { error: err.message };
  }
});

/*
 * The rest of the party surface, one handler per call the website's partyStore
 * makes. Without these the launcher could only create/join/leave, which is why
 * its party panel could not show the same controls as the site.
 */
ipcMain.handle("update-party", async (_event, partyId, patch = {}) => {
  try {
    return await launcherJson(`/api/parties/${encodeURIComponent(partyId)}`, {
      method: "PATCH",
      body: patch,
    });
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("end-party", async (_event, partyId) => {
  try {
    return await launcherJson(`/api/parties/${encodeURIComponent(partyId)}`, { method: "DELETE" });
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("set-party-ready", async (_event, partyId, ready) => {
  try {
    return await launcherJson(`/api/parties/${encodeURIComponent(partyId)}/ready`, {
      method: "POST",
      body: { ready: Boolean(ready) },
    });
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("party-join-game", async (_event, partyId) => {
  try {
    return await launcherJson(`/api/parties/${encodeURIComponent(partyId)}/join-game`, {
      method: "POST",
    });
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("remove-party-member", async (_event, partyId, userId) => {
  try {
    return await launcherJson(
      `/api/parties/${encodeURIComponent(partyId)}/members/${encodeURIComponent(userId)}`,
      { method: "DELETE" }
    );
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("transfer-party-leadership", async (_event, partyId, userId) => {
  try {
    return await launcherJson(
      `/api/parties/${encodeURIComponent(partyId)}/members/${encodeURIComponent(userId)}`,
      { method: "POST", body: { role: "leader" } }
    );
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("provision-party-discord", async (_event, partyId) => {
  try {
    return await launcherJson(`/api/parties/${encodeURIComponent(partyId)}/discord`, {
      method: "POST",
    });
  } catch (err) {
    return { error: err.message };
  }
});

/**
 * Install folder for a slug, preferring the edition record the way playGame
 * does — a modded edition and the vanilla install are different folders and
 * only one of them has the mod that reads the adapter file.
 */
function resolveGameDirForSlug(slug, editionSlug = null) {
  const game = loadState()[slug];
  if (!game) return null;
  const edSlug = editionSlug || game.editionSlug || DEFAULT_EDITION_SLUG;
  const info = game.editions?.[edSlug] || game;
  const exe = info?.exe || game.exe;
  if (info?.dir) return info.dir;
  return exe ? path.dirname(exe) : null;
}

/*
 * Put this machine on a party's overlay segment and point the game at it.
 *
 * The whole sequence lives in one handler because every step is useless
 * without the next: joining without authorization never brings the adapter
 * up, and an adapter nobody wrote into the game's saved-adapter file leaves
 * the player picking from a dropdown anyway. Each failure returns a reason
 * the party window can show verbatim rather than a bare false.
 */
ipcMain.handle("prepare-virtual-lan", async (_event, opts) => {
  const { partyId, networkId, slug, adapterFile } = opts || {};
  try {
    const status = await virtualLan.overlayStatus();
    if (!status.installed) {
      return {
        error: "PlayBound Connect needs the ZeroTier network client for this game.",
        needsInstall: true,
        downloadUrl: status.downloadUrl,
      };
    }
    if (!status.ready) {
      return {
        error: status.error || "The network client is not responding.",
        needsElevation: Boolean(status.needsElevation),
        downloadUrl: status.downloadUrl,
      };
    }

    const joined = await virtualLan.joinNetwork(networkId);
    if (joined.error) return { error: joined.error };

    // The site authorizes this node; until it does, the adapter stays down.
    const authorized = await launcherJson(
      `/api/parties/${encodeURIComponent(partyId)}/lan`,
      { method: "POST", body: { nodeId: status.nodeId } }
    );
    if (authorized?.error) return { error: authorized.error };

    const adapterName = await virtualLan.waitForAdapter();
    if (!adapterName) {
      return { error: "The network adapter did not come up. Try Join Game again." };
    }

    let pointed = false;
    if (adapterFile) {
      const gameDir = resolveGameDirForSlug(slug);
      pointed = await virtualLan.writeAdapterFile(gameDir, adapterFile, adapterName);
    }
    return { ok: true, adapterName, pointed };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("get-party-chat", async (_event, partyId, after) => {
  try {
    const qs = after ? `?after=${encodeURIComponent(after)}` : "";
    return await launcherJson(`/api/parties/${encodeURIComponent(partyId)}/chat${qs}`);
  } catch (err) {
    return { error: err.message, messages: [] };
  }
});

ipcMain.handle("send-party-chat", async (_event, partyId, content) => {
  try {
    return await launcherJson(`/api/parties/${encodeURIComponent(partyId)}/chat`, {
      method: "POST",
      body: { content },
    });
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("get-discord-status", async () => {
  try {
    return await launcherJson("/api/account/discord");
  } catch (err) {
    return { error: err.message, linked: false };
  }
});

ipcMain.handle("link-discord", () => {
  openAuthWindow(`${getApiBase()}/api/auth/discord/start?from=launcher`);
  return { ok: true };
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

ipcMain.handle("cancel-friend-request", async (_event, requestId) => {
  try {
    const res = await fetch(`${getApiBase()}/api/friends/cancel`, {
      method: "POST",
      headers: launcherApiHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ requestId }),
    });
    if (!res.ok) throw new Error("Failed to cancel request");
    return await res.json();
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("block-user", async (_event, targetUserId) => {
  try {
    const res = await fetch(`${getApiBase()}/api/friends/block`, {
      method: "POST",
      headers: launcherApiHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ targetUserId }),
    });
    if (!res.ok) throw new Error("Failed to block user");
    return await res.json();
  } catch (err) {
    return { error: err.message };
  }
});

async function collectHardwareProfile() {
  const settings = loadSettings();
  try {
    const hw = loadHardwareModule();
    if (!hw?.detectHardware) {
      throw new Error("Hardware module not available in this build");
    }
    const profile = await hw.detectHardware({
      app,
      gameDir: settings.gamesDir || DEFAULT_GAMES_DIR,
    });
    return profile;
  } catch (err) {
    try {
      const hw = loadHardwareModule();
      if (hw?.minimalHardwareFallback) {
        return await hw.minimalHardwareFallback({
          app,
          gameDir: settings.gamesDir || DEFAULT_GAMES_DIR,
          reason: err?.message || String(err),
        });
      }
    } catch {
      /* fall through */
    }
    const cpus = os.cpus() || [];
    const first = cpus[0];
    return {
      schemaVersion: 1,
      collectedAt: new Date().toISOString(),
      os: {
        family: process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : "linux",
        name: null,
        version: os.release?.() || null,
        arch: process.arch === "arm64" ? "arm64" : process.arch === "ia32" ? "x86" : "x64",
        bitness: process.arch === "ia32" ? 32 : 64,
      },
      cpu: {
        rawName: first?.model || "Unknown CPU",
        manufacturer: null,
        model: first?.model || null,
        cores: cpus.length || null,
        threads: cpus.length || null,
      },
      gpus: [],
      primaryGpuIndex: null,
      primaryGpuConfidence: "low",
      memory: { totalMB: Math.round(os.totalmem() / (1024 * 1024)) },
      storage: {},
      detectionErrors: [err?.message || String(err), "gpu: not detected"],
    };
  }
}

function shouldSyncHardwareProfile(settings, force = false) {
  if (force) return true;
  if (!settings?.launcherToken) return false;
  const lastSynced = settings.hardwareProfileSyncedAt;
  if (!lastSynced) return true; // 1. First time user loads the launcher
  const lastDate = new Date(lastSynced).toDateString();
  const today = new Date().toDateString();
  return lastDate !== today; // 2. First time user loads the launcher for the day
}

async function syncHardwareProfile({ quiet = false, force = false } = {}) {
  const settings = loadSettings();
  if (!settings.launcherToken) {
    return { error: "Not signed in" };
  }
  if (!shouldSyncHardwareProfile(settings, force)) {
    return { success: true, skipped: true, profile: settings.hardwareProfile || null };
  }
  try {
    // Forces a fresh read and refreshes the shared hourly cache, so the panel
    // cannot keep showing a profile older than the one just synced.
    const profile = await cachedHardwareProfile({ force: true });
    const next = { ...settings, hardwareProfile: profile, hardwareProfileCollectedAt: profile.collectedAt };
    saveSettings(next);
    const res = await fetch(`${getApiBase()}/api/hardware/profile`, {
      method: "PUT",
      headers: launcherApiHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(profile),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(data?.error || `HTTP ${res.status}`);
    }
    saveSettings({
      ...loadSettings(),
      hardwareProfileSyncedAt: new Date().toISOString(),
    });
    if (!quiet) {
      notifyAccount({
        connected: true,
        message: "Hardware profile synced.",
      });
    }
    return { success: true, profile: data?.profile || profile };
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * Hardware detection, memoised for an hour.
 *
 * collectHardwareProfile enumerates CPU, GPU and memory through
 * systeminformation, which takes long enough to be visible. Every render of a
 * view that shows the profile was re-running it from scratch, so the panel
 * flipped between "loading" and a result as the user moved around — detecting,
 * repeatedly and at cost, facts that do not change while the app is open.
 *
 * An hour is arbitrary but far longer than any session's worth of re-renders
 * and far shorter than a hardware change matters over. "Sync now" forces a
 * fresh read, which is the one moment the user is actually asking to re-detect.
 *
 * In memory rather than on disk on purpose: a restart is a free way to pick up
 * a genuinely new GPU, and the settings file already stores the last profile
 * that was synced to the account.
 */
const HARDWARE_PROFILE_TTL_MS = 60 * 60 * 1000;
let _hardwareProfile = null;
let _hardwareProfileAt = 0;

async function cachedHardwareProfile({ force = false } = {}) {
  const now = Date.now();
  if (!force && _hardwareProfile && now - _hardwareProfileAt < HARDWARE_PROFILE_TTL_MS) {
    return _hardwareProfile;
  }
  const profile = await collectHardwareProfile();
  _hardwareProfile = profile;
  _hardwareProfileAt = Date.now();
  return profile;
}

ipcMain.handle("get-hardware-profile", async (_event, opts = {}) => {
  try {
    const settings = loadSettings();
    const profile = await cachedHardwareProfile({ force: Boolean(opts?.force) });
    return {
      profile,
      cached: settings.hardwareProfile || null,
      syncedAt: settings.hardwareProfileSyncedAt || null,
    };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("sync-hardware-profile", async () => syncHardwareProfile({ quiet: false, force: true }));

ipcMain.handle("get-hardware-compatibility", async (_event, gameSlug, opts = {}) => {
  try {
    const settings = loadSettings();
    if (!settings.launcherToken) {
      return { hasProfile: false, result: null, signedIn: false };
    }
    const params = new URLSearchParams({ gameSlug: String(gameSlug || "") });
    if (opts?.editionSlug) params.set("editionSlug", String(opts.editionSlug));
    if (Array.isArray(opts?.modSlugs) && opts.modSlugs.length) {
      params.set("modSlugs", opts.modSlugs.join(","));
    }
    const res = await fetch(`${getApiBase()}/api/hardware/compatibility?${params}`, {
      headers: launcherApiHeaders(),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return { error: data?.error || `HTTP ${res.status}`, hasProfile: false, result: null };
    }
    return {
      hasProfile: Boolean(data?.hasProfile),
      result: data?.result ?? null,
      signedIn: true,
    };
  } catch (err) {
    return { error: err.message, hasProfile: false, result: null };
  }
});

ipcMain.handle("get-appear-offline", async () => {
  try {
    const res = await fetch(`${getApiBase()}/api/presence/visibility`, {
      headers: launcherApiHeaders(),
    });
    if (!res.ok) throw new Error("Failed to load visibility");
    return await res.json();
  } catch (err) {
    return { error: err.message, appearOffline: false };
  }
});

ipcMain.handle("set-appear-offline", async (_event, appearOffline) => {
  try {
    const res = await fetch(`${getApiBase()}/api/presence/visibility`, {
      method: "PATCH",
      headers: launcherApiHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ appearOffline: Boolean(appearOffline) }),
    });
    if (!res.ok) throw new Error("Failed to update visibility");
    return await res.json();
  } catch (err) {
    return { error: err.message };
  }
});

/*
 * The other three activity-privacy switches the site's Friends page exposes.
 * `get-appear-offline` already returns all four values, so only the write side
 * was missing. Keys are allow-listed because the route 400s on an empty patch.
 */
const VISIBILITY_KEYS = [
  "appearOffline",
  "hideActivityFromFriends",
  "allowPlayInvites",
  "notifyFriendActivity",
];

ipcMain.handle("set-presence-visibility", async (_event, patch = {}) => {
  try {
    const body = {};
    for (const key of VISIBILITY_KEYS) {
      if (patch[key] !== undefined) body[key] = Boolean(patch[key]);
    }
    if (Object.keys(body).length === 0) return { error: "No fields to update" };
    return await launcherJson("/api/presence/visibility", { method: "PATCH", body });
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("get-lfg", async () => {
  try {
    return await launcherJson("/api/play-together");
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("set-lfg", async (_event, enabled, gameSlug) => {
  try {
    return await launcherJson("/api/presence/lfg", {
      method: "POST",
      body: { enabled: Boolean(enabled), gameSlug: enabled ? gameSlug || null : null },
    });
  } catch (err) {
    return { error: err.message };
  }
});

let presenceSessionId = null;
let presenceTimer = null;
let presenceRetryTimer = null;

function schedulePresenceRetry() {
  if (presenceRetryTimer) return;
  presenceRetryTimer = setTimeout(() => {
    presenceRetryTimer = null;
    void beatLauncherPresence();
  }, 15_000);
}

async function beatLauncherPresence() {
  const settings = loadSettings();
  if (!settings.launcherToken) return;
  const playingSlug = playingGameSlug();
  const body = {
    status: playingSlug ? "playing" : "online",
    page: "/launcher",
    gameId: playingSlug,
    sessionId: presenceSessionId,
  };
  try {
    const path = presenceSessionId ? "/api/presence/heartbeat" : "/api/presence/start";
    const res = await fetch(`${getApiBase()}${path}`, {
      method: "POST",
      headers: launcherApiHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn("[presence] beat failed:", res.status);
      schedulePresenceRetry();
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (data.sessionId) presenceSessionId = data.sessionId;
  } catch (err) {
    console.warn("[presence] beat error:", err instanceof Error ? err.message : err);
    schedulePresenceRetry();
  }
}

function startLauncherPresenceLoop() {
  if (!presenceTimer) {
    presenceTimer = setInterval(() => void beatLauncherPresence(), 60_000);
  }
  void beatLauncherPresence();
}

function stopLauncherPresenceLoop() {
  if (presenceTimer) {
    clearInterval(presenceTimer);
    presenceTimer = null;
  }
  if (presenceRetryTimer) {
    clearTimeout(presenceRetryTimer);
    presenceRetryTimer = null;
  }
  const settings = loadSettings();
  if (settings.launcherToken && presenceSessionId) {
    void fetch(`${getApiBase()}/api/presence/end`, {
      method: "POST",
      headers: launcherApiHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ sessionId: presenceSessionId }),
    }).catch(() => {});
  }
  presenceSessionId = null;
}

ipcMain.handle("get-playing-game", () => playingGameSlug());

ipcMain.handle("presence-heartbeat", async (_event, payload = {}) => {
  try {
    const playingSlug = playingGameSlug();
    const body = {
      status: payload.status || (playingSlug ? "playing" : "online"),
      page: payload.page || "/launcher",
      gameId: payload.gameId || playingSlug,
      sessionId: presenceSessionId,
    };
    const path = presenceSessionId ? "/api/presence/heartbeat" : "/api/presence/start";
    const res = await fetch(`${getApiBase()}${path}`, {
      method: "POST",
      headers: launcherApiHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("presence failed");
    const data = await res.json();
    if (data.sessionId) presenceSessionId = data.sessionId;
    startLauncherPresenceLoop();
    return { ok: true, sessionId: presenceSessionId };
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
ipcMain.handle("search-users", async (_event, query) => {
  try {
    const res = await fetch(`${getApiBase()}/api/friends/search?q=${encodeURIComponent(query)}`, { headers: launcherApiHeaders() });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error || "Failed to search users");
    }
    return await res.json();
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("discover-players", async (_event, params) => {
  try {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`${getApiBase()}/api/friends/discover?${query}`, { headers: launcherApiHeaders() });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error || "Failed to discover players");
    }
    return await res.json();
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("send-friend-request", async (_event, targetUserId) => {
  try {
    const res = await fetch(`${getApiBase()}/api/friends/request`, {
      method: "POST",
      headers: launcherApiHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ targetUserId })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error || "Failed to send request");
    }
    return await res.json();
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("invite-friend-by-email", async (_event, email) => {
  try {
    const res = await fetch(`${getApiBase()}/api/friends/invite`, {
      method: "POST",
      headers: launcherApiHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ email })
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(data?.error || "Failed to send invite");
    }
    return data;
  } catch (err) {
    return { error: err.message };
  }
});
// ----------------------------
ipcMain.handle("get-recently-played", () => listRecentlyPlayed());
ipcMain.handle("get-game-detail", async (_event, slug) => {
  const entry = (await ensureCatalogEntry(slug)) || catalog.find((e) => e.slug === slug);
  if (!entry) return null;
  const state = loadState();
  const info = syncGameInstallSummary(ensureGameInstallRecord(state[slug]));
  const editionsInstalled = installedEditionsPayload(slug);

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
    installed:
      editionsInstalled.some((e) => e.exe) || Boolean(playableExePath(info)),
    installedPath: info?.dir || null,
    version: info?.version || null,
    installedEditionSlug: info?.editionSlug || null,
    installedEditionName: info?.editionName || null,
    installedEditions: editionsInstalled,
    isInstallerKind:
      entry.kind === "github-installer" || entry.kind === "direct-installer",
    pendingInstaller: Boolean(info?.pending) || getPendingInstaller()?.slug === slug,
    scanning: Boolean(info?.pending && info?.scanning),
  };
});

ipcMain.handle("get-mod-detail", async (_event, slug) => {
  let rich = null;
  try {
    const res = await fetch(`${getApiBase()}/api/launcher/mods/${encodeURIComponent(slug)}`, {
      headers: launcherApiHeaders(),
    });
    if (res.ok) rich = await res.json();
  } catch {
    /* offline */
  }
  if (!rich) return null;

  const state = loadState();
  const modsBag = state.__mods__ && typeof state.__mods__ === "object" ? state.__mods__ : {};
  const info = modsBag[slug];

  return {
    ...rich,
    coverImage: resolveMediaUrl(rich.coverImage) || null,
    screenshots: (Array.isArray(rich.screenshots) ? rich.screenshots : [])
      .map((src) => resolveMediaUrl(src))
      .filter(Boolean),
    baseGame: rich.baseGame
      ? {
          ...rich.baseGame,
          coverImage: resolveMediaUrl(rich.baseGame.coverImage) || null,
        }
      : null,
    installed: Boolean(info),
    installedPath: info?.dir || null,
    version: info?.version || null,
  };
});

function setupAutoUpdater() {
  if (!app.isPackaged) return;
  const autoUpdater = getAutoUpdater();
  if (!autoUpdater) {
    console.warn("electron-updater unavailable");
    return;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  // Blob hosts + stale local blockmaps make NSIS delta updates flaky; always pull full Setup.
  autoUpdater.disableDifferentialDownload = true;
  autoUpdater.disableWebInstaller = true;
  autoUpdater.setFeedURL({ provider: "generic", url: UPDATER_FEED_URL });
  applyUpdaterChannel();

  const emit = (payload) => {
    if (win && !win.isDestroyed()) win.webContents.send("update-status", payload);
  };

  autoUpdater.on("checking-for-update", () => emit({ phase: "checking" }));
  autoUpdater.on("update-available", (info) => {
    pendingUpdate = info;
    emit({
      phase: "available",
      version: info.version,
      channel: getEffectiveUpdateChannel(),
    });
  });
  autoUpdater.on("update-not-available", () =>
    emit({
      phase: "none",
      version: app.getVersion(),
      channel: getEffectiveUpdateChannel(),
    })
  );
  autoUpdater.on("download-progress", (p) =>
    emit({ phase: "downloading", percent: Math.round(p.percent || 0) })
  );
  autoUpdater.on("update-downloaded", (info) => {
    pendingUpdate = info;
    emit({
      phase: "ready",
      version: info.version,
      channel: getEffectiveUpdateChannel(),
    });
  });
  autoUpdater.on("error", (err) => emit({ phase: "error", message: err?.message || String(err) }));

  setTimeout(() => {
    void (async () => {
      try {
        await refreshAdminUpdateChannel();
        await autoUpdater.checkForUpdatesAndNotify();
      } catch (err) {
        console.warn("update check failed:", err?.message || err);
      }
    })();
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

function resolveAssetPath(filename) {
  const candidates = [
    path.join(__dirname, "assets", filename),
    path.join(__dirname.replace("app.asar", "app.asar.unpacked"), "assets", filename),
    path.join(process.resourcesPath || "", "assets", filename),
    path.join(process.resourcesPath || "", "app.asar.unpacked", "assets", filename),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return path.join(__dirname, "assets", filename);
}

function getTrayIcon() {
  const assetPath = resolveAssetPath("tray-icon.png");

  // On Linux (GNOME Shell, KDE Plasma, XFCE via AppIndicator/StatusNotifierItem),
  // tray icons are read by the system desktop shell via D-Bus file path.
  // When packaged in an app.asar, external system processes cannot read inside
  // Electron's virtual archive and fall back to the system theme's generic gear/settings
  // icon. We ensure a physical copy exists on disk in userData.
  if (process.platform === "linux") {
    try {
      const iconDir = app.getPath("userData");
      const diskIconPath = path.join(iconDir, "tray-icon.png");
      if (!fs.existsSync(diskIconPath)) {
        if (fs.existsSync(assetPath)) {
          const buf = fs.readFileSync(assetPath);
          fs.writeFileSync(diskIconPath, buf);
        }
      }
      if (fs.existsSync(diskIconPath)) {
        return diskIconPath;
      }
    } catch (err) {
      console.warn("Could not cache tray icon on disk for Linux:", err);
    }
  }

  // Windows & macOS: Load from buffer to ensure valid decoding across packaged builds
  try {
    if (fs.existsSync(assetPath)) {
      const buf = fs.readFileSync(assetPath);
      let icon = nativeImage.createFromBuffer(buf);
      if (!icon.isEmpty()) {
        // Windows notification area standard size is 16x16. macOS menu bar is 18x18.
        const targetSize = process.platform === "win32" ? 16 : process.platform === "darwin" ? 18 : 24;
        icon = icon.resize({ width: targetSize, height: targetSize });
        return icon;
      }
    }
  } catch (err) {
    console.warn("Could not create tray icon from buffer:", err);
  }

  let icon = nativeImage.createFromPath(assetPath);
  if (!icon.isEmpty()) {
    const targetSize = process.platform === "win32" ? 16 : process.platform === "darwin" ? 18 : 24;
    return icon.resize({ width: targetSize, height: targetSize });
  }
  return assetPath;
}

function ensureTray() {
  if (tray) return;
  const icon = getTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip("PlayBound");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open PlayBound", click: () => showMainWindow() },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() },
    ])
  );
  tray.on("click", () => showMainWindow());
}

function createWindow() {
  const { width: workWidth, height: workHeight } = screen.getPrimaryDisplay().workAreaSize;
  const width = Math.min(1200, workWidth);
  const height = Math.min(800, workHeight);
  const minWidth = Math.min(900, workWidth);
  const minHeight = Math.min(600, workHeight);

  const appIconPath = resolveAssetPath(process.platform === "win32" ? "icon.ico" : "icon.png");
  let appIcon = nativeImage.createFromPath(appIconPath);
  if (appIcon.isEmpty()) {
    const pngPath = resolveAssetPath("icon.png");
    try {
      if (fs.existsSync(pngPath)) {
        appIcon = nativeImage.createFromBuffer(fs.readFileSync(pngPath));
      }
    } catch {
      /* ignore */
    }
    if (appIcon.isEmpty()) appIcon = nativeImage.createFromPath(pngPath);
  }

  win = new BrowserWindow({
    width,
    height,
    minWidth,
    minHeight,
    resizable: true,
    backgroundColor: "#0c0a12",
    title: "PlayBound",
    icon: !appIcon.isEmpty() ? appIcon : appIconPath,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  if (!appIcon.isEmpty()) win.setIcon(appIcon);
  else if (fs.existsSync(appIconPath)) win.setIcon(appIconPath);

  win.webContents.setWindowOpenHandler(({ url, features }) => {
    if (url.includes("popout=true")) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 350,
          height: 750,
          minWidth: 300,
          minHeight: 500,
          autoHideMenuBar: true,
          titleBarStyle: "hidden",
          titleBarOverlay: {
            color: "#0a0a0a",
            symbolColor: "#ffffff",
            height: 36,
          },
        }
      };
    }
    return { action: "allow" };
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
    resumePendingInstallerPoll();
    win.webContents.send("context", buildContextPayload());
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
    ["playbound://link?code=abc", { action: "link", code: "abc" }],
    // A durable bearer in the URL must not survive parsing: honouring it let any
    // web page rebind someone else's launcher to the attacker's account.
    ["playbound://link?token=abc", { action: "link", code: "" }],
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

/*
 * Windows identifies a running app by its Application User Model ID, and
 * groups the taskbar button — and picks its icon — from that identity. With no
 * AUMID set, Electron apps resolve to the framework rather than to us, so the
 * taskbar shows Electron's logo and name no matter what icon the window or the
 * executable carries. Must match electron-builder's appId and be set before
 * any window opens.
 */
if (process.platform === "win32") {
  app.setAppUserModelId("gg.playbound.launcher");
}

if (gotLock) {
  app.whenReady().then(async () => {
    if (process.argv.includes("--test-resolve")) return testResolve();
    const installIdx = process.argv.indexOf("--test-install");
    if (installIdx !== -1) return testInstall(process.argv[installIdx + 1]);
    if (process.argv.includes("--test-deep-link")) return testDeepLink();
    const uninstallIdx = process.argv.indexOf("--test-uninstall");
    if (uninstallIdx !== -1) return testUninstall(process.argv[uninstallIdx + 1]);

    void flushLastCrashReport();

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
    if (loadSettings().launcherToken) {
      startLauncherPresenceLoop();
    }

    /*
     * Everything below used to run before createWindow(), which meant the
     * window did not exist until a network round trip to /api/launcher/catalog
     * had finished — and that fetch has no deadline of its own, so a captive
     * portal or a slow connection left the user staring at nothing with no
     * indication the app had started. None of it is needed to paint the first
     * screen: the renderer pulls the catalog through get-catalog per screen and
     * already falls back to the bundled-plus-cached copy, which is exactly what
     * it shows offline today.
     *
     * Running the install scan after the window also fixes a quiet bug. It ends
     * by sending "install-detected" to win, which did not exist yet at this
     * point in startup, so the result of the very first scan was dropped.
     */
    prefetchCatalogLiveStats();
    void scanKnownInstalls();
    void (async () => {
      await refreshRemoteCatalog();
      for (const entry of catalog) {
        if (
          (entry.kind === "github-installer" || entry.kind === "direct-installer") &&
          !(Array.isArray(entry.knownExePaths) && entry.knownExePaths.length > 0)
        ) {
          console.warn(`[catalog] installer ${entry.slug} is missing knownExePaths`);
        }
      }
      void scanKnownInstalls();
    })();

    setupAutoUpdater();
    scheduleLibrarySync();
    if (parsedLaunch) {
      handleDeepLink(parsedLaunch);
    }
    if (!parsedLaunch || parsedLaunch.action !== "sync") {
      setTimeout(() => void startupLibrarySync(), 2_000);
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
