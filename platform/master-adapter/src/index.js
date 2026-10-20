import http from "node:http";
import { GAMES, gameSource, pollGame } from "./poll.js";
import { sendJson } from "./jsonResponse.js";

const PORT = Number(process.env.PORT || 8787);
const ADAPTER_KEY = process.env.MASTER_ADAPTER_KEY || "";
const REFRESH_MS = Number(process.env.REFRESH_MS || 40_000);
/**
 * Polling is the adapter's biggest outbound cost: every cycle sends a query to the
 * master and then to each listed server, for every game, whether or not anyone is
 * looking. A game nobody has asked for lately is polled this slowly instead, and a
 * request for a stale entry refreshes it in the background (the next request sees
 * it fresh). Set IDLE_REFRESH_MS=0 to restore always-on polling.
 */
const ACTIVE_WINDOW_MS = Number(process.env.ACTIVE_WINDOW_MS || 10 * 60_000);
const IDLE_REFRESH_MS = Number(process.env.IDLE_REFRESH_MS ?? 15 * 60_000);

/**
 * @typedef {{
 *   servers: import('./types.js').GameServer[],
 *   updatedAt: string,
 *   error?: string,
 *   source: string,
 *   authenticated?: boolean,
 * }} CacheEntry
 */

/** @type {Map<string, CacheEntry>} */
const cache = new Map();
/** @type {Map<string, number>} */
const lastPollAt = new Map();
/** When each game's list was last asked for, to tell active games from idle ones. */
/** @type {Map<string, number>} */
const lastRequestedAt = new Map();
/** Polls actually run per game since start, reported by /health to measure savings. */
/** @type {Map<string, number>} */
const pollCounts = new Map();
/** In-flight authenticated polls keyed by slug (serialize concurrent CMS logins). */
/** @type {Map<string, Promise<CacheEntry>>} */
const livePollInflight = new Map();
const responseBytes = { sent: 0, withoutCompression: 0, requests: 0 };
function countResponse(sent, plain) {
  responseBytes.sent += sent;
  responseBytes.withoutCompression += plain;
  responseBytes.requests += 1;
}

const LIVE_AUTH_CACHE_MS = 45_000;

function authOk(req) {
  if (!ADAPTER_KEY) return true;
  const header = req.headers["x-playbound-adapter-key"];
  return header === ADAPTER_KEY;
}

function acceptsLiveCreds(kind) {
  return kind === "zerok" || kind === "zerod" || kind === "wesnoth";
}

/**
 * True when the list is only a lobby placeholder (not real games/battles).
 * @param {import('./types.js').GameServer[] | undefined | null} servers
 */
function isLobbyPointerList(servers) {
  if (!Array.isArray(servers) || servers.length === 0) return false;
  return servers.every((s) => typeof s?.id === "string" && /:lobby$/i.test(s.id));
}

/**
 * Decode lobby headers. Platform sends `b64:` + Base64 so passwords with
 * non-Latin-1 characters survive HTTP header encoding.
 * @param {string | string[] | undefined} value
 */
function decodeLobbyHeader(value) {
  const raw = String(Array.isArray(value) ? value[0] : value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("b64:")) {
    try {
      return Buffer.from(raw.slice(4), "base64").toString("utf8");
    } catch {
      return "";
    }
  }
  return raw;
}

/**
 * Lobby placeholder when CMS headers are absent (no env poll on the request path).
 * @param {{ kind?: string, slug: string }} game
 * @returns {import('./types.js').GameServer[]}
 */
function lobbyPointerFor(game) {
  if (game.kind === "zerod") {
    return [
      {
        id: "0ad:lobby",
        name: "0 A.D. Multiplayer Lobby",
        host: "lobby.wildfiregames.com",
        port: 5222,
        players: 0,
        maxPlayers: null,
        map: null,
        gameType: "0ad-lobby",
        location: null,
        protected: false,
      },
    ];
  }
  if (game.kind === "wesnoth") {
    return [
      {
        id: "wesnoth:lobby",
        name: "Battle for Wesnoth Multiplayer Lobby",
        host: "server.wesnoth.org",
        port: 15000,
        players: 0,
        maxPlayers: null,
        map: null,
        gameType: "wesnoth-lobby",
        location: null,
        protected: false,
      },
    ];
  }
  if (game.kind === "zerok") {
    return [
      {
        id: "zero-k:lobby",
        name: "Zero-K Lobby",
        host: "zero-k.info",
        port: 8200,
        players: 0,
        maxPlayers: null,
        map: null,
        gameType: "zero-k-lobby",
        location: null,
        protected: false,
      },
    ];
  }
  return [];
}

/**
 * Env fallbacks used by background refresh when CMS headers are absent.
 * @param {{ kind?: string }} game
 * @returns {{ username: string, password: string } | null}
 */
function envCredsFor(game) {
  if (game.kind === "zerod") {
    const username = String(process.env.ZEROAD_LOBBY_JID || "").trim();
    const password = String(process.env.ZEROAD_LOBBY_PASSWORD || "").trim();
    if (username && password) return { username, password };
    return null;
  }
  if (game.kind === "wesnoth") {
    const username = String(process.env.WESNOTH_LOBBY_USER || "").trim();
    const password = String(process.env.WESNOTH_LOBBY_PASS || "").trim();
    if (username && password) return { username, password };
    return null;
  }
  if (game.kind === "zerok") {
    const username = String(process.env.ZEROK_LOBBY_USER || "").trim();
    const password = String(process.env.ZEROK_LOBBY_PASS || "").trim();
    if (username && password) return { username, password };
    return null;
  }
  return null;
}

/**
 * Fresh authenticated list usable for live-cred requests (never lobby pointers).
 * @param {string} slug
 * @returns {CacheEntry | null}
 */
function freshAuthenticatedEntry(slug) {
  const entry = cache.get(slug);
  if (!entry || entry.error) return null;
  if (!Array.isArray(entry.servers) || entry.servers.length === 0) return null;
  if (isLobbyPointerList(entry.servers)) return null;
  const game = GAMES.find((g) => g.slug === slug);
  // Live CMS credentials must not reuse guest/background pointer caches.
  if (acceptsLiveCreds(game?.kind) && !entry.authenticated) return null;
  const parsed = Date.parse(entry.updatedAt || "");
  const age = Number.isFinite(parsed) ? Date.now() - parsed : Infinity;
  if (age > LIVE_AUTH_CACHE_MS) return null;
  return entry;
}

/**
 * @param {import('./poll.js').GameMasterConfig | { slug: string, kind?: string }} game
 * @param {{ username: string, password: string }} liveCreds
 */
async function pollLiveCached(game, liveCreds) {
  const slug = game.slug;
  if (game.kind === "zerod" || game.kind === "wesnoth" || game.kind === "zerok") {
    const hit = freshAuthenticatedEntry(slug);
    if (hit) return hit;
  }

  const existing = livePollInflight.get(slug);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const servers = await pollGame(game, liveCreds);
      const entry = {
        servers,
        updatedAt: new Date().toISOString(),
        source: gameSource(game),
        authenticated: !isLobbyPointerList(servers),
      };
      // Don't let an auth failure that returns only a pointer wipe a richer list.
      const prev = cache.get(slug);
      if (
        isLobbyPointerList(servers) &&
        Array.isArray(prev?.servers) &&
        prev.servers.length > 0 &&
        !isLobbyPointerList(prev.servers)
      ) {
        return {
          servers: prev.servers,
          updatedAt: prev.updatedAt,
          error: "authenticated poll returned lobby pointer; keeping previous battles",
          source: prev.source,
          authenticated: prev.authenticated,
        };
      }
      cache.set(slug, entry);
      return entry;
    } catch (err) {
      const prev = cache.get(slug);
      if (Array.isArray(prev?.servers) && prev.servers.length > 0 && !isLobbyPointerList(prev.servers)) {
        return {
          servers: prev.servers,
          updatedAt: prev.updatedAt,
          error: err instanceof Error ? err.message : String(err),
          source: prev.source,
          authenticated: prev.authenticated,
        };
      }
      return {
        servers: [],
        updatedAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
        source: gameSource(game),
        authenticated: false,
      };
    } finally {
      livePollInflight.delete(slug);
    }
  })();

  livePollInflight.set(slug, promise);
  return promise;
}

/**
 * @param {import('./poll.js').GameMasterConfig} game
 */
function refreshIntervalFor(game) {
  const base = Number(game.refreshMs) > 0 ? Number(game.refreshMs) : REFRESH_MS;
  if (!(IDLE_REFRESH_MS > 0)) return base;
  const asked = lastRequestedAt.get(game.slug) || 0;
  const active = Date.now() - asked < ACTIVE_WINDOW_MS;
  return active ? base : Math.max(base, IDLE_REFRESH_MS);
}

/** The cadence for a game that is being looked at right now. */
function activeIntervalFor(game) {
  return Number(game.refreshMs) > 0 ? Number(game.refreshMs) : REFRESH_MS;
}

/**
 * @param {import('./poll.js').GameMasterConfig | { slug: string, refreshMs?: number, kind?: string }} game
 * @param {boolean} [force]
 */
/** Games with a poll running, so overlapping triggers cannot send the queries twice. */
const refreshing = new Set();

async function refreshGame(game, force = false, demand = false) {
  if (refreshing.has(game.slug)) return;
  refreshing.add(game.slug);
  try {
    await refreshGameOnce(game, force, demand);
  } finally {
    refreshing.delete(game.slug);
  }
}

async function refreshGameOnce(game, force, demand) {
  const now = Date.now();
  const interval = demand ? activeIntervalFor(game) : refreshIntervalFor(game);
  const last = lastPollAt.get(game.slug) || 0;
  if (!force && now - last < interval - 500) return;

  const source = gameSource(game);
  const prev = cache.get(game.slug);
  const envCreds = acceptsLiveCreds(game.kind) ? envCredsFor(game) : null;

  // Without env lobby creds, background refresh would only produce pointers for
  // 0 A.D. / Wesnoth / Zero-K and stomp authenticated CMS-driven lists.
  if (acceptsLiveCreds(game.kind) && !envCreds) {
    if (prev?.authenticated && !isLobbyPointerList(prev.servers)) {
      lastPollAt.set(game.slug, Date.now());
      console.log(`[poll] ${game.slug}: skip unauthenticated refresh (keeping authenticated list)`);
      return;
    }
  }

  try {
    pollCounts.set(game.slug, (pollCounts.get(game.slug) || 0) + 1);
    const servers = await pollGame(game, envCreds);
    const authenticated = Boolean(envCreds) && !isLobbyPointerList(servers);

    if (servers.length === 0 && Array.isArray(prev?.servers) && prev.servers.length > 0) {
      cache.set(game.slug, {
        servers: prev.servers,
        updatedAt: prev.updatedAt || new Date().toISOString(),
        error: "poll returned empty; keeping previous list",
        source: prev.source || source,
        authenticated: prev.authenticated,
      });
      lastPollAt.set(game.slug, Date.now());
      console.warn(`[poll] ${game.slug}: empty poll — kept ${prev.servers.length} previous servers`);
      return;
    }

    // Never replace a real battle list with a lobby-only pointer from guest/env-less polls.
    if (
      isLobbyPointerList(servers) &&
      Array.isArray(prev?.servers) &&
      prev.servers.length > 0 &&
      !isLobbyPointerList(prev.servers)
    ) {
      lastPollAt.set(game.slug, Date.now());
      console.warn(
        `[poll] ${game.slug}: pointer-only poll — kept ${prev.servers.length} previous battle(s)`
      );
      return;
    }

    cache.set(game.slug, {
      servers,
      updatedAt: new Date().toISOString(),
      source,
      authenticated,
    });
    lastPollAt.set(game.slug, Date.now());
    console.log(`[poll] ${game.slug}: ${servers.length} servers${authenticated ? " (auth)" : ""}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[poll] ${game.slug} failed:`, message);
    cache.set(game.slug, {
      servers: prev?.servers ?? [],
      updatedAt: prev?.servers?.length ? prev.updatedAt || new Date().toISOString() : new Date().toISOString(),
      error: message,
      source: prev?.servers?.length ? prev.source || source : source,
      authenticated: prev?.authenticated,
    });
    lastPollAt.set(game.slug, Date.now());
  }
}

async function refreshAll(force = false) {
  for (const game of GAMES) {
    await refreshGame(game, force);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/health") {
    sendJson(req, res, 200, {
        ok: true,
        games: GAMES.map((g) => g.slug),
        cached: [...cache.keys()],
        responseBytes,
        polls: Object.fromEntries(pollCounts),
        pollPolicy: { activeWindowMs: ACTIVE_WINDOW_MS, idleRefreshMs: IDLE_REFRESH_MS, activeRefreshMs: REFRESH_MS },
      }, {}, countResponse);
    return;
  }

  const match = url.pathname.match(/^\/v1\/([a-z0-9-]+)\/servers\/?$/);
  if (match && req.method === "GET") {
    if (!authOk(req)) {
      sendJson(req, res, 401, { error: "Unauthorized" }, {}, countResponse);
      return;
    }
    const slug = match[1];
    const game = GAMES.find((g) => g.slug === slug);
    if (!game) {
      sendJson(req, res, 404, { error: "Unknown slug", servers: [] }, {}, countResponse);
      return;
    }
    lastRequestedAt.set(slug, Date.now());
    // Someone is looking at a list that was only being kept warm slowly: refresh it
    // in the background now and serve what we have.
    if (!acceptsLiveCreds(game.kind)) void refreshGame(game, false, true).catch(() => undefined);

    const lobbyUser = decodeLobbyHeader(req.headers["x-playbound-lobby-user"]);
    const lobbyPass = decodeLobbyHeader(req.headers["x-playbound-lobby-pass"]);
    const liveCreds =
      lobbyUser && lobbyPass && acceptsLiveCreds(game.kind)
        ? { username: lobbyUser, password: lobbyPass }
        : null;

    /** @type {CacheEntry} */
    let entry;
    if (liveCreds) {
      entry = await pollLiveCached(game, liveCreds);
    } else if (acceptsLiveCreds(game.kind)) {
      // CMS headers missing: never poll Render env on the request path.
      // A bad ZEROAD_LOBBY_* login must not become the JSON Vercel sees.
      const hit = freshAuthenticatedEntry(slug);
      entry = hit || {
        servers: lobbyPointerFor(game),
        updatedAt: new Date().toISOString(),
        source: gameSource(game),
        authenticated: false,
      };
    } else {
      entry = cache.get(slug);
      if (!entry) {
        try {
          const servers = await pollGame(game, null);
          entry = {
            servers,
            updatedAt: new Date().toISOString(),
            source: gameSource(game),
            authenticated: false,
          };
          cache.set(slug, entry);
        } catch (err) {
          entry = {
            servers: [],
            updatedAt: new Date().toISOString(),
            error: err instanceof Error ? err.message : String(err),
            source: gameSource(game),
            authenticated: false,
          };
        }
      }
    }
    sendJson(req, res, 200, entry, {
      "cache-control": liveCreds ? "private, no-store" : "public, max-age=15",
    }, countResponse);
    return;
  }

  sendJson(req, res, 404, { error: "Not found" }, {}, countResponse);
});

server.listen(PORT, () => {
  console.log(`playbound-master-adapter listening on :${PORT}`);
  console.log(`games: ${GAMES.map((g) => g.slug).join(", ")}`);
  refreshAll(true).finally(() => {
    setInterval(() => {
      refreshAll(false).catch((err) => console.error("[poll] loop", err));
    }, Math.min(REFRESH_MS, 15_000));
  });
});
