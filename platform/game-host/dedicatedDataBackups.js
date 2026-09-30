/** Customer-owned world data only. Never accepts caller-supplied filesystem
 * paths; the managed server ID and recipe select one isolated directory. */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const MAX_BYTES = 5 * 1024 ** 3;
const MAX_FILES = 50_000;
const BACKUP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function paths(serverId, gameSlug, home) {
  if (!/^[0-9a-f]{24}$/i.test(serverId)) throw new Error("Invalid customer server ID");
  if (gameSlug !== "mindustry" && gameSlug !== "openttd") throw new Error("This game has no persistent world-data backup");
  const folder = `pb-${serverId}`;
  const source = gameSlug === "mindustry"
    ? path.join(home, "mindustry", folder)
    : path.join(home, "openttd-servers", folder);
  const backupRoot = path.join(home, "dedicated-backups", serverId, gameSlug);
  return { source, backupRoot };
}

function measure(dir) {
  let bytes = 0;
  let files = 0;
  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      const stat = fs.lstatSync(file);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw new Error("World data contains an unsupported link or device");
      if (stat.isDirectory()) walk(file);
      else { bytes += stat.size; files++; }
      if (bytes > MAX_BYTES || files > MAX_FILES) throw new Error("World data exceeds the backup limit");
    }
  }
  walk(dir);
  return { bytes, files };
}

function snapshotDir(root, id) {
  if (!BACKUP_ID.test(id)) throw new Error("Invalid backup ID");
  return path.join(root, id);
}

export function listWorldBackups(serverId, gameSlug, home = process.env.HOME || "/var/lib/playbound-host") {
  const { backupRoot } = paths(serverId, gameSlug, home);
  if (!fs.existsSync(backupRoot)) return [];
  return fs.readdirSync(backupRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory() && BACKUP_ID.test(entry.name))
    .flatMap((entry) => {
      try {
        const base = snapshotDir(backupRoot, entry.name);
        const info = JSON.parse(fs.readFileSync(path.join(base, "metadata.json"), "utf8"));
        if (info.serverId !== serverId || info.gameSlug !== gameSlug || !fs.statSync(path.join(base, "data")).isDirectory()) return [];
        return [{ id: entry.name, createdAt: info.createdAt, bytes: info.bytes, files: info.files, kind: info.kind }];
      } catch { return []; }
    }).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function prune(serverId, gameSlug, home, retention) {
  for (const entry of listWorldBackups(serverId, gameSlug, home).slice(retention)) {
    const { backupRoot } = paths(serverId, gameSlug, home);
    fs.rmSync(snapshotDir(backupRoot, entry.id), { recursive: true, force: false });
  }
}

export function createWorldBackup(serverId, gameSlug, retention = 3, home = process.env.HOME || "/var/lib/playbound-host") {
  if (!Number.isInteger(retention) || retention < 1 || retention > 50) throw new Error("Invalid backup retention");
  const { source, backupRoot } = paths(serverId, gameSlug, home);
  if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) throw new Error("No saved world data exists for this server yet");
  const size = measure(source);
  fs.mkdirSync(backupRoot, { recursive: true, mode: 0o700 });
  const id = randomUUID();
  const temp = path.join(backupRoot, `.creating-${id}`);
  const dest = snapshotDir(backupRoot, id);
  try {
    fs.mkdirSync(temp, { mode: 0o700 });
    fs.cpSync(source, path.join(temp, "data"), { recursive: true, errorOnExist: true, force: false, filter: (file) => {
      if (fs.lstatSync(file).isSymbolicLink()) throw new Error("World data contains a symbolic link");
      return true;
    } });
    const copied = measure(path.join(temp, "data"));
    if (copied.bytes !== size.bytes || copied.files !== size.files) throw new Error("World data changed while the backup was being copied");
    const info = { serverId, gameSlug, id, kind: "manual", createdAt: new Date().toISOString(), ...size };
    fs.writeFileSync(path.join(temp, "metadata.json"), JSON.stringify(info), { mode: 0o600 });
    fs.renameSync(temp, dest);
    prune(serverId, gameSlug, home, retention);
    return info;
  } catch (error) {
    if (fs.existsSync(temp)) fs.rmSync(temp, { recursive: true, force: true });
    throw error;
  }
}

export function restoreWorldBackup(serverId, gameSlug, backupId, retention = 3, home = process.env.HOME || "/var/lib/playbound-host") {
  if (!Number.isInteger(retention) || retention < 1 || retention > 50) throw new Error("Invalid backup retention");
  const { source, backupRoot } = paths(serverId, gameSlug, home);
  const base = snapshotDir(backupRoot, backupId);
  const info = JSON.parse(fs.readFileSync(path.join(base, "metadata.json"), "utf8"));
  if (info.serverId !== serverId || info.gameSlug !== gameSlug) throw new Error("Backup does not belong to this server");
  const saved = path.join(base, "data");
  measure(saved);
  const token = randomUUID();
  const temp = `${source}.restore-${token}`;
  const safety = `${source}.before-restore-${token}`;
  fs.mkdirSync(path.dirname(source), { recursive: true, mode: 0o700 });
  try {
    fs.cpSync(saved, temp, { recursive: true, errorOnExist: true, force: false, filter: (file) => {
      if (fs.lstatSync(file).isSymbolicLink()) throw new Error("Backup contains a symbolic link");
      return true;
    } });
    measure(temp);
    const hadSource = fs.existsSync(source);
    if (hadSource) fs.renameSync(source, safety);
    try { fs.renameSync(temp, source); }
    catch (error) {
      if (hadSource) fs.renameSync(safety, source);
      throw error;
    }
    if (hadSource) {
      const before = measure(safety);
      const beforeId = randomUUID();
      const beforeDir = snapshotDir(backupRoot, beforeId);
      fs.mkdirSync(beforeDir, { recursive: true, mode: 0o700 });
      fs.renameSync(safety, path.join(beforeDir, "data"));
      fs.writeFileSync(path.join(beforeDir, "metadata.json"), JSON.stringify({ serverId, gameSlug, id: beforeId, kind: "before-restore", createdAt: new Date().toISOString(), ...before }), { mode: 0o600 });
    }
    prune(serverId, gameSlug, home, retention);
    return { restored: backupId, beforeRestoreSaved: hadSource };
  } finally {
    if (fs.existsSync(temp)) fs.rmSync(temp, { recursive: true, force: true });
  }
}
