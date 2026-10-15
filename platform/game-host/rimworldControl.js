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

const queues = new Map();
export async function sendRimworldCommand(room, command) {
  if (typeof command !== "string" || !command.trim() || command.length > 200 || /[\r\n\x00-\x1f\x7f]/.test(command)) throw new Error("Send one console command at a time");
  if (command === "status") {
    const doc = rimworldSnapshot(room);
    if (!doc) throw new Error("RimWorld player status is unavailable or stale");
    return JSON.stringify(doc.players);
  }
  const previous = queues.get(room.roomId) || Promise.resolve();
  const next = previous.catch(() => {}).then(() => withLogLock(path.join(room.cwd, "playbound-console.log"), async () => {
    const log = path.join(room.cwd, "playbound-console.log");
    const offset = fs.statSync(log).size;
    const fifo = path.join(room.cwd, "playbound-console.fifo");
    if (!fs.lstatSync(fifo).isFIFO()) throw new Error("RimWorld console is unavailable");
    const fd = fs.openSync(fifo, fs.constants.O_WRONLY | fs.constants.O_NONBLOCK);
    try { fs.writeSync(fd, command.trim() + "\n"); } finally { fs.closeSync(fd); }
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
