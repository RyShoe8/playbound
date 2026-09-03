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
import https from "node:https";
import net from "node:net";
import dgram from "node:dgram";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import { createReadStream, createWriteStream } from "node:fs";
import { copyFile, mkdir, rename, rm, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { generateRconPassword, isRconAuthFailure, sendRcon } from "./rcon.js";
import { shouldRestartRoom, MAX_RESTARTS } from "./roomRestart.js";
import {
  resolveRecipe,
  listInstalled,
  listGameHostStatus,
  missingDedicatedBinaryMessage,
  acceptedSettingsFor,
  recipes,
} from "./recipes.js";
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

/** Resolves an itch.io game page to its direct pre-signed CDN download URL. */
async function resolveItchDownloadUrl(pageUrl) {
  try {
    const res = await fetch(pageUrl, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const uploadMatches = [...html.matchAll(/data-upload_id=["'](\d+)["']/g)].map((m) => m[1]);
    if (!uploadMatches.length) return null;
    const uploadId = uploadMatches[0];
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
    if (!postRes.ok) return null;
    const json = await postRes.json();
    return json.url || null;
  } catch {
    return null;
  }
}

/**
 * Streams a GET over node:https, following redirects manually.
 *
 * fetch()'s res.body is a WHATWG ReadableStream, and Readable.fromWeb() —
 * the standard way to pipe it into a Node write stream — has a serious
 * performance bug on Node 20: converting a large fetch body this way pegs a
 * CPU core in pure userspace (confirmed with strace -c: ~0 syscall time
 * while the process sits at 100%+ CPU) and collapses effective throughput to
 * tens of KB/s regardless of real link speed. A 2GB archive that curl pulled
 * at 20+ MB/s took over an hour and still timed out through fetch(). Talking
 * to https directly hands back a real Node Readable with no adapter in the
 * way, so backpressure and the write stream work the way they're supposed to.
 */
function httpsGetStream(targetUrl, { headers, signal, maxRedirects = 5 } = {}) {
  return new Promise((resolve, reject) => {
    const defaultHeaders = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "*/*",
      ...headers,
    };
    const attempt = (u, redirectsLeft) => {
      const req = https.get(u, { headers: defaultHeaders, signal }, (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          if (redirectsLeft <= 0) {
            reject(new Error("Too many redirects"));
            return;
          }
          attempt(new URL(res.headers.location, u), redirectsLeft - 1);
          return;
        }
        resolve({ statusCode: status, headers: res.headers, stream: res });
      });
      req.on("error", reject);
    };
    attempt(targetUrl, maxRedirects);
  });
}

async function archiveFromUrl({ url, relativePath, sha256, sizeBytes }, abortSignal = undefined) {
  const target = archivePath(relativePath);
  if (!target) return { error: "Invalid archive path" };
  let effectiveUrl = String(url || "").trim();
  if (/itch\.io/i.test(effectiveUrl)) {
    const resolved = await resolveItchDownloadUrl(effectiveUrl);
    if (resolved) effectiveUrl = resolved;
  }
  let source;
  try {
    source = new URL(effectiveUrl);
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
    /*
     * Some legacy catalog packages already live in this VPS archive under a
     * launcher-packages path. Archiving their artifact record used to fetch
     * mirror.playbound.club back through nginx and the public network, which
     * can 404/hairpin even though the source file is on this same disk.
     * HoloCure is one such package. Copy locally, but only after archivePath
     * applies the same traversal guard used for every target.
     */
    if (source.hostname.toLowerCase() === "mirror.playbound.club") {
      let sourceRelative = "";
      try {
        sourceRelative = decodeURIComponent(source.pathname).replace(/^\/+/, "");
      } catch {
        sourceRelative = "";
      }
      const localSource = archivePath(sourceRelative);
      if (localSource) {
        try {
          const sourceFile = await stat(localSource);
          if (sourceFile.isFile()) {
            if (path.resolve(localSource) !== path.resolve(target)) {
              await copyFile(localSource, temp);
            } else {
              const actual = sha256 ? await sha256File(localSource) : null;
              if (sourceFile.size !== Number(sizeBytes)) {
                return { error: `Archive size mismatch (expected ${sizeBytes}, got ${sourceFile.size})` };
              }
              if (sha256 && actual.toLowerCase() !== String(sha256).toLowerCase()) {
                return { error: "Archive checksum mismatch" };
              }
              return { ok: true, sizeBytes: sourceFile.size };
            }
            const copied = await stat(temp);
            if (copied.size !== Number(sizeBytes)) {
              return { error: `Archive size mismatch (expected ${sizeBytes}, got ${copied.size})` };
            }
            if (sha256) {
              const actual = await sha256File(temp);
              if (actual.toLowerCase() !== String(sha256).toLowerCase()) {
                return { error: "Archive checksum mismatch" };
              }
            }
            await rename(temp, target);
            return { ok: true, sizeBytes: copied.size };
          }
        } catch (err) {
          if (err?.code !== "ENOENT") throw err;
          // Not actually present locally; retain the normal HTTPS fallback.
        }
      }
    }
    /*
     * A flat 1-hour ceiling was too tight: a 2GB GoldenEye installer took
     * ~50 minutes on this VPS's real link and a bigger artifact (up to
     * MIRROR_ARCHIVE_MAX_BYTES, 20GB by default) would never finish in an
     * hour at that throughput. All 3 attempts share one deadline, so a slow
     * first attempt can burn through it before a retry gets a real chance.
     * Scale the budget to size against a conservative 1 MB/s floor, still
     * capped so a genuinely hung connection doesn't hold the job forever.
     */
    const MIN_THROUGHPUT_BYTES_PER_SEC = 1024 * 1024;
    const MIN_TIMEOUT_MS = 60 * 60 * 1000;
    const MAX_TIMEOUT_MS = 8 * 60 * 60 * 1000;
    const timeoutMs = Math.min(
      MAX_TIMEOUT_MS,
      Math.max(MIN_TIMEOUT_MS, (Number(sizeBytes) / MIN_THROUGHPUT_BYTES_PER_SEC) * 1000)
    );
    const timeout = AbortSignal.timeout(timeoutMs);
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
        const { statusCode, headers: resHeaders, stream } = await httpsGetStream(source, { signal, headers });
        if (statusCode < 200 || statusCode >= 300) {
          stream.resume();
          throw new Error(`Archive download failed (${statusCode})`);
        }
        const resuming = received > 0 && statusCode === 206;
        // A source that ignores Range starts at zero. Replace the old partial
        // rather than appending a duplicate copy of the archive.
        if (received > 0 && !resuming) {
          await rm(temp, { force: true });
          received = 0;
        }
        const contentLength = Number(resHeaders["content-length"] || 0);
        if (contentLength && received + contentLength > MIRROR_ARCHIVE_MAX_BYTES) {
          throw new Error("Archive exceeds the host limit");
        }
        await pipeline(stream, createWriteStream(temp, { flags: received > 0 ? "a" : "w" }));
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
  if (existing.error) {
    // A failed transfer is retryable. Keeping the failed in-memory job made
    // every later Archive click replay the old 403 forever without issuing a
    // new request, even after its source URL was corrected.
    archiveJobs.delete(input.relativePath);
  }
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

function probeTcpPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen(port, "0.0.0.0", () => {
      server.close(() => resolve(true));
    });
  });
}

function probeUdpPort(port) {
  return new Promise((resolve) => {
    const sock = dgram.createSocket("udp4");
    sock.unref();
    sock.once("error", () => {
      try {
        sock.close();
      } catch {
        /* ignore */
      }
      resolve(false);
    });
    sock.bind(port, "0.0.0.0", () => {
      sock.close(() => resolve(true));
    });
  });
}

/** True when the OS will let us bind this port for the recipe's protocol. */
async function isOsPortFree(port, protocol) {
  const needTcp = protocol === "tcp" || protocol === "both" || !protocol;
  const needUdp = protocol === "udp" || protocol === "both";
  if (needTcp && !(await probeTcpPort(port))) return false;
  if (needUdp && !(await probeUdpPort(port))) return false;
  return true;
}

/** Wait until the spawned game server has actually claimed its listen port. */
async function waitForServerPort(port, protocol, child, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) return false;
    if (!(await isOsPortFree(port, protocol))) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

async function allocPort(recipe, slug) {
  for (let port = recipe.portStart; port <= recipe.portEnd; port += 1) {
    const key = `${slug}:${port}`;
    if (usedPorts.has(key)) continue;
    if (!(await isOsPortFree(port, recipe.protocol))) continue;
    usedPorts.add(key);
    return port;
  }
  return null;
}

function freePort(slug, port) {
  usedPorts.delete(`${slug}:${port}`);
}

function stopRoom(room) {
  if (!room) return;
  const pid = room.child?.pid || room.pid;
  if (pid) {
    try {
      // Send SIGTERM first to process group
      process.kill(-pid, "SIGTERM");
    } catch {
      try {
        room.child?.kill("SIGTERM");
      } catch {
        /* already dead */
      }
    }
    try {
      // Also send direct SIGTERM to child
      room.child?.kill("SIGTERM");
    } catch {
      /* already dead */
    }

    // Force SIGKILL after 500ms to guarantee no zombie/hung threads consume CPU
    setTimeout(() => {
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        try {
          room.child?.kill("SIGKILL");
        } catch {
          /* already dead */
        }
      }
    }, 500).unref();
  }
  freePort(room.gameSlug, room.port);
  rooms.delete(room.roomId);
  if (byParty.get(room.partyId) === room.roomId) byParty.delete(room.partyId);
}

async function startRoom({ gameSlug, partyId, name, editionSlug, mod, settings }) {
  const existingId = byParty.get(partyId);
  if (existingId && rooms.has(existingId)) {
    return { room: rooms.get(existingId) };
  }

  if (rooms.size >= MAX_ROOMS) {
    return { error: `Host is at capacity (${MAX_ROOMS} rooms)` };
  }

  const roomCtx = { editionSlug, mod, partyId, name, settings };
  let resolved = resolveRecipe(gameSlug, roomCtx);
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
          missingDedicatedBinaryMessage(gameSlug, resolved.recipe, roomCtx),
      };
    }
    resolved = resolveRecipe(gameSlug, roomCtx);
  }
  const { recipe, binary } = resolved;
  if (!binary) {
    return { error: missingDedicatedBinaryMessage(gameSlug, recipe, roomCtx) };
  }

  let serverName = String(name || "PlayBound.club Party").trim();
  const existingNames = new Set(
    Array.from(rooms.values())
      .filter((r) => r.gameSlug === gameSlug)
      .map((r) => r.name)
  );
  if (existingNames.has(serverName)) {
    let i = 2;
    while (existingNames.has(`${serverName} #${i}`)) i++;
    serverName = `${serverName} #${i}`;
  }
  serverName = serverName.slice(0, 40);

  const ctx = {
    partyId,
    name: serverName,
    editionSlug: editionSlug || "",
    // Explicit override for games where edition alone can't say which mod to
    // run — OpenRA's "official" edition is one client covering ra/cnc/d2k.
    mod: mod || "",
    settings: settings && typeof settings === "object" ? settings : {},
    /*
     * Generated here and kept here. The platform can ask this agent to run a
     * command on a room it owns, but never learns the password, so it cannot
     * administer a game server directly and a leaked platform token does not
     * become console access.
     */
    rconPassword: recipe.rcon ? generateRconPassword() : null,
  };

  // A port can be occupied by something outside our own bookkeeping (a stale
  // process from a prior crash, a distro service squatting on the game's
  // default port, …) that prepareSpawn's best-effort cleanup can't always
  // clear — e.g. a root-owned systemd unit this agent's unprivileged user
  // can't signal. Rather than surface that as a hard failure on the very
  // first port, retry across a few ports in the recipe's range.
  const maxAttempts = Math.min(5, recipe.portEnd - recipe.portStart + 1);
  let lastError = `No free ports for ${gameSlug}`;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const port = await allocPort(recipe, gameSlug);
    if (!port) return { error: lastError };

    if (recipe.prepareSpawn) {
      try {
        await recipe.prepareSpawn(port, ctx);
      } catch (err) {
        freePort(gameSlug, port);
        const message = err instanceof Error ? err.message : String(err);
        lastError = `Could not prepare ${gameSlug} server directory: ${message}`;
        continue;
      }
    }

    const args = recipe.args(port, ctx, binary);
    const hostHome = process.env.HOME || "/var/lib/playbound-host";
    const spawnEnv = {
      ...process.env,
      HOME: hostHome,
      ...(typeof recipe.spawnEnv === "function" ? recipe.spawnEnv(port, ctx) : {}),
    };
    const cwd =
      typeof recipe.cwd === "function"
        ? recipe.cwd(port, ctx)
        : recipe.cwd || path.dirname(binary);
    const child = spawn(binary, args, {
      cwd,
      env: spawnEnv,
      stdio: ["pipe", "pipe", "pipe"],
      detached: true,
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
      // When the current process started, which is what the restart decision
      // measures. Not createdAt: a restarted room keeps its original identity.
      processStartedAt: Date.now(),
      restarts: 0,
      /*
       * What this room was actually started with, so PlayBound can show the
       * running values rather than what our database believes it asked for.
       * Only the keys the recipe accepted — see settingsForRecipe.
       */
      settings: acceptedSettingsFor(gameSlug, ctx.settings),
      rcon: recipe.rcon || null,
      rconPassword: ctx.rconPassword,
    };

    const startupLog = [];
    const pushLog = (buf) => {
      for (const line of String(buf).split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed) startupLog.push(trimmed.slice(0, 400));
        if (startupLog.length > 20) startupLog.shift();
      }
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
    /*
     * Several dedicated servers end their process when a match ends — OpenRA's
     * own launch script wraps it in `while true` for exactly that reason. This
     * agent started it once, so the end of a game was indistinguishable from
     * the server dying: everyone booted mid-session, room gone, party wound
     * back to forming with nothing to rejoin.
     *
     * A finished match comes back. A binary that cannot run does not — see
     * shouldRestartRoom, which draws that line on how long the process lived.
     */
    const attachExitHandler = (proc) => {
      proc.on("exit", (code) => {
        console.log(`[${gameSlug}:${port}] exited ${code}`);
        // A deliberate stop removes the room first, so this is the check for it.
        if (rooms.get(roomId) !== room) return;

        const decision = shouldRestartRoom({
          restarts: room.restarts || 0,
          uptimeMs: Date.now() - (room.processStartedAt || room.createdAt || Date.now()),
        });
        if (!decision.restart) {
          console.log(`[${gameSlug}:${port}] not restarting — ${decision.reason}`);
          stopRoom(room);
          return;
        }

        room.restarts = (room.restarts || 0) + 1;
        console.log(
          `[${gameSlug}:${port}] restarting (${room.restarts}/${MAX_RESTARTS}) — ${decision.reason}`
        );
        try {
          const next = spawn(binary, args, { cwd, env: spawnEnv, stdio: ["pipe", "pipe", "pipe"], detached: true });
          room.child = next;
          room.pid = next.pid || null;
          room.processStartedAt = Date.now();
          next.stdout?.on("data", pushLog);
          next.stderr?.on("data", pushLog);
          attachExitHandler(next);
          if (recipe.stdin) {
            try {
              next.stdin?.write(recipe.stdin(port, ctx));
            } catch (err) {
              console.warn("stdin write failed on restart", err);
            }
          }
        } catch (err) {
          console.warn(`[${gameSlug}:${port}] restart failed:`, err?.message || err);
          stopRoom(room);
        }
      });
    };
    attachExitHandler(child);

    if (recipe.stdin) {
      try {
        child.stdin?.write(recipe.stdin(port, ctx));
      } catch (err) {
        console.warn("stdin write failed", err);
      }
    }

    rooms.set(roomId, room);
    byParty.set(partyId, roomId);

    const readyTimeoutMs = Number(recipe.startupReadyTimeoutMs) || 10_000;
    const portReady = await waitForServerPort(port, recipe.protocol, child, readyTimeoutMs);
    if (!portReady) {
      stopRoom(room);
      const tail = startupLog.slice(-3).join(" | ");
      const detail = tail ? `: ${tail}` : "";
      const exitDetail = child.exitCode !== null ? ` (code ${child.exitCode})` : "";
      lastError = `${gameSlug} dedicated server did not bind port ${port} within ${readyTimeoutMs}ms${exitDetail}${detail}`;
      console.warn(`[${gameSlug}:${port}] ${lastError} — trying another port`);
      continue;
    }

    // Some servers bind before their map/world finishes loading. Preserve a
    // recipe's extra stabilization window after the authoritative port bind.
    const graceMs = Number(recipe.startupGraceMs) || 0;
    if (graceMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, graceMs));
      if (child.exitCode !== null || child.signalCode !== null) {
        stopRoom(room);
        const tail = startupLog.slice(-3).join(" | ");
        const detail = tail ? `: ${tail}` : "";
        lastError = `${gameSlug} dedicated process exited during startup stabilization${detail}`;
        continue;
      }
    }

    return { room };
  }

  return { error: lastError };
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
  const childPid = result.room?.child?.pid;
  stopRoom(result.room);

  // Wait for the SIGKILL inside stopRoom to land (500ms timer + margin)
  await new Promise((resolve) => setTimeout(resolve, 600));

  // Double-tap: force-kill process group and direct child in case anything survived
  if (childPid) {
    try { process.kill(-childPid, "SIGKILL"); } catch { /* already dead */ }
    try { result.room.child.kill("SIGKILL"); } catch { /* already dead */ }
  }

  // Last resort: fuser -k to ensure the port is freed and no orphan holds it
  if (port) {
    const { execFile: execFileCb } = await import("node:child_process");
    try {
      execFileCb("fuser", ["-k", `${port}/tcp`, `${port}/udp`], () => {});
    } catch { /* fuser not available or port already free */ }
  }

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
    settings: room.settings || {},
    // Whether this room can take live commands — not the password that does it.
    rcon: room.rcon || null,
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
        mod: body.mod,
        /*
         * Host-chosen server settings, declared and already validated against
         * the game's schema by platform/src/lib/serverControl. The recipe
         * still picks only the keys it knows, because this agent is reachable
         * with the shared secret and must not trust a body to be well-formed.
         */
        settings: body.settings,
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

    /*
     * Run one command on a room's game server.
     *
     * The caller names a room, not a host, a port or a password — those are
     * ours. Commands themselves are composed by the platform from declared
     * settings (see src/lib/serverControl/rcon.ts); this endpoint is the
     * transport and deliberately does not try to be a second validator of
     * something it cannot interpret.
     */
    const rconMatch = url.pathname.match(/^\/rooms\/([^/]+)\/rcon$/);
    if (req.method === "POST" && rconMatch) {
      const room = rooms.get(rconMatch[1]);
      if (!room) {
        json(res, 404, { error: "No such room" });
        return;
      }
      if (!room.rcon || !room.rconPassword) {
        json(res, 409, { error: `${room.gameSlug} rooms do not take live commands` });
        return;
      }
      const body = await readBody(req);
      const command = String(body.command || "").trim();
      if (!command) {
        json(res, 400, { error: "command is required" });
        return;
      }
      try {
        const response = await sendRcon({
          port: room.port,
          password: room.rconPassword,
          command,
        });
        if (isRconAuthFailure(response)) {
          // A wrong password answers with an ordinary print, so a caller
          // checking only for a thrown error would record this as success.
          console.warn(`[rcon] ${room.gameSlug}:${room.port} rejected our password`);
          json(res, 502, { error: "The game server rejected the control password" });
          return;
        }
        json(res, 200, { ok: true, response });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[rcon] ${room.gameSlug}:${room.port} ${command.split(" ")[0]}: ${message}`);
        json(res, 502, { error: message });
      }
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
