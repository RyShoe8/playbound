import http from "node:http";
import { GAMES, gameSource, pollGame } from "./poll.js";

const PORT = Number(process.env.PORT || 8787);
const ADAPTER_KEY = process.env.MASTER_ADAPTER_KEY || "";
const REFRESH_MS = Number(process.env.REFRESH_MS || 40_000);

/** @type {Map<string, { servers: import('./types.js').GameServer[], updatedAt: string, error?: string, source: string }>} */
const cache = new Map();
/** @type {Map<string, number>} */
const lastPollAt = new Map();
/** In-flight authenticated polls keyed by slug (serialize concurrent CMS logins). */
/** @type {Map<string, Promise<{ servers: import('./types.js').GameServer[], updatedAt: string, error?: string, source: string }>>} */
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
 * @param {string} slug
 * @returns {{ servers: import('./types.js').GameServer[], updatedAt: string, error?: string, source: string } | null}
 */
function freshCachedEntry(slug) {
  const entry = cache.get(slug);
  if (!entry || entry.error) return null;
  if (!Array.isArray(entry.servers) || entry.servers.length === 0) return null;
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
  if (game.kind === "zerod" || game.kind === "wesnoth") {
    const hit = freshCachedEntry(slug);
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
      };
      cache.set(slug, entry);
      return entry;
    } catch (err) {
      return {
        servers: [],
        updatedAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
        source: gameSource(game),
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
  try {
    const servers = await pollGame(game);
    if (servers.length === 0 && Array.isArray(prev?.servers) && prev.servers.length > 0) {
      cache.set(game.slug, {
        servers: prev.servers,
        updatedAt: prev.updatedAt || new Date().toISOString(),
        error: "poll returned empty; keeping previous list",
        source: prev.source || source,
      });
      lastPollAt.set(game.slug, Date.now());
      console.warn(`[poll] ${game.slug}: empty poll — kept ${prev.servers.length} previous servers`);
      return;
    }
    cache.set(game.slug, {
      servers,
      updatedAt: new Date().toISOString(),
      source,
    });
    lastPollAt.set(game.slug, Date.now());
    console.log(`[poll] ${game.slug}: ${servers.length} servers`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[poll] ${game.slug} failed:`, message);
    cache.set(game.slug, {
      servers: prev?.servers ?? [],
      updatedAt: prev?.servers?.length ? prev.updatedAt || new Date().toISOString() : new Date().toISOString(),
      error: message,
      source: prev?.servers?.length ? prev.source || source : source,
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

    /** @type {{ servers: import('./types.js').GameServer[], updatedAt: string, error?: string, source: string }} */
    let entry;
    if (liveCreds) {
      entry = await pollLiveCached(game, liveCreds);
    } else {
      entry = cache.get(slug);
      if (!entry) {
        try {
          const servers = await pollGame(game);
          entry = {
            servers,
            updatedAt: new Date().toISOString(),
            source: gameSource(game),
          };
          cache.set(slug, entry);
        } catch (err) {
          entry = {
            servers: [],
            updatedAt: new Date().toISOString(),
            error: err instanceof Error ? err.message : String(err),
            source: gameSource(game),
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
