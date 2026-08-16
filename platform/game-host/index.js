/**
 * PlayBound game-host agent — run on the public VPS.
 *
 * Env (see /etc/playbound-game-host.env):
 *   GAME_HOST_SECRET     shared with Vercel
 *   GAME_HOST_PUBLIC_IP  this box's public IPv4
 *   GAME_HOST_PORT       HTTP listen (default 8741)
 *   GAME_HOST_MAX_ROOMS  concurrent rooms (default 8)
 *   GAME_HOST_GAMES_DIR  dedicated binaries (default /opt/playbound-host/games)
 *   GAME_HOST_IDLE_MS    auto-stop idle rooms (default 4h)
 */

import http from "node:http";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { resolveRecipe, listInstalled } from "./recipes.js";

const SECRET = process.env.GAME_HOST_SECRET || "";
const PUBLIC_IP = process.env.GAME_HOST_PUBLIC_IP || "";
const PORT = Number(process.env.GAME_HOST_PORT || 8741);
const MAX_ROOMS = Number(process.env.GAME_HOST_MAX_ROOMS || 8);
const IDLE_MS = Number(process.env.GAME_HOST_IDLE_MS || 4 * 60 * 60 * 1000);

if (!SECRET) {
  console.error("GAME_HOST_SECRET is required");
  process.exit(1);
}

/** @type {Map<string, Room>} */
const rooms = new Map();
/** partyId → roomId */
const byParty = new Map();
/** `${slug}:${port}` */
const usedPorts = new Set();

/**
 * @typedef {{
 *   roomId: string,
 *   partyId: string,
 *   gameSlug: string,
 *   name: string,
 *   host: string,
 *   port: number,
 *   pid: number | null,
 *   child: import("node:child_process").ChildProcess | null,
 *   createdAt: number,
 * }} Room
 */

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(data),
  });
  res.end(data);
}

function authorized(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || token.length !== SECRET.length) return false;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(SECRET));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > 64_000) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("invalid json"));
      }
    });
    req.on("error", reject);
  });
}

function allocPort(recipe, slug) {
  for (let port = recipe.portStart; port <= recipe.portEnd; port += 1) {
    const key = `${slug}:${port}`;
    if (!usedPorts.has(key)) {
      usedPorts.add(key);
      return port;
    }
  }
  return null;
}

function freePort(slug, port) {
  usedPorts.delete(`${slug}:${port}`);
}

function stopRoom(room) {
  if (!room) return;
  if (room.child && !room.child.killed) {
    try {
      room.child.kill("SIGTERM");
      setTimeout(() => {
        try {
          if (room.child && !room.child.killed) room.child.kill("SIGKILL");
        } catch {
          /* already gone */
        }
      }, 4000).unref();
    } catch {
      /* already gone */
    }
  }
  freePort(room.gameSlug, room.port);
  rooms.delete(room.roomId);
  if (byParty.get(room.partyId) === room.roomId) byParty.delete(room.partyId);
}

async function startRoom({ gameSlug, partyId, name, editionSlug }) {
  const existingId = byParty.get(partyId);
  if (existingId && rooms.has(existingId)) {
    return { room: rooms.get(existingId) };
  }

  if (rooms.size >= MAX_ROOMS) {
    return { error: `Host is at capacity (${MAX_ROOMS} rooms)` };
  }

  const resolved = resolveRecipe(gameSlug);
  if (!resolved) return { error: `Game ${gameSlug} is not hostable` };
  const { recipe, binary } = resolved;
  if (!binary) {
    return { error: `${gameSlug} is not installed on the host` };
  }

  const port = allocPort(recipe, gameSlug);
  if (!port) return { error: `No free ports for ${gameSlug}` };

  const ctx = {
    partyId,
    name: String(name || `PlayBound ${gameSlug}`).slice(0, 40),
    editionSlug: editionSlug || "",
  };
  const args = recipe.args(port, ctx);
  const child = spawn(binary, args, {
    cwd: process.env.GAME_HOST_GAMES_DIR || "/opt/playbound-host/games",
    env: { ...process.env, HOME: process.env.HOME || "/var/lib/playbound-host" },
    stdio: ["pipe", "pipe", "pipe"],
  });

  const roomId = `room_${crypto.randomBytes(8).toString("hex")}`;
  const room = {
    roomId,
    partyId,
    gameSlug,
    name: ctx.name,
    host: PUBLIC_IP,
    port,
    pid: child.pid || null,
    child,
    createdAt: Date.now(),
  };

  child.stdout?.on("data", (buf) => {
    const line = String(buf).trim();
    if (line) console.log(`[${gameSlug}:${port}] ${line.slice(0, 200)}`);
  });
  child.stderr?.on("data", (buf) => {
    const line = String(buf).trim();
    if (line) console.warn(`[${gameSlug}:${port}] ${line.slice(0, 200)}`);
  });
  child.on("exit", (code) => {
    console.log(`[${gameSlug}:${port}] exited ${code}`);
    if (rooms.get(roomId) === room) stopRoom(room);
  });

  if (recipe.stdin) {
    try {
      child.stdin?.write(recipe.stdin(port, ctx));
    } catch (err) {
      console.warn("stdin write failed", err);
    }
  }

  rooms.set(roomId, room);
  byParty.set(partyId, roomId);

  // Dedicated binaries that reject unknown flags exit immediately.
  const died = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 800);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
  if (died) {
    stopRoom(room);
    return { error: `${gameSlug} dedicated process exited immediately` };
  }

  return { room };
}

function publicRoom(room) {
  return {
    roomId: room.roomId,
    partyId: room.partyId,
    gameSlug: room.gameSlug,
    name: room.name,
    host: room.host || PUBLIC_IP,
    port: room.port,
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);

  if (req.method === "GET" && url.pathname === "/health") {
    json(res, 200, {
      ok: true,
      publicIp: PUBLIC_IP || null,
      rooms: rooms.size,
      maxRooms: MAX_ROOMS,
      games: listInstalled(),
    });
    return;
  }

  if (!authorized(req)) {
    json(res, 401, { error: "Unauthorized" });
    return;
  }

  try {
    if (req.method === "GET" && url.pathname === "/rooms") {
      json(res, 200, { rooms: [...rooms.values()].map(publicRoom) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/rooms") {
      const body = await readBody(req);
      const gameSlug = String(body.gameSlug || "").trim();
      const partyId = String(body.partyId || "").trim();
      if (!gameSlug || !partyId) {
        json(res, 400, { error: "gameSlug and partyId are required" });
        return;
      }
      const result = await startRoom({
        gameSlug,
        partyId,
        name: body.name,
        editionSlug: body.editionSlug,
      });
      if (result.error) {
        json(res, 409, { error: result.error });
        return;
      }
      json(res, 201, publicRoom(result.room));
      return;
    }

    const roomMatch = url.pathname.match(/^\/rooms\/([^/]+)$/);
    if (req.method === "DELETE" && roomMatch) {
      const room = rooms.get(decodeURIComponent(roomMatch[1]));
      if (!room) {
        json(res, 404, { error: "Room not found" });
        return;
      }
      stopRoom(room);
      json(res, 200, { ok: true });
      return;
    }

    json(res, 404, { error: "Not found" });
  } catch (err) {
    console.error(err);
    json(res, 500, { error: "Internal error" });
  }
});

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (now - room.createdAt > IDLE_MS) {
      console.log(`idle-stop ${room.roomId} ${room.gameSlug}:${room.port}`);
      stopRoom(room);
    }
  }
}, 60_000).unref();

server.listen(PORT, "0.0.0.0", () => {
  console.log(`PlayBound game-host listening on :${PORT} ip=${PUBLIC_IP || "unset"}`);
  console.log("installed:", listInstalled());
});
