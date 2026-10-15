import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

export const LOG_READ_BYTES = 64 * 1024;
export const LOG_READ_LINES = 200;
const CREDENTIAL = /password|passwd|passphrase|rcon[_ -]?pass|token|gslt|secret|authorization|api[_ -]?key|private[_ -]?key|BEGIN .*KEY/i;

// Omit entire credential-bearing lines: quoted values and multi-word passwords
// cannot safely be scrubbed by replacing just the next whitespace-delimited word.
export function redactLogLine(line, secrets = []) {
  if (CREDENTIAL.test(line)) return "[credential-bearing line omitted]";
  let safe = line;
  for (const value of secrets) {
    if (typeof value === "string" && value.length >= 4) safe = safe.split(value).join("[redacted]");
  }
  return safe
    .replace(/\b[a-f0-9]{32,}\b/gi, "[redacted]")
    .replace(/[A-Za-z0-9+/=_-]{64,}/g, "[redacted]")
    .replace(/(?:https?|wss?):\/\/\S+/gi, "[URL omitted]")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");
}

/** Read a fixed-ID file only; no caller-controlled paths, offsets or sizes. */
export async function readManagedLog(directory, id, secrets = []) {
  if (!/^[a-f0-9]{24}$/i.test(id)) throw new Error("Invalid server");
  const missing = { available: false, lines: [], truncated: false };
  let file;
  try {
    const root = await fs.lstat(directory);
    if (!root.isDirectory() || root.isSymbolicLink()) throw new Error("Unsafe log directory");
    const filename = path.join(directory, `${id}.log`);
    const entry = await fs.lstat(filename);
    if (!entry.isFile() || entry.isSymbolicLink() || entry.nlink !== 1) throw new Error("Unsafe log file");
    file = await fs.open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
    const stat = await file.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.ino !== entry.ino || stat.dev !== entry.dev) throw new Error("Log file changed");
    const start = Math.max(0, stat.size - LOG_READ_BYTES);
    const buffer = Buffer.alloc(Math.min(stat.size, LOG_READ_BYTES));
    const { bytesRead } = await file.read(buffer, 0, buffer.length, start);
    let text = buffer.subarray(0, bytesRead).toString("utf8");
    // Drop both cut edges, so a partial credential label can never escape.
    if (start) text = text.includes("\n") ? text.slice(text.indexOf("\n") + 1) : "";
    text = text.includes("\n") ? text.slice(0, text.lastIndexOf("\n")) : "";
    const rows = text ? text.split("\n") : [];
    return { available: true, lines: rows.slice(-LOG_READ_LINES).map((line) => redactLogLine(line, secrets)), truncated: start > 0 || rows.length > LOG_READ_LINES };
  } catch (error) {
    if (error.code === "ENOENT") return missing;
    throw error;
  } finally { await file?.close(); }
}

/** Only values already held by the agent; never inspect private config files. */
export function logSecretValues(values) {
  return Object.entries(values || {}).filter(([key, value]) => CREDENTIAL.test(key) && typeof value === "string").map(([, value]) => value);
}
