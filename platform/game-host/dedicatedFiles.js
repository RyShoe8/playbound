import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { worldDataDirectory } from "./dedicatedDataBackups.js";

export const MAX_FILE_BYTES = 3 * 1024 ** 2;
const DATA_EXTENSIONS = new Set([".json", ".xml", ".txt", ".cfg", ".ini", ".sav", ".msav", ".wld", ".twld", ".db", ".sqlite", ".sqlite3", ".dat", ".bin", ".gz", ".zip", ".png", ".bmp", ".map", ".fwl"]);
const TEXT_EXTENSIONS = new Set([".json", ".xml", ".txt", ".cfg", ".ini"]);
const HISTORY = ".playbound-file-history";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const forbidden = name => name.startsWith(".") || /^(?:mods|plugins|scripts|bin)$/i.test(name) || /(?:secret|credential|password|token|gslt|rcon|private.?key)/i.test(name);

function ensureSpace(root, extraBytes, enforceQuota = false) {
  const stats = fs.statfsSync(root);
  const free = stats.bavail * stats.bsize, total = stats.blocks * stats.bsize;
  if (!Number.isFinite(free) || free - extraBytes < Math.max(2 * 1024 ** 3, total * 0.1)) throw new Error("Insufficient disk space. The host keeps at least 2 GB and 10% free.");
  if (!enforceQuota) return;
  let bytes = 0, count = 0;
  function walk(folder, depth) {
    if (depth > 32) throw new Error("Saved-data folder is too deeply nested");
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      if (++count > 50_000) throw new Error("Saved-data folder has too many entries");
      const file = path.join(folder, entry.name), stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) walk(file, depth + 1);
      else if (stat.isFile()) bytes += stat.size;
      if (bytes + extraBytes > 5 * 1024 ** 3) throw new Error("Browser file management is limited to 5 GB of saved data and history per server");
    }
  }
  walk(root, 0);
}

function partsFor(relative = "") {
  if (typeof relative !== "string" || relative.length > 500 || /[\\:%\x00-\x1f\x7f]/.test(relative) || relative.startsWith("/")) throw new Error("Invalid file path");
  const parts = relative ? relative.split("/") : [];
  if (parts.some(part => !part || part === "." || part === ".." || part.length > 120 || forbidden(part))) throw new Error("Invalid file path");
  return parts;
}
function checkedPath(root, parts, missingLast = false) {
  let current = root;
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    if (missingLast && i === parts.length - 1 && !fs.existsSync(current)) {
      // existsSync follows links; lstat must still reject dangling links.
      try { fs.lstatSync(current); throw new Error("Links are not allowed"); } catch (error) { if (error.code !== "ENOENT") throw error; }
      return current;
    }
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile()) || (stat.isFile() && stat.nlink !== 1)) throw new Error("Links and special files are not allowed");
    if (i < parts.length - 1 && !stat.isDirectory()) throw new Error("Not a folder");
  }
  return current;
}
function rootFor(id, game, home) {
  const canonicalHome = fs.realpathSync(home);
  const root = worldDataDirectory(id, game, canonicalHome);
  return checkedPath(canonicalHome, path.relative(canonicalHome, root).split(path.sep));
}
function dataPath(root, relative, missing = false) {
  const parts = partsFor(relative);
  if (!parts.length || !DATA_EXTENSIONS.has(path.extname(parts.at(-1)).toLowerCase())) throw new Error("Only saved-world and data files can be managed");
  return checkedPath(root, parts, missing);
}
function readBytes(file) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1) throw new Error("Links and special files are not allowed");
    if (stat.size > MAX_FILE_BYTES) throw new Error("This file exceeds the 3 MB browser transfer limit");
    return fs.readFileSync(fd);
  } finally { fs.closeSync(fd); }
}
function historyRoot(root) {
  const folder = path.join(root, HISTORY);
  if (!fs.existsSync(folder)) fs.mkdirSync(folder, { mode: 0o700 });
  checkedPath(root, [HISTORY]);
  return folder;
}
function historyEntries(root) {
  const folder = historyRoot(root);
  return fs.readdirSync(folder).filter(name => UUID.test(name)).flatMap(id => {
    try {
      const file = checkedPath(folder, [id, "metadata.json"]);
      const item = JSON.parse(fs.readFileSync(file, "utf8"));
      partsFor(item.path);
      return [{ id, path: item.path, at: item.at, bytes: item.bytes }];
    } catch { return []; }
  }).sort((a, b) => b.at.localeCompare(a.at));
}
function savePrevious(root, relative, bytes) {
  const folder = historyRoot(root), id = randomUUID();
  const target = path.join(folder, id);
  fs.mkdirSync(target, { mode: 0o700 });
  fs.writeFileSync(path.join(target, "data"), bytes, { flag: "wx", mode: 0o600 });
  fs.writeFileSync(path.join(target, "metadata.json"), JSON.stringify({ path: relative, at: new Date().toISOString(), bytes: bytes.length }), { flag: "wx", mode: 0o600 });
  // Bound storage per server, independent of how often someone saves a file.
  for (const item of historyEntries(root).slice(50)) fs.rmSync(path.join(folder, item.id), { recursive: true });
}
function replace(root, relative, bytes, expectedEtag) {
  if (bytes.length > MAX_FILE_BYTES) throw new Error("This file exceeds the 3 MB browser transfer limit");
  const file = dataPath(root, relative, true);
  let previous = null;
  try { previous = readBytes(file); } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (typeof expectedEtag !== "string" || expectedEtag !== (previous ? digest(previous) : "")) throw new Error("File changed since you opened it. Refresh before saving.");
  ensureSpace(root, bytes.length + (previous?.length || 0), true);
  if (previous) savePrevious(root, relative, previous);
  const temp = path.join(path.dirname(file), `.pb-write-${randomUUID()}`);
  try {
    fs.writeFileSync(temp, bytes, { flag: "wx", mode: 0o600 });
    fs.renameSync(temp, file);
  } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
  return { saved: true, etag: digest(bytes) };
}

/** Runs synchronously while the agent holds this server's start lock. */
export function manageDedicatedFiles(id, game, input, home = process.env.HOME || "/var/lib/playbound-host") {
  const root = rootFor(id, game, home);
  const relative = input.path ?? "";
  if (input.action === "list") {
    const folder = checkedPath(root, partsFor(relative));
    if (!fs.statSync(folder).isDirectory()) throw new Error("Not a folder");
    const names = fs.readdirSync(folder);
    if (names.length > 1000) throw new Error("This folder has too many entries for the browser file manager");
    const entries = names.filter(name => !forbidden(name)).flatMap(name => {
      const file = path.join(folder, name), stat = fs.lstatSync(file);
      if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory()) || (stat.isFile() && (stat.nlink !== 1 || !DATA_EXTENSIONS.has(path.extname(name).toLowerCase())))) return [];
      return [{ name, directory: stat.isDirectory(), bytes: stat.isFile() ? stat.size : null, modifiedAt: stat.mtime.toISOString() }];
    }).sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name));
    return { path: relative, entries, maxFileBytes: MAX_FILE_BYTES };
  }
  if (input.action === "history") return { history: historyEntries(root) };
  if (input.action === "mkdir") {
    const parts = partsFor(relative);
    if (!parts.length) throw new Error("Choose a folder name");
    const target = checkedPath(root, parts, true);
    ensureSpace(root, 4096, true);
    fs.mkdirSync(target, { mode: 0o700 });
    return { created: true };
  }
  if (input.action === "read") {
    const bytes = readBytes(dataPath(root, relative));
    let text = null;
    if (bytes.length <= 256 * 1024 && TEXT_EXTENSIONS.has(path.extname(relative).toLowerCase())) {
      try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { /* binary content */ }
    }
    return { path: relative, bytes: bytes.length, contentBase64: bytes.toString("base64"), etag: digest(bytes), text };
  }
  if (input.action === "restore") {
    if (!UUID.test(input.revision || "")) throw new Error("Invalid file revision");
    const folder = historyRoot(root);
    const metadata = JSON.parse(fs.readFileSync(checkedPath(folder, [input.revision, "metadata.json"]), "utf8"));
    if (metadata.path !== relative) throw new Error("Revision does not belong to this file");
    return replace(root, relative, readBytes(checkedPath(folder, [input.revision, "data"])), input.expectedEtag);
  }
  if (input.action === "write") {
    if (typeof input.contentBase64 !== "string" || input.contentBase64.length > 4 * 1024 ** 2 || input.contentBase64.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(input.contentBase64)) throw new Error("Invalid or oversized file content");
    const bytes = Buffer.from(input.contentBase64, "base64");
    if (bytes.toString("base64") !== input.contentBase64) throw new Error("Invalid file content");
    return replace(root, relative, bytes, input.expectedEtag);
  }
  if (input.action === "delete") {
    const file = dataPath(root, relative), bytes = readBytes(file);
    if (input.expectedEtag !== digest(bytes)) throw new Error("File changed since you opened it. Refresh before deleting.");
    ensureSpace(root, bytes.length);
    savePrevious(root, relative, bytes);
    fs.unlinkSync(file);
    return { deleted: true };
  }
  throw new Error("Unknown file operation");
}
