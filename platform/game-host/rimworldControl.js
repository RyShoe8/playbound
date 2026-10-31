import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { withLogLock } from "./managedLogs.js";

let browserCache = null;
let browserRequest = null;
async function loadRimworldBrowser(binary) {
  const { stdout } = await promisify(execFile)(binary, ["--playbound-browser-query"], { timeout: 18000, maxBuffer: 2 * 1024 * 1024 });
  const line = stdout.split(/\r?\n/).find(line => line.startsWith("PLAYBOUND_BROWSER="));
  if (!line) throw new Error("RimWorld browser did not return a listing");
  const rows = JSON.parse(line.slice("PLAYBOUND_BROWSER=".length));
  if (!Array.isArray(rows)) throw new Error("Invalid RimWorld browser listing");
  return rows;
}

export async function queryRimworldBrowser(binary) {
  if (browserCache && Date.now() - browserCache.at < 60000) {
    if (browserCache.error) throw new Error(browserCache.error);
    return browserCache.rows;
  }
  if (!browserRequest) browserRequest = loadRimworldBrowser(binary).then(rows => {
    browserCache = { at: Date.now(), rows }; return rows;
  }, error => {
    browserCache = { at: Date.now(), error: error.message }; throw error;
  }).finally(() => { browserRequest = null; });
  return browserRequest;
}

/** A FIFO held open by the server survives the agent's process replacement. */
export function spawnRimworld(binary, args, { cwd, env }) {
  const fifo = path.join(cwd, "playbound-console.fifo");
  if (!fs.existsSync(fifo)) execFileSync("mkfifo", ["-m", "600", fifo]);
  if (!fs.lstatSync(fifo).isFIFO()) throw new Error("RimWorld console path is not a FIFO");
  const input = fs.openSync(fifo, fs.constants.O_RDWR);
  const output = fs.openSync(path.join(cwd, "playbound-console.log"), "a", 0o600);
  try { return spawn(binary, args, { cwd, env, stdio: [input, output, output], detached: true }); }
  finally { fs.closeSync(input); fs.closeSync(output); }
}

/** Expired, malformed, or previous-process samples are unknown, never empty. */
export function rimworldSnapshot(room, now = Date.now()) {
  try {
    const doc = JSON.parse(fs.readFileSync(path.join(room.cwd, "playbound-status.json"), "utf8"));
    if (doc.pid !== room.pid || !Number.isFinite(doc.updatedAt) || now - doc.updatedAt > 10000 || doc.updatedAt > now + 2000 || !Array.isArray(doc.players) || !Number.isInteger(doc.maxPlayers) || doc.maxPlayers < 1) return null;
    if (doc.players.some(p => !p || typeof p.name !== "string" || (p.id !== null && typeof p.id !== "string"))) return null;
    return doc;
  } catch { return null; }
}

/*
 * An isolated server keeps its status file and console pipe in the private
 * data folder, which only its reserved UID can enter. The root relay reads the
 * one and writes the other for the process identity named here; the server's
 * output still lands in the agent-owned managed log, which is where replies
 * are read back.
 */
const PRIVATE_HELPER = "/usr/local/libexec/playbound-customer-rimworld-console";

export function privateRimworldAvailable(room) {
  return room?.gameSlug === "rimworld-together" && room.identityProfile === "rimworld-together-unix-v1"
    && /^[a-f0-9]{24}$/.test(room.communityServerId || "")
    && Number.isInteger(room.pid) && room.pid > 1
    && /^[a-f0-9-]{36}:[0-9]+$/.test(room.processIdentity || "");
}

export async function privateRimworld(room, action, command = null, spawnFile = execFile) {
  if (!privateRimworldAvailable(room) || !["status", "command"].includes(action)) throw new Error("Invalid private RimWorld room");
  const result = await new Promise((resolve, reject) => {
    const child = spawnFile("/usr/bin/sudo", ["-n", PRIVATE_HELPER, action,
      room.communityServerId, String(room.pid), room.processIdentity], {
      timeout: 6000, maxBuffer: 256 * 1024,
      env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8" },
    }, (error, stdout) => error ? reject(error) : resolve(stdout));
    child.stdin.end(action === "command" ? JSON.stringify({ command }) : "");
  });
  const value = JSON.parse(result);
  if (action === "status" && (!Array.isArray(value.players) || !Number.isInteger(value.maxPlayers))) throw new Error("Private RimWorld status was invalid");
  if (action === "command" && value.ok !== true) throw new Error("Private RimWorld command failed");
  return value;
}

const statusCache = new Map();
/** Occupancy for either kind of room; null when unknown, never an empty server. */
export async function rimworldOccupancy(room, now = Date.now(), spawnFile = execFile) {
  if (!privateRimworldAvailable(room)) return rimworldSnapshot(room, now);
  const cached = statusCache.get(room.roomId);
  if (cached && now - cached.at < 3000) return cached.doc;
  const doc = await privateRimworld(room, "status", null, spawnFile).catch(() => null);
  statusCache.set(room.roomId, { at: now, doc });
  return doc;
}

const queues = new Map();
export async function sendRimworldCommand(room, command, { logFile = null, spawnFile = execFile } = {}) {
  if (typeof command !== "string" || !command.trim() || command.length > 200 || /[\r\n\x00-\x1f\x7f]/.test(command)) throw new Error("Send one console command at a time");
  if (command === "status") {
    const doc = await rimworldOccupancy(room, Date.now(), spawnFile);
    if (!doc) throw new Error("RimWorld player status is unavailable or stale");
    return JSON.stringify(doc.players);
  }
  const isolated = privateRimworldAvailable(room);
  if (isolated && !logFile) throw new Error("RimWorld console is unavailable");
  const log = isolated ? logFile : path.join(room.cwd, "playbound-console.log");
  const previous = queues.get(room.roomId) || Promise.resolve();
  const next = previous.catch(() => {}).then(() => withLogLock(log, async () => {
    const offset = fs.statSync(log).size;
    if (isolated) {
      await privateRimworld(room, "command", command.trim(), spawnFile);
    } else {
      const fifo = path.join(room.cwd, "playbound-console.fifo");
      if (!fs.lstatSync(fifo).isFIFO()) throw new Error("RimWorld console is unavailable");
      const fd = fs.openSync(fifo, fs.constants.O_WRONLY | fs.constants.O_NONBLOCK);
      try { fs.writeSync(fd, command.trim() + "\n"); } finally { fs.closeSync(fd); }
    }
    let lastSize = offset;
    for (let i = 0; i < 20; i++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      const size = fs.statSync(log).size;
      if (size > offset && size === lastSize) {
        const buffer = Buffer.alloc(Math.min(size - offset, 32768));
        const file = fs.openSync(log, "r");
        try { fs.readSync(file, buffer, 0, buffer.length, offset); } finally { fs.closeSync(file); }
        return buffer.toString("utf8").replace(/\x1b\[[0-9;]*m/g, "").trim();
      }
      lastSize = size;
    }
    throw new Error("Command sent, but no response was confirmed; check the server log before retrying");
  }));
  queues.set(room.roomId, next);
  try { return await next; } finally { if (queues.get(room.roomId) === next) queues.delete(room.roomId); }
}
