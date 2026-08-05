import http from "node:http";
import { GAMES, gameSource, pollGame } from "./poll.js";

const PORT = Number(process.env.PORT || 8787);
const ADAPTER_KEY = process.env.MASTER_ADAPTER_KEY || "";
const REFRESH_MS = Number(process.env.REFRESH_MS || 40_000);

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
/** In-flight authenticated polls keyed by slug (serialize concurrent CMS logins). */
/** @type {Map<string, Promise<CacheEntry>>} */
const livePollInflight = new Map();

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
  return Number(game.refreshMs) > 0 ? Number(game.refreshMs) : REFRESH_MS;
}

/**
 * @param {import('./poll.js').GameMasterConfig | { slug: string, refreshMs?: number, kind?: string }} game
 * @param {boolean} [force]
 */
async function refreshGame(game, force = false) {
  const now = Date.now();
  const interval = refreshIntervalFor(game);
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
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        games: GAMES.map((g) => g.slug),
        cached: [...cache.keys()],
      })
    );
    return;
  }

  const match = url.pathname.match(/^\/v1\/([a-z0-9-]+)\/servers\/?$/);
  if (match && req.method === "GET") {
    if (!authOk(req)) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
    const slug = match[1];
    const game = GAMES.find((g) => g.slug === slug);
    if (!game) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Unknown slug", servers: [] }));
      return;
    }

    const lobbyUser = String(req.headers["x-playbound-lobby-user"] || "").trim();
    const lobbyPass = String(req.headers["x-playbound-lobby-pass"] || "").trim();
    const liveCreds =
      lobbyUser && lobbyPass && acceptsLiveCreds(game.kind)
        ? { username: lobbyUser, password: lobbyPass }
        : null;

    /** @type {CacheEntry} */
    let entry;
    if (liveCreds) {
      entry = await pollLiveCached(game, liveCreds);
    } else {
      entry = cache.get(slug);
      if (!entry) {
        try {
          const envCreds = acceptsLiveCreds(game.kind) ? envCredsFor(game) : null;
          const servers = await pollGame(game, envCreds);
          entry = {
            servers,
            updatedAt: new Date().toISOString(),
            source: gameSource(game),
            authenticated: Boolean(envCreds) && !isLobbyPointerList(servers),
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
    res.writeHead(200, {
      "content-type": "application/json",
      "cache-control": liveCreds ? "private, no-store" : "public, max-age=15",
    });
    res.end(JSON.stringify(entry));
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
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
