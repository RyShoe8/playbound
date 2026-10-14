import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { verifyInstallation } from "./installationTargets.js";

const MARKER = ".pb-runtime.json";
// Engine-owned state, never copied from the shared installation to a customer.
// Unknown changes fail closed rather than silently disappearing during updates.
const STATE_FILES = new Set([
  "serversettings.xml", "config_player.xml", "Data/clientpermissions.xml",
  "Data/bannedplayers.xml", "Data/bannedplayers.txt", "Data/karmasettings.xml",
  "Data/campaignsettings.xml", "Data/permissionpresets_player.xml",
]);
const STATE_DIRS = ["Data/Multiplayer", "Data/Saves", "ServerLogs"];
const FRESH_DEFAULTS = new Set(["Data/karmasettings.xml", "Data/campaignsettings.xml"]);
const stateFile = (name) => STATE_FILES.has(name) || STATE_DIRS.some((dir) => name === dir || name.startsWith(`${dir}/`))
  || /^servercrashreport(?: \(\d+\))?\.log$/.test(name);
const metadata = (name) => name === MARKER || name === "steamapps" || name.startsWith("steamapps/");

function realDirectory(directory) {
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(directory) !== path.resolve(directory)) {
    throw new Error("Barotrauma runtime paths must be real directories");
  }
}

function inventory(directory) {
  realDirectory(directory);
  const files = Object.create(null);
  let size = 0, count = 0;
  const walk = (parent, prefix = "") => {
    for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
      if (++count > 100_000) throw new Error("Barotrauma runtime file limit exceeded");
      const name = prefix + entry.name;
      const filename = path.join(parent, entry.name);
      const stat = fs.lstatSync(filename);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && (!stat.isFile() || stat.nlink !== 1))) {
        throw new Error("Barotrauma runtime contains links or special files; operator inspection required");
      }
      if (metadata(name)) continue;
      if (stat.isDirectory()) walk(filename, name + "/");
      else {
        size += stat.size;
        if (size > 8 * 1024 ** 3 || stat.size > 512 * 1024 ** 2) throw new Error("Barotrauma runtime size limit exceeded");
        files[name] = { hash: createHash("sha256").update(fs.readFileSync(filename)).digest("hex"), size: stat.size };
      }
    }
  };
  walk(directory);
  return { files, size };
}

function readMarker(runtime) {
  const filename = path.join(runtime, MARKER);
  if (!fs.existsSync(filename)) return null;
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 16 * 1024 ** 2) throw new Error("Invalid Barotrauma runtime marker");
  const marker = JSON.parse(fs.readFileSync(filename, "utf8"));
  if (marker.version !== 1 || !/^\d+$/.test(marker.buildId) || !marker.files || typeof marker.files !== "object" || Array.isArray(marker.files)) {
    throw new Error("Invalid Barotrauma runtime baseline");
  }
  return marker;
}

function validateChanges(current, baseline) {
  for (const name of new Set([...Object.keys(current.files), ...Object.keys(baseline.files)])) {
    if (!stateFile(name) && current.files[name]?.hash !== baseline.files[name]?.hash) {
      throw new Error("Barotrauma runtime has unclassified changes; operator inspection required before updating");
    }
  }
}

function samePackagedFiles(left, right) {
  return [...new Set([...Object.keys(left.files), ...Object.keys(right.files)])]
    .every((name) => stateFile(name) || left.files[name]?.hash === right.files[name]?.hash);
}

function writeMarker(runtime, marker) {
  const temporary = path.join(runtime, `${MARKER}.tmp`);
  fs.writeFileSync(temporary, JSON.stringify(marker), { mode: 0o600, flag: "wx" });
  fs.renameSync(temporary, path.join(runtime, MARKER));
}

// Called before replacing the shared depot, while the installation start gate
// and privileged process scan have established that affected servers are stopped.
export function baselineBarotraumaHomes(source, hostHome) {
  const verified = verifyInstallation(source, "barotrauma");
  const original = inventory(source);
  for (const folder of ["barotrauma-servers", "barotrauma-servers-rooms"]) {
    const root = path.join(hostHome, folder);
    if (!fs.existsSync(root)) continue;
    realDirectory(root);
    for (const name of fs.readdirSync(root)) {
      if (!/^pb-[a-zA-Z0-9_-]{1,64}$/.test(name)) throw new Error("Unexpected Barotrauma server directory");
      const home = path.join(root, name);
      realDirectory(home);
      const runtime = path.join(home, "runtime");
      recoverBarotraumaRuntime(home);
      if (!fs.existsSync(runtime)) continue;
      const current = inventory(runtime);
      const marker = readMarker(runtime);
      // A legacy copy can only be adopted against the still-installed depot.
      // Do this BEFORE updating it, never guess that changed DLLs are settings.
      validateChanges(current, marker || original);
      if (!marker) writeMarker(runtime, { version: 1, buildId: verified.buildId, files: original.files });
    }
  }
}

export function recoverBarotraumaRuntime(home) {
  realDirectory(home);
  const journal = path.join(home, ".runtime-migration.json");
  if (!fs.existsSync(journal)) return;
  const stat = fs.lstatSync(journal);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 1024) throw new Error("Invalid Barotrauma migration journal");
  const { id } = JSON.parse(fs.readFileSync(journal, "utf8"));
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(id || "")) throw new Error("Invalid Barotrauma migration identity");
  const runtime = path.join(home, "runtime");
  const backup = path.join(home, `.runtime-backup-${id}`);
  const stage = path.join(home, `.runtime-stage-${id}`);
  if (!fs.existsSync(runtime) && fs.existsSync(backup)) {
    realDirectory(backup);
    fs.renameSync(backup, runtime);
  }
  // Keep both copies after a crash. No automatic deletion of worlds or staging.
  if (!fs.existsSync(runtime)) throw new Error("Barotrauma migration interrupted before a runtime was available");
  realDirectory(runtime);
  if (fs.existsSync(stage)) throw new Error("Barotrauma migration recovered; retained staging needs operator inspection");
  fs.unlinkSync(journal);
}

// prepareSpawn runs under the existing per-server start lock. No active runtime
// is modified. Entire previous copies are retained, including worlds and mods.
export function prepareBarotraumaRuntime(source, home, { disk = fs.statfsSync } = {}) {
  recoverBarotraumaRuntime(home);
  const verified = verifyInstallation(source, "barotrauma");
  const original = inventory(source);
  const runtime = path.join(home, "runtime");
  const exists = fs.existsSync(runtime);
  let current;
  if (exists) {
    current = inventory(runtime);
    if (!current.files.DedicatedServer) throw new Error("Barotrauma private executable is missing; operator inspection required");
    const marker = readMarker(runtime);
    if (marker && marker.buildId === verified.buildId && samePackagedFiles(original, marker)) return;
    // Legacy custom installations remain startable. The update worker must
    // baseline them before a depot swap and refuses unclassified modifications.
    if (!marker && !samePackagedFiles(current, original)) return;
    validateChanges(current, marker || original);
    if (!marker) writeMarker(runtime, { version: 1, buildId: verified.buildId, files: original.files });
    if (!marker) return;
  }
  if (fs.readdirSync(home).filter((name) => name.startsWith(".runtime-backup-") || name.startsWith(".runtime-stage-")).length >= 3) {
    throw new Error("Barotrauma retained runtime copies need operator archival before another update");
  }
  const available = disk(home);
  if (available.bavail * available.bsize < original.size + (current?.size || 0) + Math.max(2 * 1024 ** 3, available.blocks * available.bsize * 0.1)) {
    throw new Error("Not enough free disk for a private Barotrauma runtime and its saves");
  }
  const id = randomUUID();
  const stage = path.join(home, `.runtime-stage-${id}`);
  const backup = path.join(home, `.runtime-backup-${id}`);
  fs.cpSync(source, stage, { recursive: true, filter: (filename) => {
    const name = path.relative(source, filename).split(path.sep).join("/");
    return (!stateFile(name) || (!exists && FRESH_DEFAULTS.has(name))) && !metadata(name);
  } });
  if (current) {
    for (const name of Object.keys(current.files).filter(stateFile)) {
      const destination = path.join(stage, ...name.split("/"));
      fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
      fs.copyFileSync(path.join(runtime, ...name.split("/")), destination, fs.constants.COPYFILE_EXCL);
      fs.chmodSync(destination, 0o600);
    }
  }
  const staged = inventory(stage);
  validateChanges(staged, original);
  writeMarker(stage, { version: 1, buildId: verified.buildId, files: original.files });
  fs.writeFileSync(path.join(home, ".runtime-migration.json"), JSON.stringify({ id }), { mode: 0o600, flag: "wx" });
  if (exists) fs.renameSync(runtime, backup);
  try { fs.renameSync(stage, runtime); }
  catch (error) { if (exists) fs.renameSync(backup, runtime); throw error; }
  fs.unlinkSync(path.join(home, ".runtime-migration.json"));
}
