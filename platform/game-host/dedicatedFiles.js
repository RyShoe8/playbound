import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { worldDataDirectory } from "./dedicatedDataBackups.js";

export const MAX_FILE_BYTES = 3 * 1024 ** 2;
export const MAX_TRANSFER_BYTES = 64 * 1024 ** 2;
export const FILE_CHUNK_BYTES = 1024 ** 2;
const UPLOADS = ".playbound-file-uploads";
const UPLOAD_TTL = 60 * 60 * 1000;
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

// Large saves stay on disk. Only a single bounded chunk enters memory, including
// when hashing, retaining history, restoring, or committing an upload.
function withFile(file, work) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1) throw new Error("Links and special files are not allowed");
    if (stat.size > MAX_TRANSFER_BYTES) throw new Error("This file exceeds the 64 MB transfer limit");
    return work(fd, stat);
  } finally { fs.closeSync(fd); }
}
const versionOf = stat => `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
function fileInfo(file) {
  return withFile(file, (fd, stat) => {
    const hash = createHash("sha256"), buffer = Buffer.alloc(FILE_CHUNK_BYTES);
    let offset = 0, count;
    while ((count = fs.readSync(fd, buffer, 0, buffer.length, offset))) { hash.update(buffer.subarray(0, count)); offset += count; }
    if (versionOf(stat) !== versionOf(fs.fstatSync(fd))) throw new Error("File changed during transfer. Please retry.");
    return { bytes: stat.size, etag: hash.digest("hex"), version: versionOf(stat) };
  });
}
function currentInfo(root, relative) {
  try { return fileInfo(dataPath(root, relative, true)); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
function retainFile(root, relative, file, bytes) {
  const folder = historyRoot(root), id = randomUUID(), target = path.join(folder, id);
  fs.mkdirSync(target, { mode: 0o700 });
  try {
    fs.copyFileSync(file, path.join(target, "data"), fs.constants.COPYFILE_EXCL);
    fs.chmodSync(path.join(target, "data"), 0o600);
    fs.writeFileSync(path.join(target, "metadata.json"), JSON.stringify({ path: relative, at: new Date().toISOString(), bytes }), { flag: "wx", mode: 0o600 });
  } catch (error) { fs.rmSync(target, { recursive: true }); throw error; }
  for (const item of historyEntries(root).slice(50)) fs.rmSync(path.join(folder, item.id), { recursive: true });
}
function replaceFromFile(root, relative, source, expectedEtag) {
  const next = fileInfo(source), before = currentInfo(root, relative);
  if (typeof expectedEtag !== "string" || expectedEtag !== (before?.etag || "")) throw new Error("File changed since you opened it. Refresh before saving.");
  const file = dataPath(root, relative, true);
  ensureSpace(root, next.bytes + (before?.bytes || 0), true);
  if (before) retainFile(root, relative, file, before.bytes);
  const temp = path.join(path.dirname(file), `.pb-write-${randomUUID()}`);
  try {
    fs.copyFileSync(source, temp, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(temp, 0o600);
    fs.renameSync(temp, file);
  } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
  return { saved: true, etag: next.etag };
}
function uploadRoot(root) {
  const folder = path.join(root, UPLOADS);
  if (!fs.existsSync(folder)) fs.mkdirSync(folder, { mode: 0o700 });
  checkedPath(root, [UPLOADS]);
  // Fixed lifetime, bounded count; abandoned sessions are reclaimed on the next
  // file operation, even if a browser never sends cancellation.
  for (const id of fs.readdirSync(folder).filter(name => UUID.test(name))) {
    const session = checkedPath(folder, [id]);
    if (Date.now() - fs.statSync(session).mtimeMs > UPLOAD_TTL) fs.rmSync(session, { recursive: true });
  }
  return folder;
}
function transfer(root, input, relative) {
  if (input.action === "stat") {
    const info = fileInfo(dataPath(root, relative));
    return { path: relative, ...info, ...(info.bytes <= 256 * 1024 ? manageRead(root, relative) : { text: null, contentBase64: "" }) };
  }
  if (input.action === "read-chunk") {
    if (!Number.isSafeInteger(input.offset) || input.offset < 0) throw new Error("Invalid chunk offset");
    return withFile(dataPath(root, relative), (fd, stat) => {
      if (input.version !== versionOf(stat)) throw new Error("File changed during transfer. Please reopen it.");
      if (input.offset > stat.size) throw new Error("Invalid chunk offset");
      const buffer = Buffer.alloc(Math.min(FILE_CHUNK_BYTES, stat.size - input.offset));
      const count = fs.readSync(fd, buffer, 0, buffer.length, input.offset);
      if (count !== buffer.length || input.version !== versionOf(fs.fstatSync(fd))) throw new Error("File changed during transfer. Please reopen it.");
      return { contentBase64: buffer.toString("base64"), offset: input.offset, bytes: count };
    });
  }
  const folder = uploadRoot(root);
  if (input.action === "upload-begin") {
    dataPath(root, relative, true);
    if (typeof input.actor !== "string" || !input.actor || !Number.isSafeInteger(input.bytes) || input.bytes < 0 || input.bytes > MAX_TRANSFER_BYTES) throw new Error("Invalid upload size or owner (64 MB maximum)");
    if (fs.readdirSync(folder).length >= 2) throw new Error("Two uploads are already pending. Cancel one or wait an hour.");
    const current = currentInfo(root, relative);
    if (typeof input.expectedEtag !== "string" || input.expectedEtag !== (current?.etag || "")) throw new Error("File changed since you opened it. Refresh before saving.");
    ensureSpace(root, input.bytes * 2 + (current?.bytes || 0), true);
    const id = randomUUID(), session = path.join(folder, id);
    fs.mkdirSync(session, { mode: 0o700 });
    fs.writeFileSync(path.join(session, "metadata.json"), JSON.stringify({ path: relative, bytes: input.bytes, expectedEtag: input.expectedEtag, actor: input.actor }), { flag: "wx", mode: 0o600 });
    fs.writeFileSync(path.join(session, "data"), "", { flag: "wx", mode: 0o600 });
    return { uploadId: id, chunkBytes: FILE_CHUNK_BYTES };
  }
  if (!UUID.test(input.uploadId || "")) throw new Error("Invalid upload session");
  const session = checkedPath(folder, [input.uploadId]);
  const meta = JSON.parse(fs.readFileSync(checkedPath(session, ["metadata.json"]), "utf8"));
  if (meta.actor !== input.actor || meta.path !== relative) throw new Error("Upload belongs to another user or file");
  const file = checkedPath(session, ["data"]);
  if (input.action === "upload-cancel") { fs.rmSync(session, { recursive: true }); return { cancelled: true }; }
  if (input.action === "upload-chunk") {
    if (!Number.isSafeInteger(input.offset) || input.offset < 0 || typeof input.contentBase64 !== "string" || input.contentBase64.length > Math.ceil(FILE_CHUNK_BYTES / 3) * 4) throw new Error("Invalid upload chunk");
    const bytes = Buffer.from(input.contentBase64, "base64");
    if (!bytes.length || bytes.length > FILE_CHUNK_BYTES || bytes.toString("base64") !== input.contentBase64 || input.offset + bytes.length > meta.bytes) throw new Error("Invalid upload chunk");
    const fd = fs.openSync(file, fs.constants.O_RDWR | (fs.constants.O_NOFOLLOW || 0));
    try {
      const stat = fs.fstatSync(fd);
      if (!stat.isFile() || stat.nlink !== 1) throw new Error("Links and special files are not allowed");
      if (input.offset < stat.size && input.offset + bytes.length <= stat.size) {
        const prior = Buffer.alloc(bytes.length);
        if (fs.readSync(fd, prior, 0, prior.length, input.offset) !== prior.length || !prior.equals(bytes)) throw new Error("Retried chunk differs from uploaded content");
      } else {
        if (input.offset !== stat.size) throw new Error("Upload chunks must arrive in order");
        ensureSpace(root, bytes.length, true);
        let written = 0;
        while (written < bytes.length) written += fs.writeSync(fd, bytes, written, bytes.length - written, input.offset + written);
      }
    } finally { fs.closeSync(fd); }
    return { received: input.offset + bytes.length };
  }
  if (input.action === "upload-commit") {
    if (fs.statSync(file).size !== meta.bytes) throw new Error("Upload is incomplete");
    const result = replaceFromFile(root, relative, file, meta.expectedEtag);
    fs.rmSync(session, { recursive: true });
    return result;
  }
  throw new Error("Unknown file operation");
}
function manageRead(root, relative) {
  const bytes = readBytes(dataPath(root, relative));
  let text = null;
  if (bytes.length <= 256 * 1024 && TEXT_EXTENSIONS.has(path.extname(relative).toLowerCase())) {
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { /* binary content */ }
  }
  return { path: relative, bytes: bytes.length, contentBase64: bytes.toString("base64"), etag: digest(bytes), text };
}

/** Runs synchronously while the agent holds this server's start lock. */
export function manageDedicatedFiles(id, game, input, home = process.env.HOME || "/var/lib/playbound-host") {
  return manageFiles(rootFor(id, game, home), input);
}

/** Invoked only by the fixed UID worker; no HTTP request chooses this root. */
export function manageIsolatedDedicatedFiles(id, game, input) {
  if (!/^[a-f0-9]{24}$/.test(id || "") || !["teeworlds","bzflag","hedgewars","openttd","luanti","openarena","battle-for-wesnoth"].includes(game)) throw new Error("Invalid isolated world identity");
  const base = "/var/lib/playbound-customer-runtime";
  if (fs.realpathSync(base) !== base) throw new Error("Invalid isolated world root");
  const data = checkedPath(base, [id,"data"]);
  const root = game === "luanti" ? checkedPath(data,["world"]) : data;
  return manageFiles(root,input);
}

function manageFiles(root, input) {
  const relative = input.path ?? "";
  uploadRoot(root);
  if (["stat", "read-chunk", "upload-begin", "upload-chunk", "upload-commit", "upload-cancel"].includes(input.action)) return transfer(root, input, relative);
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
    return { path: relative, entries, maxFileBytes: MAX_TRANSFER_BYTES };
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
    return manageRead(root, relative);
  }
  if (input.action === "restore") {
    if (!UUID.test(input.revision || "")) throw new Error("Invalid file revision");
    const folder = historyRoot(root);
    const metadata = JSON.parse(fs.readFileSync(checkedPath(folder, [input.revision, "metadata.json"]), "utf8"));
    if (metadata.path !== relative) throw new Error("Revision does not belong to this file");
    return replaceFromFile(root, relative, checkedPath(folder, [input.revision, "data"]), input.expectedEtag);
  }
  if (input.action === "write") {
    if (typeof input.contentBase64 !== "string" || input.contentBase64.length > 4 * 1024 ** 2 || input.contentBase64.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(input.contentBase64)) throw new Error("Invalid or oversized file content");
    const bytes = Buffer.from(input.contentBase64, "base64");
    if (bytes.toString("base64") !== input.contentBase64) throw new Error("Invalid file content");
    return replace(root, relative, bytes, input.expectedEtag);
  }
  if (input.action === "delete") {
    const file = dataPath(root, relative), info = fileInfo(file);
    if (input.expectedEtag !== info.etag) throw new Error("File changed since you opened it. Refresh before deleting.");
    ensureSpace(root, info.bytes, true);
    retainFile(root, relative, file, info.bytes);
    fs.unlinkSync(file);
    return { deleted: true };
  }
  throw new Error("Unknown file operation");
}
