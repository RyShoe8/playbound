import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const LOG_READ_BYTES = 64 * 1024;
export const LOG_READ_LINES = 200;
export const LOG_RETAIN_BYTES = 8 * 1024 * 1024;
const locks = new Map();

export async function withLogLock(filename, work) {
  const previous = locks.get(filename) || Promise.resolve();
  const next = previous.catch(() => {}).then(work);
  locks.set(filename, next);
  try { return await next; }
  finally { if (locks.get(filename) === next) locks.delete(filename); }
}
const CREDENTIAL = /password|passwd|passphrase|rcon[_ -]?pass|token|gslt|secret|authorization|api[_ -]?key|private[_ -]?key|BEGIN .*KEY/i;

// Omit entire credential-bearing lines: quoted values and multi-word passwords
// cannot safely be scrubbed by replacing just the next whitespace-delimited word.
export function redactLogLine(line, secrets = []) {
  let safe = line
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");
  if (CREDENTIAL.test(safe)) return "[credential-bearing line omitted]";
  for (const value of secrets) {
    if (typeof value === "string" && value.length >= 4) safe = safe.split(value).join("[redacted]");
  }
  return safe
    .replace(/\b[a-f0-9]{32,}\b/gi, "[redacted]")
    .replace(/[A-Za-z0-9+/=_-]{64,}/g, "[redacted]")
    .replace(/(?:https?|wss?):\/\/\S+/gi, "[URL omitted]");
}

/** Read a fixed-ID file only; no caller-controlled paths, offsets or sizes. */
export async function readManagedLog(directory, id, secrets = []) {
  if (!/^[a-f0-9]{24}$/i.test(id)) throw new Error("Invalid server");
  return readCapturedLogFile(path.join(directory, `${id}.log`), secrets);
}

async function openLog(filename, flags) {
  const directory = path.dirname(filename);
  const root = await fs.lstat(directory);
  if (!root.isDirectory() || root.isSymbolicLink() || await fs.realpath(directory) !== path.resolve(directory)) throw new Error("Unsafe log directory");
  const entry = await fs.lstat(filename);
  if (!entry.isFile() || entry.isSymbolicLink() || entry.nlink !== 1) throw new Error("Unsafe log file");
  const file = await fs.open(filename, flags | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.ino !== entry.ino || stat.dev !== entry.dev) throw new Error("Log file changed");
    return { file, stat };
  } catch (error) { await file.close(); throw error; }
}

/** Internal fixed-source reader. Never expose a filename parameter over HTTP. */
export async function readCapturedLogFile(filename, secrets = [], previous = true) {
  const missing = { available: false, lines: [], truncated: false };
  let file;
  try {
    const opened = await openLog(filename, constants.O_RDONLY);
    file = opened.file;
    const stat = opened.stat;
    const start = Math.max(0, stat.size - LOG_READ_BYTES);
    const buffer = Buffer.alloc(Math.min(stat.size, LOG_READ_BYTES));
    const { bytesRead } = await file.read(buffer, 0, buffer.length, start);
    let text = buffer.subarray(0, bytesRead).toString("utf8");
    // Drop both cut edges, so a partial credential label can never escape.
    if (start) text = text.includes("\n") ? text.slice(text.indexOf("\n") + 1) : "";
    text = text.includes("\n") ? text.slice(0, text.lastIndexOf("\n")) : "";
    const rows = text ? text.split("\n") : [];
    if (stat.size === 0 && previous) {
      const prior = await readCapturedLogFile(`${filename}.previous`, secrets, false);
      if (prior.available) return { ...prior, truncated: true };
    }
    return { available: true, lines: rows.slice(-LOG_READ_LINES).map((line) => redactLogLine(line, secrets)), truncated: start > 0 || rows.length > LOG_READ_LINES };
  } catch (error) {
    if (error.code === "ENOENT") return missing;
    throw error;
  } finally { await file?.close(); }
}

/** Copy a bounded tail, then truncate the existing inode. O_APPEND writers keep
 * working across agent replacement. As with copytruncate, a concurrent write
 * between snapshot and truncate may be lost; this is a diagnostic log, not audit.
 * RimWorld console commands share the lock so replies cannot cross a rollover.
 */
export async function retainCapturedLog(filename) {
  return withLogLock(filename, async () => {
    let file, temporary;
    try {
      const opened = await openLog(filename, constants.O_RDWR);
      file = opened.file;
      if (opened.stat.size <= LOG_RETAIN_BYTES) return false;
      if (process.getuid && ((opened.stat.mode & 0o077) || opened.stat.uid !== process.getuid())) throw new Error("Log must remain private and service-owned");
      const tail = Buffer.alloc(LOG_READ_BYTES);
      const { bytesRead } = await file.read(tail, 0, tail.length, opened.stat.size - tail.length);
      // A retained tail starts mid-line, so discard its first partial line.
      const cut = tail.subarray(0, bytesRead).indexOf(10);
      const bytes = cut < 0 ? Buffer.alloc(0) : tail.subarray(cut + 1, bytesRead);
      temporary = `${filename}.${randomUUID()}.tmp`;
      await fs.writeFile(temporary, bytes, { mode: 0o600, flag: "wx" });
      await fs.rename(temporary, `${filename}.previous`);
      temporary = null;
      await file.truncate(0);
      return true;
    } catch (error) { if (error.code === "ENOENT") return false; throw error; }
    finally { await file?.close(); if (temporary) await fs.unlink(temporary).catch(() => {}); }
  });
}

export function managedLogFiles(directory, home, id) {
  if (!/^[a-f0-9]{24}$/i.test(id)) throw new Error("Invalid server");
  return [path.join(directory, `${id}.log`), ...["rimworld-together-servers", "rimworld-together-servers-rooms"].map((root) => path.join(home, root, `pb-${id}`, "playbound-console.log"))];
}

/** Low-frequency housekeeping for fixed managed log roots, including stopped IDs. */
export async function retainManagedLogs(directory, home) {
  let rotated = 0, failed = 0;
  const candidates = [];
  for (const [root, pattern, filename] of [
    [directory, /^[a-f0-9]{24}\.log$/i, null],
    [path.join(home, "rimworld-together-servers"), /^pb-[a-f0-9]{24}$/i, "playbound-console.log"],
    [path.join(home, "rimworld-together-servers-rooms"), /^pb-[a-f0-9]{24}$/i, "playbound-console.log"],
  ]) {
    try { for (const entry of await fs.readdir(root)) if (pattern.test(entry)) candidates.push(filename ? path.join(root, entry, filename) : path.join(root, entry)); }
    catch (error) { if (error.code !== "ENOENT") failed++; }
  }
  for (const filename of candidates) {
    try { if (await retainCapturedLog(filename)) rotated++; }
    catch { failed++; }
  }
  return { rotated, failed };
}

/** Only values already held by the agent; never inspect private config files. */
export function logSecretValues(values) {
  return Object.entries(values || {}).filter(([key, value]) => CREDENTIAL.test(key) && typeof value === "string").map(([, value]) => value);
}
