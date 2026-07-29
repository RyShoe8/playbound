import http from "node:http";
import { GAMES, gameSource, pollGame } from "./poll.js";

const PORT = Number(process.env.PORT || 8787);
const ADAPTER_KEY = process.env.MASTER_ADAPTER_KEY || "";
const REFRESH_MS = Number(process.env.REFRESH_MS || 40_000);

/** @type {Map<string, { servers: import('./types.js').GameServer[], updatedAt: string, error?: string, source: string }>} */
const cache = new Map();

function authOk(req) {
  if (!ADAPTER_KEY) return true;
  const header = req.headers["x-playbound-adapter-key"];
  return header === ADAPTER_KEY;
}

async function refreshAll() {
  for (const game of GAMES) {
    const source = gameSource(game);
    try {
      const servers = await pollGame(game);
      cache.set(game.slug, {
        servers,
        updatedAt: new Date().toISOString(),
        source,
      });
      console.log(`[poll] ${game.slug}: ${servers.length} servers`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[poll] ${game.slug} failed:`, message);
      const prev = cache.get(game.slug);
      cache.set(game.slug, {
        servers: prev?.servers ?? [],
        updatedAt: new Date().toISOString(),
        error: message,
        source,
      });
    }
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
      lobbyUser && lobbyPass && (game.kind === "zerok" || game.kind === "zerod")
        ? { username: lobbyUser, password: lobbyPass }
        : null;

    /** @type {{ servers: import('./types.js').GameServer[], updatedAt: string, error?: string, source: string }} */
    let entry;
    if (liveCreds) {
      try {
        const servers = await pollGame(game, liveCreds);
        entry = {
          servers,
          updatedAt: new Date().toISOString(),
          source: gameSource(game),
        };
        // Prefer authenticated snapshot in background cache when available
        cache.set(slug, entry);
      } catch (err) {
        entry = {
          servers: [],
          updatedAt: new Date().toISOString(),
          error: err instanceof Error ? err.message : String(err),
          source: gameSource(game),
        };
      }
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
  refreshAll().finally(() => {
    setInterval(() => {
      refreshAll().catch((err) => console.error("[poll] loop", err));
    }, REFRESH_MS);
  });
});
