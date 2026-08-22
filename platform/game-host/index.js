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
import path from "node:path";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { resolveRecipe, listInstalled, listGameHostStatus, missingDedicatedBinaryMessage, recipes } from "./recipes.js";
import { canEnsure, ensureGame, ensureMissingGames, listEnsureableSlugs } from "./ensureGame.js";
import { ET_SLUG, verifyEtLegacyReady } from "./etLegacyInstall.js";
import { collectMetrics } from "./metrics.js";
import { getLastSpawnTests, recordSpawnTest } from "./spawnTests.js";
import { getCachedGameVersions } from "./gameVersions.js";

const SECRET = process.env.GAME_HOST_SECRET || "";
const PUBLIC_IP = process.env.GAME_HOST_PUBLIC_IP || "";
const PORT = Number(process.env.GAME_HOST_PORT || 8741);
const MAX_ROOMS = Number(process.env.GAME_HOST_MAX_ROOMS || 8);
const IDLE_MS = Number(process.env.GAME_HOST_IDLE_MS || 4 * 60 * 60 * 1000);
const MIRROR_ARCHIVE_DIR = process.env.MIRROR_ARCHIVE_DIR || "/opt/playbound-host/archive";
const MIRROR_ARCHIVE_MAX_BYTES = Number(process.env.MIRROR_ARCHIVE_MAX_BYTES || 20 * 1024 * 1024 * 1024);
const GAMES_ROOT = process.env.GAME_HOST_GAMES_DIR || "/opt/playbound-host/games";

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
/** relative archive path → in-flight/completed transfer state for this agent lifetime. */
const archiveJobs = new Map();

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

function archivePath(relativePath) {
  const raw = String(relativePath || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!raw || raw.split("/").some((part) => !part || part === "." || part === "..")) return null;
  const root = path.resolve(MIRROR_ARCHIVE_DIR);
  const target = path.resolve(root, raw);
  return target.startsWith(`${root}${path.sep}`) ? target : null;
}

function archiveContentType(file) {
  const lower = file.toLowerCase();
  if (lower.endsWith(".zip")) return "application/zip";
  if (lower.endsWith(".7z")) return "application/x-7z-compressed";
  if (lower.endsWith(".exe")) return "application/vnd.microsoft.portable-executable";
  if (lower.endsWith(".msi")) return "application/x-msi";
  return "application/octet-stream";
}

/** Public download surface for archives that have already been written under
 * MIRROR_ARCHIVE_DIR. Management endpoints remain Bearer-authenticated below.
 * Byte ranges are essential for Electron download resume support. */
async function serveArchivedFile(req, res, encodedPath) {
  let relativePath;
  try {
    relativePath = decodeURIComponent(encodedPath);
  } catch {
    json(res, 400, { error: "Invalid archive path" });
    return;
  }
  const target = archivePath(relativePath);
  if (!target) {
    json(res, 404, { error: "Not found" });
    return;
  }
  let file;
  try {
    file = await stat(target);
  } catch {
    json(res, 404, { error: "Not found" });
    return;
  }
  if (!file.isFile()) {
    json(res, 404, { error: "Not found" });
    return;
  }

  const size = file.size;
  const range = req.headers.range;
  const headers = {
    "content-type": archiveContentType(target),
    "accept-ranges": "bytes",
    "cache-control": "public, max-age=31536000, immutable",
    "content-disposition": `attachment; filename="${path.basename(target).replace(/["\\]/g, "")}"`,
    "x-content-type-options": "nosniff",
  };
  if (!range) {
    res.writeHead(200, { ...headers, "content-length": size });
    if (req.method !== "HEAD") createReadStream(target).pipe(res);
    else res.end();
    return;
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) {
    res.writeHead(416, { "content-range": `bytes */${size}` });
    res.end();
    return;
  }
  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size) {
    res.writeHead(416, { "content-range": `bytes */${size}` });
    res.end();
    return;
  }
  res.writeHead(206, {
    ...headers,
    "content-length": end - start + 1,
    "content-range": `bytes ${start}-${end}/${size}`,
  });
  if (req.method !== "HEAD") createReadStream(target, { start, end }).pipe(res);
  else res.end();
}

async function sha256File(file) {
  const hash = crypto.createHash("sha256");
  const stream = Readable.toWeb((await import("node:fs")).createReadStream(file));
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    hash.update(value);
  }
  return hash.digest("hex");
}

async function archiveFromUrl({ url, relativePath, sha256, sizeBytes }, abortSignal = undefined) {
  const target = archivePath(relativePath);
  if (!target) return { error: "Invalid archive path" };
  let source;
  try {
    source = new URL(String(url || ""));
  } catch {
    return { error: "Invalid archive URL" };
  }
  if (source.protocol !== "https:") return { error: "Archive URL must use HTTPS" };
  if (!Number.isFinite(Number(sizeBytes)) || Number(sizeBytes) <= 0 || Number(sizeBytes) > MIRROR_ARCHIVE_MAX_BYTES) {
    return { error: "Archive size is invalid or exceeds the host limit" };
  }

  const temp = `${target}.partial-${crypto.randomBytes(6).toString("hex")}`;
  try {
    await mkdir(path.dirname(target), { recursive: true });
    const timeout = AbortSignal.timeout(60 * 60 * 1000);
    const signal = abortSignal ? AbortSignal.any([timeout, abortSignal]) : timeout;
    const maxAttempts = 3;
    let lastError = "Archive transfer terminated";

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        let received = 0;
        try {
          received = (await stat(temp)).size;
        } catch {
          /* First attempt, or a prior attempt did not create a partial file. */
        }
        const headers = received > 0 ? { Range: `bytes=${received}-` } : undefined;
        const res = await fetch(source, { signal, headers });
        if (!res.ok || !res.body) throw new Error(`Archive download failed (${res.status})`);
        const resuming = received > 0 && res.status === 206;
        // A source that ignores Range starts at zero. Replace the old partial
        // rather than appending a duplicate copy of the archive.
        if (received > 0 && !resuming) {
          await rm(temp, { force: true });
          received = 0;
        }
        const contentLength = Number(res.headers.get("content-length") || 0);
        if (contentLength && received + contentLength > MIRROR_ARCHIVE_MAX_BYTES) {
          throw new Error("Archive exceeds the host limit");
        }
        await pipeline(
          Readable.fromWeb(res.body),
          createWriteStream(temp, { flags: received > 0 ? "a" : "w" })
        );
        const file = await stat(temp);
        if (file.size !== Number(sizeBytes)) {
          throw new Error(`Archive size mismatch (expected ${sizeBytes}, got ${file.size})`);
        }
        if (sha256) {
          const actual = await sha256File(temp);
          if (actual.toLowerCase() !== String(sha256).toLowerCase()) {
            throw new Error("Archive checksum mismatch");
          }
        }
        await rename(temp, target);
        return { ok: true, sizeBytes: file.size };
      } catch (err) {
        lastError = err instanceof Error ? err.message : "Could not archive artifact";
        if (abortSignal?.aborted || attempt === maxAttempts) break;
      }
    }
    return { error: `${lastError} after ${maxAttempts} attempts` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not archive artifact" };
  } finally {
    await rm(temp, { force: true }).catch(() => {});
  }
}

async function archiveStatus(relativePath) {
  const target = archivePath(relativePath);
  if (!target) return { error: "Invalid archive path" };
  const job = archiveJobs.get(relativePath);
  if (job?.status === "uploading") return { status: "uploading" };
  if (job?.status === "failed") return { status: "missing", error: job.error || "Archive transfer failed" };
  try {
    const file = await stat(target);
    return { status: "verified", sizeBytes: file.size };
  } catch (err) {
    if (err?.code === "ENOENT") return { status: "missing" };
    return { error: err instanceof Error ? err.message : "Could not inspect archive" };
  }
}

async function queueArchive(input) {
  const target = archivePath(input?.relativePath);
  if (!target) return { error: "Invalid archive path" };
  const existing = await archiveStatus(input.relativePath);
  if (existing.error) return existing;
  if (existing.status === "verified") return existing;
  if (existing.status === "uploading") return existing;

  const controller = new AbortController();
  archiveJobs.set(input.relativePath, { status: "uploading", controller });
  void archiveFromUrl(input, controller.signal).then((result) => {
    archiveJobs.set(input.relativePath, result.error
      ? { status: "failed", error: result.error }
      : { status: "verified", sizeBytes: result.sizeBytes });
  });
  return { status: "uploading" };
}

async function deleteArchivedFile(relativePath) {
  const target = archivePath(relativePath);
  if (!target) return { error: "Invalid archive path" };
  try {
    archiveJobs.get(relativePath)?.controller?.abort();
    archiveJobs.delete(relativePath);
    await rm(target, { force: true });
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete archived file" };
  }
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

  let resolved = resolveRecipe(gameSlug);
  if (!resolved) return { error: `Game ${gameSlug} is not hostable` };

  if (gameSlug === ET_SLUG) {
    const gameDir = path.join(GAMES_ROOT, ET_SLUG);
    let check = await verifyEtLegacyReady(gameDir);
    if (!check.ok && canEnsure(ET_SLUG)) {
      console.log(`[ensure] repairing ${ET_SLUG} before startRoom (${check.missing.join(", ")})`);
      const ensured = await ensureGame(ET_SLUG);
      if (!ensured.ok) {
        return { error: ensured.error || missingDedicatedBinaryMessage(gameSlug, resolved.recipe) };
      }
      check = await verifyEtLegacyReady(gameDir);
    }
    if (!check.ok) {
      return {
        error: `Wolfenstein ET is not ready to host (missing ${check.missing.join(", ")})`,
      };
    }
  }

  if (!resolved.binary && canEnsure(gameSlug)) {
    console.log(`[ensure] auto-installing ${gameSlug} before startRoom`);
    const ensured = await ensureGame(gameSlug);
    if (!ensured.ok) {
      return {
        error:
          ensured.error ||
          missingDedicatedBinaryMessage(gameSlug, resolved.recipe),
      };
    }
    resolved = resolveRecipe(gameSlug);
  }
  const { recipe, binary } = resolved;
  if (!binary) {
    return { error: missingDedicatedBinaryMessage(gameSlug, recipe) };
  }

  const port = allocPort(recipe, gameSlug);
  if (!port) return { error: `No free ports for ${gameSlug}` };

  const ctx = {
    partyId,
    name: String(name || `PlayBound ${gameSlug}`).slice(0, 40),
    editionSlug: editionSlug || "",
  };

  if (recipe.prepareSpawn) {
    try {
      await recipe.prepareSpawn(port, ctx);
    } catch (err) {
      freePort(gameSlug, port);
      const message = err instanceof Error ? err.message : String(err);
      return { error: `Could not prepare ${gameSlug} server directory: ${message}` };
    }
  }

  const args = recipe.args(port, ctx);
  const child = spawn(binary, args, {
    cwd: path.dirname(binary),
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

  const startupLog = [];
  const pushLog = (buf) => {
    const line = String(buf).trim();
    if (line) startupLog.push(line.slice(0, 400));
    if (startupLog.length > 20) startupLog.shift();
  };

  child.stdout?.on("data", (buf) => {
    pushLog(buf);
    const line = String(buf).trim();
    if (line) console.log(`[${gameSlug}:${port}] ${line.slice(0, 200)}`);
  });
  child.stderr?.on("data", (buf) => {
    pushLog(buf);
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

  const graceMs = Number(recipe.startupGraceMs) || 800;
  let exitCode = null;
  const died = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), graceMs);
    child.once("exit", (code) => {
      exitCode = code;
      clearTimeout(timer);
      resolve(true);
    });
  });
  if (died) {
    stopRoom(room);
    const tail = startupLog.at(-1);
    const detail = tail ? `: ${tail}` : "";
    return {
      error: `${gameSlug} dedicated process exited immediately (code ${exitCode ?? "?"}${detail})`,
    };
  }

  return { room };
}

function testPartyId(gameSlug) {
  return `pb-admin-test-${gameSlug}`;
}

async function runTestSpawn(gameSlug) {
  const started = Date.now();
  const partyId = testPartyId(gameSlug);
  const existingId = byParty.get(partyId);
  if (existingId && rooms.has(existingId)) {
    stopRoom(rooms.get(existingId));
  }

  const resolved = resolveRecipe(gameSlug);
  if (!resolved) {
    const error = `Game ${gameSlug} is not hostable`;
    recordSpawnTest(gameSlug, { ok: false, error, durationMs: Date.now() - started });
    return { ok: false, error, durationMs: Date.now() - started };
  }
  if (!resolved.binary) {
    const error = missingDedicatedBinaryMessage(gameSlug, resolved.recipe);
    recordSpawnTest(gameSlug, { ok: false, error, durationMs: Date.now() - started });
    return { ok: false, error, durationMs: Date.now() - started };
  }

  const result = await startRoom({
    gameSlug,
    partyId,
    name: `PlayBound test ${gameSlug}`.slice(0, 40),
  });
  const durationMs = Date.now() - started;

  if (result.error) {
    recordSpawnTest(gameSlug, { ok: false, error: result.error, durationMs });
    return { ok: false, error: result.error, durationMs };
  }

  const port = result.room?.port ?? null;
  stopRoom(result.room);
  recordSpawnTest(gameSlug, { ok: true, durationMs, port });
  return { ok: true, durationMs, port };
}

async function runTestSpawnAll() {
  const slugs = Object.keys(recipes);
  const results = {};
  for (const slug of slugs) {
    const { binary } = resolveRecipe(slug);
    if (!binary) {
      results[slug] = {
        ok: false,
        skipped: true,
        error: "Binary not installed — skipped",
      };
      continue;
    }
    results[slug] = await runTestSpawn(slug);
  }
  return results;
}

function publicRoom(room) {
  return {
    roomId: room.roomId,
    partyId: room.partyId,
    gameSlug: room.gameSlug,
    name: room.name,
    host: room.host || PUBLIC_IP,
    port: room.port,
    createdAt: room.createdAt,
  };
}

const AGENT_GET_ROUTES = new Set(["/metrics", "/rooms"]);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);

  if (req.method === "GET" && url.pathname === "/health") {
    const { versions: gameVersions, cachedAt: gameVersionsCachedAt } = getCachedGameVersions();
    json(res, 200, {
      ok: true,
      publicIp: PUBLIC_IP || null,
      rooms: rooms.size,
      maxRooms: MAX_ROOMS,
      games: listInstalled(),
      gameStatus: listGameHostStatus(),
      lastSpawnTest: getLastSpawnTests(),
      gameVersions,
      gameVersionsCachedAt,
    });
    return;
  }

  // Public mirror downloads — not agent API routes like /metrics or /rooms.
  const normalizedPath = url.pathname.replace(/\/+$/, "") || "/";
  if (
    (req.method === "GET" || req.method === "HEAD") &&
    !url.pathname.startsWith("/mirror/") &&
    !AGENT_GET_ROUTES.has(normalizedPath)
  ) {
    await serveArchivedFile(req, res, url.pathname.replace(/^\/+/, ""));
    return;
  }

  if (!authorized(req)) {
    json(res, 401, { error: "Unauthorized" });
    return;
  }

  try {
    if (req.method === "GET" && url.pathname === "/metrics") {
      const metrics = await collectMetrics(PUBLIC_IP);
      json(res, 200, metrics);
      return;
    }

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

    // Admin spawn test — verifies dedicated binary starts and passes grace window.
    if (req.method === "POST" && url.pathname === "/test-spawn") {
      const body = await readBody(req);
      if (body.all) {
        const results = await runTestSpawnAll();
        json(res, 200, { ok: true, results, lastSpawnTest: getLastSpawnTests() });
        return;
      }
      const gameSlug = String(body.gameSlug || "").trim();
      if (!gameSlug) {
        json(res, 400, { error: "gameSlug or all:true is required" });
        return;
      }
      const result = await runTestSpawn(gameSlug);
      json(res, result.ok ? 200 : 409, {
        ...result,
        gameSlug,
        lastSpawnTest: getLastSpawnTests(),
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/ensure-missing") {
      const results = await ensureMissingGames();
      json(res, 200, {
        ok: Object.values(results).every((r) => r.ok),
        ensureable: listEnsureableSlugs(),
        games: listInstalled(),
        results,
      });
      return;
    }

    const ensureMatch = url.pathname.match(/^\/ensure\/([^/]+)$/);
    if (req.method === "POST" && ensureMatch) {
      const slug = decodeURIComponent(ensureMatch[1]);
      if (!canEnsure(slug)) {
        json(res, 400, { error: `No auto-install recipe for ${slug}` });
        return;
      }
      const result = await ensureGame(slug);
      json(res, result.ok ? 200 : 500, {
        ...result,
        games: listInstalled(),
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/mirror/archive") {
      const result = await queueArchive(await readBody(req));
      json(res, result.error ? 400 : result.status === "uploading" ? 202 : 200, result);
      return;
    }

    const archiveMatch = url.pathname.match(/^\/mirror\/archive\/(.+)$/);
    if (req.method === "GET" && archiveMatch) {
      const result = await archiveStatus(decodeURIComponent(archiveMatch[1]));
      json(res, result.error ? 400 : 200, result);
      return;
    }
    if (req.method === "DELETE" && archiveMatch) {
      const result = await deleteArchivedFile(decodeURIComponent(archiveMatch[1]));
      json(res, result.error ? 400 : 200, result);
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
