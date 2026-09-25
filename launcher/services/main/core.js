"use strict";

/*
 * Moved out of main.js unchanged: helpers that touch no main-process state
 * (no windows, sessions or timers). main.js requires what it needs from here.
 */

const { app, shell, safeStorage, session } = require("electron");
const { spawn, exec, execFileSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const net = require("net");
const os = require("os");
const Platform = require("../../platform");
const { isUninstallerExe, isInstallerExe } = require("../exeCandidates");
const { createSaveData } = require("../SaveData");
const { createCloudSaves } = require("../CloudSaves");
const { createSettings } = require("../settings");
const { createSecurity } = require("../security");
const { resolveGameJoltBuild } = require("../gameJoltBuild");
const { createDeepLinks } = require("../deepLinks");
const { withOutboundUtm } = require("../../utm");
const { preferRunnableExecutable } = require("../executableFormat");
const { getGamePrefixDirectory } = require("../CompatibilityRunner");
const LAUNCHER_ROOT = path.join(__dirname, "..", "..");

function loadHardwareModule() {
  try {
    return require("../../hardware");
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
/** Platform API feed used by electron-updater to resolve updates from R2. */
const UPDATER_FEED_URL = "https://playbound.club/api/launcher/updates/";

/*
 * YouTube rejects embeds from Electron's local file:// renderer when the
 * initial request has no HTTP Referer (player error 153). Identify this as
 * the PlayBound launcher without replacing legitimate in-frame referers.
 */
function configureYoutubeEmbedIdentity() {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    {
      urls: [
        "https://www.youtube.com/*",
        "https://www.youtube-nocookie.com/*",
      ],
    },
    (details, callback) => {
      const requestHeaders = { ...details.requestHeaders };
      if (!requestHeaders.Referer && !requestHeaders.referer) {
        requestHeaders.Referer = "https://playbound.club/launcher/";
      }
      callback({ requestHeaders });
    }
  );
}

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

/**
 * Cache format version.
 *
 * Bumped when a cache written by an older launcher can no longer be trusted to
 * say which games exist. Version 2 is the first written by a build that
 * reconciles against the live feed instead of unioning every list it has seen.
 */
const CATALOG_CACHE_VERSION = 2;

/**
 * The cached catalog, and whether it is trustworthy about membership.
 *
 * A bare array is a version 1 cache. Those were written by the union logic
 * that reconcileCatalog replaced, so they accumulated every slug the launcher
 * had ever seen and never dropped one: a real cache on disk holds 159 games
 * where the live feed serves 92. Believing it means showing 67 games that no
 * longer exist, each of which fails its detail and hardware lookups with
 * "Game not found" — the site is fine, only the launcher shows them.
 *
 * A stale cache is still useful for filling in fields, so it is not discarded;
 * it just does not get to decide which games exist until a refresh replaces it.
 */
function loadCachedCatalogFile() {
  try {
    if (!fs.existsSync(CATALOG_CACHE_FILE)) return { games: null, trusted: false };
    const data = JSON.parse(fs.readFileSync(CATALOG_CACHE_FILE, "utf-8"));
    if (Array.isArray(data)) {
      return { games: data.length > 0 ? data : null, trusted: false };
    }
    if (data && Array.isArray(data.games) && data.games.length > 0) {
      return { games: data.games, trusted: data.version === CATALOG_CACHE_VERSION };
    }
  } catch (err) {
    console.warn("[catalog-cache] Failed to read cached catalog:", err?.message || err);
  }
  return { games: null, trusted: false };
}

function loadCachedCatalog() {
  return loadCachedCatalogFile().games;
}

function saveCatalogCache(entries) {
  try {
    if (Array.isArray(entries) && entries.length > 0) {
      fs.writeFileSync(
        CATALOG_CACHE_FILE,
        JSON.stringify({ version: CATALOG_CACHE_VERSION, games: entries }, null, 2),
        "utf-8"
      );
    }
  } catch (err) {
    console.warn("[catalog-cache] Failed to write cached catalog:", err?.message || err);
  }
}

/**
 * Legacy install keys that must resolve to a live catalog slug.
 * Keep in sync with platform/src/lib/catalogGameAliases.ts where relevant.
 */
const INSTALLED_SLUG_ALIASES = {
  "c-dogs-retrarch": "c-dogs-sdl",
};

/**
 * Rewrite installed.json keys that still use a renamed catalog slug so library
 * title/cover and Play/sync hit the live entry.
 */
function migrateInstalledSlugAliases(state) {
  if (!state || typeof state !== "object") return state;
  let changed = false;
  for (const [from, to] of Object.entries(INSTALLED_SLUG_ALIASES)) {
    if (!Object.prototype.hasOwnProperty.call(state, from)) continue;
    const legacy = state[from];
    const current = state[to];
    if (!current) {
      state[to] = legacy;
    } else if (legacy && typeof legacy === "object") {
      // Prefer whichever record still has a playable install path.
      const legacyReady = Boolean(legacy.exe || legacy.dir);
      const currentReady = Boolean(current.exe || current.dir);
      if (legacyReady && !currentReady) state[to] = legacy;
    }
    delete state[from];
    changed = true;
  }
  if (changed) saveState(state);
  return state;
}

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

function steamAppIdForEntry(entry) {
  const candidates = [entry?.url, entry?.website, entry?.storeUrl].filter(Boolean);
  for (const raw of candidates) {
    const text = String(raw);
    const protocolMatch = text.match(/^steam:\/\/(?:install|store|run)\/(\d+)/i);
    if (protocolMatch) return protocolMatch[1];
    try {
      const parsed = new URL(text);
      if (/(^|\.)steampowered\.com$/i.test(parsed.hostname)) {
        const storeMatch = parsed.pathname.match(/\/app\/(\d+)/i);
        if (storeMatch) return storeMatch[1];
      }
    } catch {
      /* not a URL we understand */
    }
  }
  return null;
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

/**
 * Directories someone explicitly pointed the launcher at.
 *
 * allowedExecutableRoots exists to stop the launcher spawning whatever a
 * catalog row or a drive scan happens to name, which is worth keeping. But a
 * path chosen in an OS file picker is not a guess — it is a person saying
 * "the game is here", and refusing it made Locate useless for anyone who does
 * not install to the default folder. Red Eclipse in D:\Games located fine and
 * then failed to launch with "Executable path is outside allowed install
 * locations", which reads as a bug in the game rather than a rule about paths.
 *
 * The directory is remembered rather than the file, because a game rarely
 * launches the exe you pointed at — bootstrappers, edition binaries and mod
 * loaders all live beside it. A filesystem root is never remembered: picking
 * D:\game.exe must not trust the whole drive, so that case stores the exact
 * file instead.
 */
function rememberLocatedRoot(exePath) {
  try {
    const full = normalizeFsPath(exePath);
    if (!full) return;
    const isMacApp = process.platform === "darwin" && full.endsWith(".app");
    const dir = isMacApp ? full : path.dirname(full);
    const root = path.parse(dir).root;
    // A bare drive root would trust everything on the disk; allow just this file.
    const remembered = !dir || dir === root ? full : dir;

    const settings = loadSettings();
    const existing = Array.isArray(settings.locatedRoots) ? settings.locatedRoots : [];
    if (existing.some((entry) => pathUnderRoot(remembered, entry))) return;
    // A newly chosen parent supersedes anything it contains.
    const next = existing.filter((entry) => !pathUnderRoot(entry, remembered));
    next.push(remembered);
    settings.locatedRoots = next.slice(-50);
    saveSettings(settings);
  } catch (err) {
    // A launch must never fail because a preference would not save.
    console.warn("[locate] could not remember install location:", err?.message || err);
  }
}
const LIBRARY_BATCH_TIMEOUT_MS = 45_000;
const LIBRARY_ITEM_SYNC_TIMEOUT_MS = 12_000;

function formatLibrarySyncError(err) {
  const msg = err?.message || String(err || "");
  if (/aborted|timeout/i.test(msg)) {
    return "Library sync timed out — will retry in the background";
  }
  return msg;
}

function isSyncTimeoutError(err) {
  const msg = err?.message || String(err || "");
  return /aborted|timeout/i.test(msg);
}

/** Sync every game + mod in installed.json to the library. */
async function syncLibraryItemsIndividually(token, installs, modInstalls) {
  let synced = 0;
  const skipped = [];
  for (const item of installs) {
    try {
      const one = await apiFetch(
        `${getApiBase()}/api/library/sync`,
        {
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
        },
        LIBRARY_ITEM_SYNC_TIMEOUT_MS
      );
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
      const one = await apiFetch(
        `${getApiBase()}/api/library/sync`,
        {
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
        },
        LIBRARY_ITEM_SYNC_TIMEOUT_MS
      );
      if (one.ok) synced += 1;
      else skipped.push(item.slug);
    } catch {
      skipped.push(item.slug);
    }
  }
  return { synced, skipped, error: null };
}

async function postLibraryBatch(token, installs, modInstalls) {
  return apiFetch(
    `${getApiBase()}/api/library/sync/batch`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        "user-agent": "playbound-launcher",
      },
      body: JSON.stringify({ installs, modInstalls, prune: true }),
    },
    LIBRARY_BATCH_TIMEOUT_MS
  );
}

async function runLibrarySync() {
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
    const primaryEditionSlug = game.editionSlug || (editions.length > 0 ? editions[0]?.editionSlug : null);
    installs.push({
      slug,
      ...(game.version ? { version: String(game.version) } : {}),
      ...(primaryEditionSlug ? { editionSlug: String(primaryEditionSlug) } : {}),
    });
    for (const ed of editions) {
      if (ed && ed.editionSlug && ed.editionSlug !== primaryEditionSlug) {
        installs.push({
          slug,
          editionSlug: String(ed.editionSlug),
          ...(ed.version ? { version: String(ed.version) } : {}),
        });
      }
    }
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
    let res;
    try {
      res = await postLibraryBatch(token, installs, modInstalls);
    } catch (err) {
      if (isSyncTimeoutError(err)) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        res = await postLibraryBatch(token, installs, modInstalls);
      } else {
        throw err;
      }
    }
    if (res.status === 401) {
      return { synced: 0, skipped: [], error: "unauthorized" };
    }
    if (!res.ok) {
      console.warn(`Library batch sync failed: HTTP ${res.status}`);
      return syncLibraryItemsIndividually(token, installs, modInstalls);
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
    const fallback = await syncLibraryItemsIndividually(token, installs, modInstalls);
    if (fallback.synced > 0 || fallback.skipped.length > 0) {
      return fallback;
    }
    return { synced: 0, skipped: [], error: formatLibrarySyncError(err) };
  }
}

/* ── install state ─────────────────────────────────────────── */

function loadState() {
  try {
    const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    return migrateInstalledSlugAliases(state);
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
/**
 * The exe an install record claims, but only if it is still on disk.
 *
 * `record.exe && fs.existsSync(record.exe)` was written out at seventeen call
 * sites, in five spellings that differ only in how they handle a missing
 * record. Returning the path rather than a boolean covers both uses: the
 * predicate reads as a truthiness check, and the sites that went on to use the
 * value stop repeating the property access.
 *
 * Deliberately not playableExePath below, which is a different question — that
 * one falls back to a jar in the install directory, so a game with no exe can
 * still be playable through it.
 */
function exeOnDisk(record) {
  if (record?.exe && fs.existsSync(record.exe)) {
    if (!isUninstallerExe(record.exe)) {
      return record.exe;
    }
    if (record?.dir && fs.existsSync(record.dir)) {
      const real = findExecutable(record.dir);
      if (real && !isUninstallerExe(real)) {
        record.exe = real;
        return real;
      }
    }
    return null;
  }
  return null;
}

function playableExePath(info) {
  return exeOnDisk(info) || findJarInDir(info?.dir) || null;
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

function editionInstallDir(slug, editionSlug) {
  return path.join(gamesRoot(), slug, editionSlug || DEFAULT_EDITION_SLUG);
}

async function pullCompatibilityPreference() {
  const settings = loadSettings();
  if (!settings.launcherToken) return;
  try {
    const res = await apiFetch(`${getApiBase()}/api/auth/preferences`, {
      headers: launcherApiHeaders(),
    });
    if (!res.ok) return;
    const data = await res.json();
    const prefs = data?.preferences || {};
    let changed = false;
    const mode = prefs.compatibilityFilter;
    if (mode === "compatible" || mode === "all") {
      settings.compatibilityFilter = mode;
      changed = true;
    }
    if (prefs.discoveryMode === "FREE" || prefs.discoveryMode === "ALL") {
      settings.discoveryMode = prefs.discoveryMode;
      changed = true;
    }
    if (changed) saveSettings(settings);
  } catch {
    /* offline */
  }
}

async function pushCompatibilityPreference(mode) {
  const settings = loadSettings();
  if (!settings.launcherToken) return;
  try {
    await apiFetch(`${getApiBase()}/api/auth/preferences`, {
      method: "PATCH",
      headers: launcherApiHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ compatibilityFilter: mode }),
    });
  } catch {
    /* offline */
  }
}

async function pushDiscoveryPreference(mode) {
  const settings = loadSettings();
  if (!settings.launcherToken) return;
  try {
    await apiFetch(`${getApiBase()}/api/auth/preferences`, {
      method: "PATCH",
      headers: launcherApiHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ discoveryMode: mode }),
    });
  } catch {
    /* offline */
  }
}

async function fetchLauncherEditions(gameSlug) {
  const qs = gameSlug ? `?game=${encodeURIComponent(gameSlug)}` : "";
  const res = await apiFetch(`${getApiBase()}/api/launcher/editions${qs}`, {
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
    registerDownloadHostFromUrl(cfg.urlMac);
    registerDownloadHostFromUrl(cfg.urlLinux);
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
      assetPatternMac: cfg.assetPatternMac || undefined,
      assetPatternLinux: cfg.assetPatternLinux || undefined,
      exeHint: cfg.exeHint || undefined,
      url: cfg.url || undefined,
      urlMac: cfg.urlMac || undefined,
      urlLinux: cfg.urlLinux || undefined,
      fileName: cfg.fileName || undefined,
      versionLabel: cfg.versionLabel || undefined,
      gameJoltBuildId: cfg.gameJoltBuildId || undefined,
      steamPrerequisites: Array.isArray(cfg.steamPrerequisites) ? cfg.steamPrerequisites : undefined,
      knownExePaths: Array.isArray(cfg.knownExePaths) ? cfg.knownExePaths : undefined,
      launchArgs: Array.isArray(cfg.launchArgs) ? cfg.launchArgs : undefined,
      registryTitles: Array.isArray(cfg.registryTitles) ? cfg.registryTitles : undefined,
      installRoot: cfg.installRoot || undefined,
      connectArgs: Array.isArray(cfg.connectArgs) ? cfg.connectArgs : undefined,
      note: cfg.note || undefined,
      postInstallDiscord: cfg.postInstallDiscord || undefined,
      postInstallEqw: Boolean(cfg.postInstallEqw),
      overlayUrl: cfg.overlayUrl || undefined,
      overlayFileName: cfg.overlayFileName || undefined,
      overlayDest: cfg.overlayDest || undefined,
      unwrapSingleRoot: Boolean(cfg.unwrapSingleRoot),
      needsDosBox: Boolean(cfg.needsDosBox),
      needsAdmin: Boolean(cfg.needsAdmin),
      needsDirectDrawWrapper: Boolean(cfg.needsDirectDrawWrapper),
      requiresBaseDir: Boolean(cfg.requiresBaseDir),
      baseExeHint: cfg.baseExeHint || undefined,
      overlayBrowseUrl: cfg.overlayBrowseUrl || undefined,
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
      features: Array.isArray(edition.features) ? edition.features : [],
      tags: Array.isArray(edition.tags) ? edition.tags : [],
      hasControllerSupport: edition.hasControllerSupport ?? null,
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

/** Normalize media fields returned by event endpoints for the file:// renderer. */
function resolveEventMedia(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const normalized = { ...payload };
  if (normalized.event && typeof normalized.event === "object") {
    normalized.event = {
      ...normalized.event,
      coverImage: resolveMediaUrl(normalized.event.coverImage),
    };
  }
  if (Array.isArray(normalized.events)) {
    normalized.events = normalized.events.map((event) => ({
      ...event,
      coverImage: resolveMediaUrl(event?.coverImage),
    }));
  }
  if (normalized.game && typeof normalized.game === "object") {
    normalized.game = {
      ...normalized.game,
      coverImage: resolveMediaUrl(normalized.game.coverImage),
    };
  }
  return normalized;
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

/**
 * Default ceiling for a site API call.
 *
 * Long enough that a slow-but-working connection still succeeds, short enough
 * that a stalled one gives up while the player is still watching.
 */
const API_TIMEOUT_MS = 8000;

/**
 * `fetch` that cannot hang forever.
 *
 * Nearly every call here went out with no AbortSignal, so a connection that
 * opened and then stalled — a captive portal, a dropped VPN, a half-open
 * socket after sleep — never settled. The game page awaits four of these
 * before it paints, so one stall left it on "Loading game details…"
 * indefinitely rather than falling back to the catalog it already has.
 *
 * Callers that need their own deadline can still pass a signal; theirs wins.
 */
async function apiFetch(url, init = {}, timeoutMs = API_TIMEOUT_MS) {
  if (init.signal) return fetch(url, init);
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}
const CATALOG_TTL_MS = 5 * 60 * 1000;

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
    /\.(dmg|pkg)$/i.test(n) ||
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
  const linuxPat = entry?.assetPatternLinux || entry?.linuxAssetPattern;
  const winPat = entry?.assetPattern;
  if (process.platform === "darwin") {
    if (macPat) patterns.push(macPat);
    // Catalog recipes are often Windows-shaped; try portable Mac fallouts before failing.
    if (winPat && !/(win|windows|\.exe)/i.test(winPat)) patterns.push(winPat);
    patterns.push(
      "(macos|osx|darwin|mac).*\\.(zip|dmg|pkg)$",
      "\\.(dmg|pkg)$",
      "\\.jar$"
    );
    if (winPat) patterns.push(winPat);
  } else if (process.platform === "linux") {
    if (linuxPat) patterns.push(linuxPat);
    if (winPat && !/(win|windows|\.exe)/i.test(winPat)) patterns.push(winPat);
    patterns.push(
      "(linux|ubuntu|appimage).*\\.(zip|tar\\.gz|tar\\.xz|appimage)$",
      "\\.(appimage)$",
      "\\.jar$"
    );
    if (winPat) patterns.push(winPat);
  } else {
    if (winPat) patterns.push(winPat);
    if (macPat) patterns.push(macPat);
    if (linuxPat) patterns.push(linuxPat);
  }
  return [...new Set(patterns.filter(Boolean))];
}

/**
 * Why an itch.io page yielded no downloadable files.
 *
 * `data-upload_id` only appears for files itch will hand over without a
 * purchase, so its absence has several very different causes and the bare
 * "No download files found on itch.io page" named none of them. Whoever hits
 * this is usually the person who just catalogued the game, and what they need
 * to know is whether the recipe is wrong or the page simply has nothing to
 * download.
 */
function itchNoDownloadsReason(html, pageUrl) {
  const where = pageUrl ? ` (${pageUrl})` : "";
  if (/you must be logged in|log in to (?:download|access)/i.test(html)) {
    return `That itch.io page needs an account to download${where}. Catalog it as external so the player signs in on the page.`;
  }
  // A browser game has an embed and no files at all — the commonest reason a
  // small itch entry has nothing to fetch.
  if (/html_embed_widget|id=["']game_drop["']|class=["'][^"']*iframe_placeholder/i.test(html)) {
    return `That itch.io page is a browser game with no downloads${where}. Catalog it as browser-playable rather than a download.`;
  }
  /*
   * Name-your-own-price before paid, because an NYP page carries the same
   * buy_btn markup and was being reported as selling the game. Meteorite is
   * the case: its data.json says price "$0.00" and the button reads "Download
   * Now", yet the checker told the operator to catalog a free game as a
   * purchase. The files are free — they just sit behind itch's "no thanks,
   * take me to the downloads" step, which needs a session and a CSRF token,
   * so there is no upload id in the page for us to fetch.
   */
  if (/name your own price|pay what you want/i.test(html)) {
    return `That itch.io page is free but name-your-own-price, so the files sit behind itch's payment step and we cannot fetch them${where}. Catalog it as external — the player clicks Download Now, then "No thanks, just take me to the downloads".`;
  }
  if (/buy_row|class=["'][^"']*buy_btn|itemprop=["']price["']/i.test(html)) {
    return `That itch.io page sells the game, so there is no free download to fetch${where}. Catalog it as external and the player buys it on the page.`;
  }
  if (/<title>[^<]*(?:not found|404)/i.test(html)) {
    return `That itch.io page does not exist${where}. Check the URL on the game's catalog entry.`;
  }
  return `No downloadable files on that itch.io page${where}. It may be browser-only, paid, or the URL may point at a profile rather than a game.`;
}

async function resolveDownload(entry) {
  if (entry.kind === "gamejolt-build") {
    const url = await resolveGameJoltBuild(entry.gameJoltBuildId);
    const fromPath = path.basename(new URL(url).pathname);
    return {
      url,
      name: entry.fileName || fromPath || `${entry.slug}.rar`,
      version: entry.versionLabel || "GameJolt",
    };
  }

  // Checked before the generic direct-zip fallback below: ballistica.net prunes
  // older BombSquad build files as soon as a new version ships, so a stale
  // catalog url 404s until the daily version-check cron patches it. Querying
  // the live downloads page here avoids that gap entirely.
  if (entry.kind === "ballistica-zip" || (entry.url && /ballistica\.net/i.test(entry.url))) {
    try {
      const res = await fetch("https://ballistica.net/downloads", {
        headers: { "user-agent": "playbound-launcher" },
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        const html = await res.text();
        let pattern = /https:\/\/files\.ballistica\.net\/bombsquad\/builds\/BombSquad_Windows_[^"<'\s]+\.zip/i;
        if (process.platform === "darwin") {
          pattern = /https:\/\/files\.ballistica\.net\/bombsquad\/builds\/BombSquad_Mac_[^"<'\s]+\.dmg/i;
        } else if (process.platform === "linux") {
          pattern = /https:\/\/files\.ballistica\.net\/bombsquad\/builds\/BombSquad_Linux_x86_64_[^"<'\s]+\.tar\.gz/i;
        }
        const m = html.match(pattern);
        if (m && m[0]) {
          const liveUrl = m[0];
          const fileName = path.basename(new URL(liveUrl).pathname);
          // Windows zip, Mac dmg, and Linux tar.gz all encode the train after the OS token.
          const versionMatch = fileName.match(
            /BombSquad_(?:Windows|Mac|Linux_x86_64)_(.+?)(?:\.tar\.gz|\.zip|\.dmg)$/i
          );
          return {
            url: liveUrl,
            name: fileName,
            version: (versionMatch && versionMatch[1]) || entry.versionLabel || "latest",
          };
        }
      }
    } catch (e) {
      console.warn("Could not query live ballistica.net downloads page, falling back:", e?.message || e);
    }
  }

  if (
    entry.kind === "direct-zip" ||
    // Same fetch as direct-zip; extractArchive dispatches on the extension.
    entry.kind === "direct-7z" ||
    entry.kind === "direct-installer" ||
    entry.kind === "direct-exe"
  ) {
    let effectiveUrl = entry.url;
    if (process.platform === "darwin" && entry.urlMac) {
      /*
       * Apple ship two architectures and several projects build for both, so
       * one urlMac hands half of Mac users a slice they cannot run. 0 A.D. is
       * the case: macos-aarch64.dmg and macos-x86_64.dmg, and an Intel Mac
       * given the first gets nothing.
       *
       * urlMac stays the default — Apple Silicon, which is every Mac sold
       * since 2020 — and urlMacX64 is the Intel override. A recipe with only
       * urlMac keeps working exactly as before.
       */
      effectiveUrl =
        process.arch !== "arm64" && entry.urlMacX64 ? entry.urlMacX64 : entry.urlMac;
    } else if (process.platform === "linux" && entry.urlLinux) {
      effectiveUrl = entry.urlLinux;
    }

    if (!effectiveUrl) {
      throw new Error(`No download URL configured for ${entry.title || entry.slug || "this game"}`);
    }

    if (
      process.platform === "darwin" &&
      (entry.kind === "direct-installer" || entry.kind === "direct-exe") &&
      !entry.urlMac &&
      /\.(exe|msi)$/i.test(String(effectiveUrl || entry.fileName || ""))
    ) {
      throw new Error(
        "This game only ships a Windows installer in the catalog. On Mac, use Locate to select the .app if you already installed it."
      );
    }
    const overridden = effectiveUrl !== entry.url;
    let name = entry.fileName;
    try {
      const urlFileName = path.basename(new URL(effectiveUrl).pathname);
      if (overridden || !name || name === "download" || !name.includes(".")) {
        if (urlFileName && urlFileName !== "download" && urlFileName.includes(".")) {
          name = urlFileName;
        }
      }
    } catch {}
    /*
     * `fileName` describes the Windows build, so a per-platform override must
     * not be allowed to keep it — the extension decides how the download is
     * installed, and 7KAA's Linux .tar.gz saved as 7kaa-install-win32.exe gets
     * openPath'd as an installer instead of extracted.
     *
     * The basename alone is not enough to catch it: SourceForge serves
     * .../7kaa-2.15.7-linux-x86-64.tar.gz/download, so the basename is
     * "download" and the real name is the segment before it. Scan from the end
     * so that trailing-segment shape resolves to the file rather than to some
     * earlier archive-looking directory.
     */
    if (
      (overridden && name === entry.fileName) ||
      !name ||
      name === "download" ||
      !name.includes(".")
    ) {
      try {
        const parts = new URL(effectiveUrl).pathname.split("/").filter(Boolean).reverse();
        const fromPath = parts.find((p) =>
          /\.(exe|zip|7z|rar|msi|dmg|pkg|jar|tar\.gz|tar\.xz|tgz|appimage|bin)$/i.test(
            decodeURIComponent(p)
          )
        );
        name = (fromPath && decodeURIComponent(fromPath)) || entry.fileName || `${entry.slug}.bin`;
      } catch {
        name = entry.fileName || `${entry.slug}.bin`;
      }
    }
    return { url: effectiveUrl, name, version: entry.versionLabel || "fixed" };
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
    if (!uploadMatches.length) throw new Error(itchNoDownloadsReason(html, pageUrl));
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

  const findAsset = (candidate) => {
    let found = null;
    for (const pattern of assetPatternsForEntry(entry)) {
      found = pickGithubAsset(candidate.assets, pattern);
      if (found && hostOsAssetScore(found.name) >= 0) break;
      if (found && process.platform !== "darwin") break;
      found = null;
    }
    if (!found && process.platform === "darwin") {
      const candidates = sortAssetsForHost(candidate.assets).filter(
        (a) => hostOsAssetScore(a.name) >= 0
      );
      found = candidates[0] || null;
    }
    return found;
  };

  let matched = findAsset(release);
  let matchedRelease = release;

  /*
   * The newest release is not always a release of the thing we install.
   *
   * TES3MP shipped a VR build as its latest, carrying only
   * `tes3mp.Win64.release.0.8.1.VR.client.zip` — so a recipe correctly asking
   * for the desktop client found nothing and the install failed, even though
   * the desktop build existed one release back. Upstreams do this routinely:
   * VR forks, ARM-only hotfixes, a platform-specific respin.
   *
   * So a miss on `latest` walks back through recent releases rather than
   * giving up. Bounded, and prereleases stay excluded: this is for finding the
   * build the recipe already describes, not for loosening what it accepts.
   */
  if (!matched) {
    try {
      const listRes = await fetch(
        `https://api.github.com/repos/${entry.repo}/releases?per_page=10`,
        { headers: { "user-agent": "playbound-launcher", accept: "application/vnd.github+json" } }
      );
      if (listRes.ok) {
        const releases = await listRes.json();
        for (const candidate of Array.isArray(releases) ? releases : []) {
          if (candidate?.prerelease || candidate?.draft) continue;
          if (candidate?.tag_name === release?.tag_name) continue;
          const found = findAsset(candidate);
          if (found) {
            matched = found;
            matchedRelease = candidate;
            console.log(
              `[install] ${entry.repo}: no match in ${release.tag_name}, using ${candidate.tag_name}`
            );
            break;
          }
        }
      }
    } catch (err) {
      // The error below is about the latest release either way; a failed
      // lookback must not replace it with a network complaint.
      console.warn(`[install] ${entry.repo}: release lookback failed:`, err?.message || err);
    }
  }

  if (!matched) {
    const patterns = assetPatternsForEntry(entry);
    const err = new Error(
      `No ${process.platform === "darwin" ? "macOS" : "matching"} asset for ${entry.repo} ${release.tag_name}`
    );
    err.code = "ASSET_NOT_FOUND";
    err.repo = entry.repo;
    err.assetPattern = patterns[0] || entry.assetPattern || undefined;
    err.version = release.tag_name;
    err.versionLabel = entry.versionLabel || release.tag_name;
    throw err;
  }
  return {
    url: matched.browser_download_url,
    name: matched.name,
    version: matchedRelease.tag_name,
    size: matched.size,
  };
}

async function resolveModDownload(install) {
  if (install.downloadKind === "direct-zip") {
    let effectiveUrl = install.url || install.directUrl;
    if (process.platform === "darwin" && (install.urlMac || install.directUrlMac)) {
      effectiveUrl = install.urlMac || install.directUrlMac;
    } else if (process.platform === "linux" && (install.urlLinux || install.directUrlLinux)) {
      effectiveUrl = install.urlLinux || install.directUrlLinux;
    }
    if (!effectiveUrl) throw new Error("Mod has no direct download URL");
    let name = path.basename(new URL(effectiveUrl).pathname) || "mod.zip";
    // ContentDB and similar end with /download/
    if (!/\.(zip|jar)$/i.test(name) || /^download$/i.test(name)) {
      name = `${install.slug || "mod"}.zip`;
    }
    return { url: effectiveUrl, name, version: install.versionLabel || "fixed" };
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
    const pattern =
      process.platform === "darwin" && install.assetPatternMac
        ? install.assetPatternMac
        : process.platform === "linux" && install.assetPatternLinux
          ? install.assetPatternLinux
          : install.assetPattern || "\\.zip$";
    const asset = pickGithubAsset(release.assets, pattern);
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

/* ── install queue & download with progress ────────────────── */

const installQueue = [];

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

async function verifyChecksumSha256(filePath, expectedSha256) {
  if (!expectedSha256) return;
  const want = String(expectedSha256).trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(want)) return;
  const hash = crypto.createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  const got = hash.digest("hex");
  if (got !== want) {
    throw new Error(
      `Download SHA-256 checksum mismatch (expected ${want}, got ${got}). The downloaded file may be corrupted.`
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
 * Expand a .pkg into destDir. macOS only.
 *
 * A .pkg is normally applied with `installer -pkg X -target /`, which writes
 * system-wide and needs root. That is the wrong shape here twice over: every
 * other game lands in its own directory under the library, and a launcher that
 * asks for an admin password to install a game has earned the suspicion it
 * gets. `pkgutil --expand-full` unpacks the identical payload without touching
 * the system, which puts this on the same footing as the .dmg path — take the
 * .app out, copy it in, leave nothing behind.
 *
 * Falls back to the Payload trees when a package installs loose files rather
 * than a bundle, since that is the same tree the installer would have written.
 */
function extractPkg(pkgPath, destDir) {
  return new Promise((resolve, reject) => {
    if (process.platform !== "darwin") {
      reject(new Error("PKG installs are only supported on macOS"));
      return;
    }
    const workDir = path.join(
      app.getPath("temp"),
      `playbound-pkg-${process.pid}-${Date.now()}`
    );
    const cleanup = () => {
      try {
        fs.rmSync(workDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    };

    try {
      // pkgutil refuses a destination that already exists; it creates workDir.
      execFileSync("pkgutil", ["--expand-full", String(pkgPath), workDir], {
        timeout: 180_000,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      cleanup();
      reject(new Error(`PKG expand failed: ${err?.message || err}`));
      return;
    }

    try {
      const apps = [];
      const walk = (dir, depth = 0) => {
        if (depth > 8) return;
        let entries;
        try {
          entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const ent of entries) {
          if (!ent.isDirectory()) continue;
          const full = path.join(dir, ent.name);
          // Never descend into a bundle; its own Contents would match again.
          if (ent.name.endsWith(".app")) {
            apps.push(full);
            continue;
          }
          walk(full, depth + 1);
        }
      };
      walk(workDir);

      fs.mkdirSync(destDir, { recursive: true });
      if (apps.length) {
        for (const appPath of apps) {
          fs.cpSync(appPath, path.join(destDir, path.basename(appPath)), { recursive: true });
        }
      } else {
        const payloads = [];
        const findPayloads = (dir, depth = 0) => {
          if (depth > 4) return;
          let entries;
          try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
          } catch {
            return;
          }
          for (const ent of entries) {
            if (!ent.isDirectory()) continue;
            const full = path.join(dir, ent.name);
            if (ent.name === "Payload") payloads.push(full);
            else findPayloads(full, depth + 1);
          }
        };
        findPayloads(workDir);
        if (!payloads.length) {
          cleanup();
          reject(new Error("PKG had no app bundle or payload"));
          return;
        }
        for (const payload of payloads) {
          for (const name of fs.readdirSync(payload)) {
            fs.cpSync(path.join(payload, name), path.join(destDir, name), { recursive: true });
          }
        }
      }
      cleanup();
      resolve();
    } catch (err) {
      cleanup();
      reject(new Error(`PKG extract failed: ${err?.message || err}`));
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

  const roots = app.isPackaged
    ? [
        // Do not probe app.asar first: Electron's virtual filesystem reports
        // the packed helper as existing, but Windows cannot spawn an executable
        // from inside an asar and responds with ENOENT. asarUnpack places the
        // real binary exactly here.
        path.join(process.resourcesPath, "app.asar.unpacked", "node_modules", "7zip-bin"),
      ]
    : [path.join(LAUNCHER_ROOT, "node_modules", "7zip-bin")];

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

/** Check available free bytes on the filesystem hosting targetPath. */
function getAvailableDiskSpace(targetPath) {
  if (!targetPath) return null;
  try {
    let p = path.resolve(targetPath);
    while (!fs.existsSync(p)) {
      const parent = path.dirname(p);
      if (parent === p) break;
      p = parent;
    }
    const stat = fs.statfsSync(p);
    return Number(BigInt(stat.bavail) * BigInt(stat.bsize));
  } catch {
    return null;
  }
}

/** Extract a .7z or .rar. Mirrors extractZip: shell out, no extraction library. */
function extract7z(archivePath, destDir, onPercent) {
  return new Promise((resolve, reject) => {
    const bin = sevenZipBinary();
    if (!bin) {
      reject(
        new Error(
          "This game ships an archive that requires 7-Zip, but the bundled helper is missing. Reinstall PlayBound."
        )
      );
      return;
    }
    /*
     * -bsp1 asks 7-Zip for the percentage it already knows.
     *
     * This used to be -bsp0, silenced along with the rest of the chatter, which
     * left unpacking as the one long step with nothing to show — minutes of a
     * spinner on a large archive, indistinguishable from a hang. -bso0 still
     * silences the per-file listing; only the progress line comes through.
     *
     * -y accepts overwrite prompts, which a detached process could never answer.
     */
    const child = spawn(
      bin,
      ["x", String(archivePath), `-o${String(destDir)}`, "-y", "-bso0", "-bsp1"],
      { windowsHide: true }
    );
    if (typeof onPercent === "function") {
      let last = -1;
      child.stdout?.on("data", (chunk) => {
        // 7-Zip redraws one line with carriage returns, so the last match in a
        // chunk is the current figure.
        const matches = String(chunk).match(/(\d{1,3})%/g);
        if (!matches?.length) return;
        const pct = Number(matches[matches.length - 1].replace("%", ""));
        if (!Number.isFinite(pct) || pct === last) return;
        last = pct;
        onPercent(Math.min(100, Math.max(0, pct)));
      });
    }
    let err = "";
    let stdoutErrors = "";
    child.stderr?.on("data", (d) => (err += d));
    child.stdout?.on("data", (d) => {
      const text = String(d);
      if (/error|fail|cannot|disk full|space|corrupt|damaged|break signaled/i.test(text)) {
        stdoutErrors += text;
      }
    });
    child.on("error", (spawnErr) =>
      reject(new Error(`7z extract failed to start (${spawnErr.code || spawnErr.message}).`))
    );
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        const errorDetail = (err || stdoutErrors).trim();
        reject(
          new Error(
            `7z extract failed (${code})${errorDetail ? `: ${errorDetail}` : ". Check free disk space or archive integrity."}`
          )
        );
      }
    });
  });
}

/**
 * GitHub zips often wrap the payload in one versioned folder. Promote that
 * folder so overlayDest (data/) and exeHint resolve next to the real files.
 */
async function unwrapSingleRootDirectory(dir) {
  let names;
  try {
    names = (await fsp.readdir(dir)).filter((n) => n !== "__MACOSX" && n !== ".DS_Store");
  } catch {
    return;
  }
  if (names.length !== 1) return;
  const only = path.join(dir, names[0]);
  let st;
  try {
    st = await fsp.stat(only);
  } catch {
    return;
  }
  if (!st.isDirectory()) return;
  const tmp = `${dir}.unwrap-tmp`;
  await fsp.rm(tmp, { recursive: true, force: true });
  await fsp.rename(only, tmp);
  const inner = await fsp.readdir(tmp);
  for (const name of inner) {
    await fsp.rename(path.join(tmp, name), path.join(dir, name));
  }
  await fsp.rm(tmp, { recursive: true, force: true });
}

/**
 * Extract an overlay archive, replacing each package it contains outright.
 *
 * Extracting straight over the destination merges versions: files the new
 * release still has get overwritten, but anything it dropped or renamed stays
 * behind. For a Luanti game that is not cosmetic — Luanti satisfies a mod's
 * `depends` by folder *name*, so a stale mod folder left from an older
 * VoxeLibre keeps satisfying the dependency while no longer defining what the
 * newer mods expect. That surfaces much later as a runtime nil, which is what
 * "attempt to index global 'mcl_gamemode'" was: a dependency present in name
 * only.
 *
 * So each top-level entry is staged, then swapped in whole. Only paths the
 * archive actually provides are touched — sibling packages the player
 * installed separately, in the same games/ or mods/ folder, are left alone.
 */
async function promoteStagingDir(stagingDir, gameDir, siblingEditionNames) {
  const backupDir = `${gameDir}.playbound-prev`;
  await fsp.rm(backupDir, { recursive: true, force: true });
  if (siblingEditionNames && siblingEditionNames.size && fs.existsSync(gameDir)) {
    const items = await fsp.readdir(gameDir, { withFileTypes: true });
    for (const item of items) {
      if (!item.isDirectory() || !siblingEditionNames.has(item.name.toLowerCase())) continue;
      const dest = path.join(stagingDir, item.name);
      if (!fs.existsSync(dest)) {
        await fsp.rename(path.join(gameDir, item.name), dest);
      }
    }
  }
  if (fs.existsSync(gameDir)) {
    await fsp.rename(gameDir, backupDir);
  }
  try {
    await fsp.rename(stagingDir, gameDir);
  } catch (err) {
    if (fs.existsSync(backupDir) && !fs.existsSync(gameDir)) {
      await fsp.rename(backupDir, gameDir);
    }
    throw err;
  }
  await fsp.rm(backupDir, { recursive: true, force: true }).catch(() => {});
}

async function unpackNestedArchives(destDir) {
  if (!destDir || !fs.existsSync(destDir)) return;
  try {
    const entries = fs.readdirSync(destDir);
    for (const name of entries) {
      if (/\b(?:bins?|engine|patch|update|configurator)\b.*\.(?:7z|zip)$/i.test(name)) {
        const full = path.join(destDir, name);
        try {
          if (fs.statSync(full).isFile()) {
            if (name.toLowerCase().endsWith(".7z") && sevenZipBinary()) {
              await extract7z(full, destDir);
            } else {
              await extractZip(full, destDir);
            }
          }
        } catch (e) {
          console.warn("[nested-archive] failed to unpack:", name, e?.message || e);
        }
      }
    }
  } catch {}
}

function repairUnixExtractedBinaries(destDir) {
  if (process.platform === "win32" || !destDir) return;
  for (const name of [
    "xonotic-linux64-sdl",
    "xonotic-linux64-gl",
    "openarena.x86_64",
    "openarena",
    "daemon",
    "daemon64",
  ]) {
    const found = findNamedPortableExe(destDir, name);
    if (found) ensureUnixExecutable(found);
  }
}

function findExecutable(dir, exeHint) {
  if (!dir || !fs.existsSync(dir)) return null;
  let candidates = [];
  /*
   * `wininst` is setuptools' bundled installer stub. A game that ships its own
   * Python carries several of them under Lib/site-packages, and they are plain
   * .exe files with no marker distinguishing them from a real binary — so for
   * Unknown Horizons the picker chose wininst-14.0-amd64.exe over the game.
   * Nothing anyone ships as an actual game is named this.
   */
  const skip = /unins|setup|install|crash|report|vcredist|dxsetup|wininst|savandt|sound commit/i;
  /*
   * Shipped alongside the game rather than being it: level editors, config
   * front-ends, benchmarks. Demoted rather than skipped, so a package whose
   * only executable is one of these still launches — the rank only decides
   * which wins when there is something else to prefer.
   */
  const tool = /editor|maker|config|settings|benchmark|dedicated|tweaker|configurator|savandt|sound attribute|sound commit/i;
  /*
   * EasyAntiCheat's bootstrap. A protected game ships this beside its real
   * binary and Steam is configured to run it: it brings up the EAC service and
   * then starts the game. Launching the binary directly gets the game's own
   * "you must run this through Steam" refusal, because from EAC's side the
   * launch is unprotected.
   *
   * Strikers Club is the case — start_protected_game.exe is 3.8MB next to a
   * 162MB UFG-Win64-Shipping.exe, so ranking by size picked the one that
   * cannot run. Ranked above ordinary executables rather than merely tied,
   * since wherever this file exists it is always the right entry point.
   */
  const eacBootstrap = /^start_protected_game\.exe$/i;

  const walk = (d, depth = 0, ignoreSkip = false) => {
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
      if (isUninstallerExe(name)) continue;
      // Installer stubs are never the game — leave them for maybeHandleInstallerPackage.
      if (/\.exe$/i.test(name) && isInstallerExe(name)) continue;
      if (stat.isDirectory()) {
        if (process.platform === "darwin" && name.endsWith(".app") && (ignoreSkip || !skip.test(name))) {
          candidates.push({ full, name, size: stat.size, rank: 300 });
          continue;
        }
        // Audio / sound asset subtrees never hold game executables.
        if (/^(?:sounds?|audio|music|voice|characters_voice)$/i.test(name) && /gamedata|assets|resources/i.test(d)) {
          continue;
        }
        walk(full, depth + 1, ignoreSkip);
        continue;
      }
      // Never pick binaries nested inside sound/texture asset folders.
      if (/[\\/](?:sounds?|audio|textures)[\\/]/i.test(full)) {
        continue;
      }
      const lower = name.toLowerCase();
      if (lower.endsWith(".jar") && (ignoreSkip || !skip.test(name))) {
        candidates.push({ full, name, size: stat.size, rank: 200 });
        continue;
      }
      if (process.platform === "win32") {
        if (lower.endsWith(".exe") && (ignoreSkip || !skip.test(name))) {
          candidates.push({
            full,
            name,
            size: stat.size,
            rank: eacBootstrap.test(name) ? 150 : tool.test(name) ? 60 : 100,
          });
        } else if (/\.(gb|gbc|gba|nes|sfc|smc|z64|n64|gen)$/i.test(lower) && (ignoreSkip || !skip.test(name))) {
          candidates.push({ full, name, size: stat.size, rank: 90 });
        } else if (/\.(bat|cmd)$/i.test(lower) && (ignoreSkip || !skip.test(name))) {
          /*
           * A batch launcher is the entry point for a game that has no exe of
           * its own — Python and Java titles bundle an interpreter and start
           * through a script. Unknown Horizons is the case: its directory holds
           * a bundled python.exe, an uninstaller the skip list already drops,
           * and run_uh.bat. With nothing else eligible this returned null and
           * the player was asked to find the executable by hand.
           *
           * Ranked below a real .exe on purpose. Where a game ships both, the
           * binary is the thing to launch and the script is usually a
           * convenience wrapper; this only wins when nothing better exists.
           * expectedExeBasenames has always accepted .bat, so the drive scan
           * and this picker disagreed about what counts as launchable.
           */
          candidates.push({ full, name, size: stat.size, rank: 80 });
        }
        continue;
      }
      // Unix: prefer files without archive extensions (launch binaries often have no extension).
      if (/\.(zip|dmg|txt|md|html|json|xml|png|jpg|jpeg|gif|ico|pak|dat|cfg|ini)$/i.test(lower)) {
        continue;
      }
      if (ignoreSkip || !skip.test(name)) {
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

  walk(dir, 0, false);
  if (candidates.length === 0) {
    walk(dir, 0, true);
  }

  if (candidates.length === 0) return null;

  /*
   * Merso multi-demo packs (old TMNT zip) ship Balacera / Bloody Paws /
   * Buccaneers beside the real game. Size-fallback preferred those demos
   * (~30MB) over TMNT_Rescue_Palooza.exe (~2MB). Drop them when anything else
   * is present so a wrong/missing OpenBOR hint cannot relaunch an ad demo.
   */
  const PACK_DEMO_EXE = /^(Balacera_brothers|bloody_paws_demo|buccaneers_demo)/i;
  const withoutPackDemos = candidates.filter((e) => !PACK_DEMO_EXE.test(e.name));
  if (withoutPackDemos.length > 0) candidates = withoutPackDemos;

  if (exeHint) {
    const parts = String(exeHint)
      .split("|")
      .map((p) => p.trim().replace(/\.exe$/i, ""))
      .filter((p) => Boolean(p) && !isUninstallerExe(p.endsWith(".exe") ? p : `${p}.exe`));
    if (parts.length > 0) {
      const pattern = parts
        .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("|");
      const hint = new RegExp(pattern, "i");
      const hinted = candidates.filter((e) => hint.test(e.name));
      if (hinted.length > 0) {
        return preferRunnableCandidate(hinted);
      }
    }
  }
  return preferRunnableCandidate(candidates);
}

/**
 * Best candidate that Windows can actually execute.
 *
 * Rank then size decides the order, and preferRunnableExecutable settles what
 * that order cannot: TES: Arena ships Bethesda's 16-bit `Arena106.exe` beside
 * the modern build, both plain .exe files, and the bigger DOS blob won — so
 * Play spawned an image CreateProcess refuses and reported a bare EACCES.
 * @param {{ full: string, rank: number, size: number }[]} entries
 * @returns {string}
 */
function preferRunnableCandidate(entries) {
  const sorted = [...entries].sort((a, b) => b.rank - a.rank || b.size - a.size);
  return preferRunnableExecutable(sorted.map((e) => e.full)) || sorted[0].full;
}

/**
 * Find an installer executable in an extracted folder (e.g. tdm_installer.exe, setup.exe).
 * Used when an archive contains only an installer stub rather than the installed game.
 */
function findInstallerInDir(dir, entry) {
  if (!dir || !fs.existsSync(dir)) return null;
  const queue = [{ d: dir, depth: 0 }];
  const candidates = [];
  while (queue.length) {
    const current = queue.shift();
    if (!current || current.depth > 3) continue;
    let entries;
    try {
      entries = fs.readdirSync(current.d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const full = path.join(current.d, ent.name);
      if (ent.isDirectory()) {
        queue.push({ d: full, depth: current.depth + 1 });
      } else if (ent.isFile() && /\.exe$/i.test(ent.name)) {
        if (isInstallerExe(ent.name)) {
          let size = 0;
          try {
            size = fs.statSync(full).size;
          } catch {
            /* ignore */
          }
          candidates.push({ full, name: ent.name, depth: current.depth, size });
        }
      }
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.depth - b.depth || b.size - a.size);
  return candidates[0].full;
}

/**
 * A few portable releases ship both a .jar and the vendor's native launcher.
 * Prefer the named native launcher when it is known to carry its own runtime
 * (YSoccer ships a bundled JRE beside ysoccer.exe), rather than asking the
 * player to install a separate Java runtime for a package that already has one.
 */
/** Zip extracts on Linux often drop the executable bit; repair before spawn. */
function ensureUnixExecutable(exePath) {
  if (process.platform === "win32" || !exePath) return exePath;
  try {
    const st = fs.statSync(exePath);
    if (!st.isFile()) return exePath;
    const mode = st.mode & 0o777;
    if ((mode & 0o111) === 0) {
      fs.chmodSync(exePath, mode | 0o755);
    }
  } catch {
    /* ignore */
  }
  return exePath;
}

function findNamedPortableExe(dir, expectedName) {
  const target = String(expectedName || "").toLowerCase();
  if (!dir || !target || !fs.existsSync(dir)) return null;
  const pending = [{ dir, depth: 0 }];
  while (pending.length) {
    const current = pending.shift();
    if (!current || current.depth > 4) continue;
    let entries = [];
    try {
      entries = fs.readdirSync(current.dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current.dir, entry.name);
      if (entry.isFile() && entry.name.toLowerCase() === target) return full;
      if (entry.isDirectory()) pending.push({ dir: full, depth: current.depth + 1 });
    }
  }
  return null;
}

/** PlayBound's online patch ships ysoccer-online.jar; the official portable exe ignores --connect. */
function findYSoccerOnlineJar(dir) {
  if (!dir || !fs.existsSync(dir)) return null;
  const named = findNamedPortableExe(dir, "ysoccer-online.jar");
  if (named) return named;
  return findExecutable(dir, "ysoccer-online");
}

function compatPrefixesRoot() {
  try {
    // Prefixes live beside the per-game WINEPREFIX folder (…/prefixes/{slug}).
    return path.dirname(getGamePrefixDirectory("_"));
  } catch {
    return "";
  }
}

function expandWinPath(p) {
  const gamesDir = (typeof loadSettings === "function" && loadSettings()?.gamesDir) || DEFAULT_GAMES_DIR || "C:\\Games";
  let out = String(p || "")
    .replace(/%GAMES%/gi, gamesDir)
    .replace(/%COMPAT_PREFIXES%/gi, compatPrefixesRoot())
    .replace(/%LOCALAPPDATA%/gi, process.env.LOCALAPPDATA || "")
    .replace(/%APPDATA%/gi, process.env.APPDATA || "")
    .replace(/%PROGRAMFILES%/gi, process.env.PROGRAMFILES || "")
    .replace(/%PROGRAMFILES\(X86\)%/gi, process.env["ProgramFiles(x86)"] || "")
    .replace(/%SYSTEMDRIVE%/gi, process.env.SYSTEMDRIVE || "C:")
    // Daybreak titles (DCUO) install under C:\Users\Public by default, so an
    // unexpanded %PUBLIC% would leave a path that can never match.
    .replace(/%PUBLIC%/gi, process.env.PUBLIC || "C:\\Users\\Public")
    .replace(/%USERPROFILE%/gi, process.env.USERPROFILE || process.env.HOME || "");
  if (process.platform === "darwin" || process.platform === "linux") {
    const home = app.getPath("home");
    out = out
      .replace(/^~(?=$|[\\/])/g, home)
      .replace(/%HOME%/gi, home);
  }
  if (process.platform === "darwin") {
    const home = app.getPath("home");
    const support = path.join(home, "Library", "Application Support");
    out = out
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

const controlProfileCache = new Map(); // `${slug}::${editionSlug || ""}` -> { at, profile }
const CONTROL_PROFILE_TTL_MS = 60 * 1000;

/**
 * Fetch a verified profile, or a testing profile only when preview was
 * explicitly requested. Never throws — a slow/failed fetch must not block
 * a game launch, so this degrades to "no PlayBound Controls this session"
 * exactly like a missing native controller config already does below.
 *
 * A failed fetch is deliberately NOT cached, unlike a successful "no
 * profile" result — a captive portal or a brief API blip now should not mean
 * PlayBound Controls stays off for the rest of the session once it clears.
 */
async function fetchControlProfile(slug, editionSlug, preview = false) {
  const key = `${slug}::${editionSlug || ""}::${preview ? "preview" : "verified"}`;
  const cached = controlProfileCache.get(key);
  if (cached && Date.now() - cached.at < CONTROL_PROFILE_TTL_MS) return cached.profile;

  try {
    const url = new URL(`${getApiBase()}/api/launcher/control-profile/${encodeURIComponent(slug)}`);
    if (editionSlug) url.searchParams.set("edition", editionSlug);
    if (preview) url.searchParams.set("preview", "1");
    const res = await apiFetch(url.toString(), {
      headers: launcherApiHeaders({ accept: "application/json" }),
    });
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    const profile = data && data.profile ? data.profile : null;
    controlProfileCache.set(key, { at: Date.now(), profile });
    return profile;
  } catch (err) {
    return null;
  }
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
  if (err?.code === "ASSET_NOT_FOUND" || /No .*asset for/i.test(msg)) return "ASSET_NOT_FOUND";
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

function httpStatusFromInstallError(err) {
  if (typeof err?.httpStatus === "number") return err.httpStatus;
  const m = /HTTP\s+(\d+)/i.exec(String(err?.message || err || ""));
  return m ? Number(m[1]) : undefined;
}

function normalizeProcessImageName(name) {
  let base = path.basename(String(name || ""));
  if (!base) return "";
  if (process.platform === "win32" && !/\.[A-Za-z0-9]+$/.test(base)) {
    base = `${base}.exe`;
  }
  return base;
}
function probeServerLatency(host, port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    if (!host) return resolve(null);
    const start = Date.now();
    let doneCalled = false;
    let sock = null;
    const done = (ok) => {
      if (doneCalled) return;
      doneCalled = true;
      try {
        sock?.destroy();
      } catch {
        /* ignore */
      }
      resolve(ok ? Math.max(1, Date.now() - start) : null);
    };

    try {
      sock = net.createConnection({
        host,
        port: Number(port) || 80,
        timeout: timeoutMs,
      });
      sock.on("connect", () => done(true));
      sock.on("timeout", () => done(false));
      sock.on("error", () => done(false));
    } catch {
      done(false);
    }
  });
}

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

async function launcherJson(path, { method = "GET", body } = {}) {
  /*
   * apiFetch, not fetch: thirty call sites route through here, including the
   * parties and play-together reads the home page waits on. A bare fetch has
   * no response deadline, so a stalled connection held the whole page — the
   * same failure apiFetch was written for on the game page.
   */
  const res = await apiFetch(`${getApiBase()}${path}`, {
    method,
    headers: launcherApiHeaders(body != null ? { "content-type": "application/json" } : {}),
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Some routes (e.g. party Discord voice) attach extra fields like
    // needsDiscordLink to an error response on purpose — callers rely on
    // those, so only the error message gets a fallback, not the whole body.
    return { ...data, error: data.error || `HTTP ${res.status}` };
  }
  return data;
}

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

/**
 * A stable per-install id for PlayBound Remote device identity — deliberately
 * separate from telemetry.js's `analyticsId`, which is explicitly anonymous
 * and not tied to an account. This one *is* tied to the account (it's how
 * "Ryan's Gaming PC" gets recognized as the same trusted device across
 * sessions), so the two must never be the same value or a privacy-scoped id
 * would leak into an account-scoped one.
 */
function getRemoteDeviceId() {
  const settings = loadSettings();
  const existing = String(settings.remoteDeviceId || "");
  if (existing.length >= 10) return existing;
  const id = crypto.randomUUID();
  saveSettings({ ...settings, remoteDeviceId: id });
  return id;
}

/** User-editable in Settings → Remote Play once that UI exists; falls back to the OS hostname. */
function getRemoteDeviceName() {
  const settings = loadSettings();
  return settings.remoteDeviceName || os.hostname() || "This PC";
}

module.exports = { loadHardwareModule, PROTOCOL, DEFAULT_GAMES_DIR, STATE_FILE, SETTINGS_FILE, CATALOG_CACHE_FILE, LIVE_STATS_CACHE_FILE, DEFAULT_API_BASE, UPDATER_FEED_URL, configureYoutubeEmbedIdentity, registerDownloadHostFromUrl, registerCatalogEntryHosts, isAllowedApiBase, assertDownloadUrl, assertOpenExternalUrl, loadSettings, saveSettings, gamesRoot, getApiBase, parseDeepLink, extractLinkHandoff, CATALOG_CACHE_VERSION, loadCachedCatalogFile, loadCachedCatalog, saveCatalogCache, INSTALLED_SLUG_ALIASES, migrateInstalledSlugAliases, safeOpenExternal, steamAppIdForEntry, normalizeFsPath, pathUnderRoot, rememberLocatedRoot, LIBRARY_BATCH_TIMEOUT_MS, LIBRARY_ITEM_SYNC_TIMEOUT_MS, formatLibrarySyncError, isSyncTimeoutError, syncLibraryItemsIndividually, postLibraryBatch, runLibrarySync, loadState, saveState, DEFAULT_EDITION_SLUG, ensureGameInstallRecord, listEditionEntries, findJarInDir, exeOnDisk, playableExePath, pickPrimaryEdition, syncGameInstallSummary, editionInstallDir, pullCompatibilityPreference, pushCompatibilityPreference, pushDiscoveryPreference, fetchLauncherEditions, catalogEntryFromEdition, resolveEditionForInstall, resolveMediaUrl, resolveEventMedia, launcherApiHeaders, API_TIMEOUT_MS, apiFetch, CATALOG_TTL_MS, hostArchAssetScore, hostOsAssetScore, sortAssetsForHost, pickGithubAsset, assetPatternsForEntry, itchNoDownloadsReason, resolveDownload, resolveModDownload, installQueue, saveData, zipDirectory, cloudSaves, verifyChecksumMd5, verifyChecksumSha256, reportInstall, extractZip, extractDmg, extractPkg, sevenZipBinary, getAvailableDiskSpace, extract7z, unwrapSingleRootDirectory, promoteStagingDir, unpackNestedArchives, repairUnixExtractedBinaries, findExecutable, preferRunnableCandidate, findInstallerInDir, ensureUnixExecutable, findNamedPortableExe, findYSoccerOnlineJar, compatPrefixesRoot, expandWinPath, stripRegQuotes, uninstallExeCache, controlProfileCache, CONTROL_PROFILE_TTL_MS, fetchControlProfile, listFixedDriveRoots, EXE_SCAN_SKIP_DIR, shouldSkipScanDir, writeJarLauncher, installErrorCode, httpStatusFromInstallError, normalizeProcessImageName, probeServerLatency, CATALOG_LIVE_STATS_TTL_MS, loadLiveStatsDiskCache, saveLiveStatsDiskCache, liveStatsDisk, fetchCatalogLiveStats, launcherJson, collectHardwareProfile, shouldSyncHardwareProfile, getRemoteDeviceId, getRemoteDeviceName };
