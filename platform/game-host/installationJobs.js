import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fork, execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { INSTALLATION_TARGETS, installationDependencies, verifyInstallation } from "./installationTargets.js";
import { isSameProcess, processIdentity } from "./managedRegistry.js";

const exec = promisify(execFile);
const TERMINAL = new Set(["completed", "failed", "cancelled"]);
const UUID = /^[a-f0-9-]{36}$/;

export function createInstallationStore(stateDir) {
  const directory = path.join(stateDir, "installation-updates");
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  function filename(id) {
    if (!UUID.test(id)) throw new Error("Invalid update ID");
    return path.join(directory, `${id}.json`);
  }
  return {
    read(id) { return JSON.parse(fs.readFileSync(filename(id), "utf8")); },
    all() {
      return fs.readdirSync(directory).filter((name) => UUID.test(name.replace(/\.json$/, "")) && name.endsWith(".json"))
        .map((name) => JSON.parse(fs.readFileSync(path.join(directory, name), "utf8")))
        .sort((a, b) => b.createdAt - a.createdAt);
    },
    write(job) {
      const destination = filename(job.id);
      const temp = `${destination}.${process.pid}.tmp`;
      fs.writeFileSync(temp, JSON.stringify({ ...job, updatedAt: Date.now() }), { mode: 0o600 });
      fs.renameSync(temp, destination);
    },
  };
}

// Root-owned read-only helper sees unmanaged processes too. No argv or secrets are returned.
export async function scanInstallation(key, gamesRoot = "/opt/playbound-host/games") {
  if (!INSTALLATION_TARGETS[key]) throw new Error("Unsupported installation");
  if (fs.realpathSync(gamesRoot) !== "/opt/playbound-host/games") throw new Error("Process scanner is not configured for this installation root");
  try {
    const { stdout } = await exec("/usr/bin/sudo", ["-n", "/usr/local/sbin/playbound-update-scan", key], { timeout: 5000, maxBuffer: 32_768 });
    const data = JSON.parse(stdout);
    if (data.ok !== true || !Number.isInteger(data.count) || data.count < 0) throw new Error();
    return data.count;
  } catch { throw new Error("Cannot verify installation processes; update remains paused"); }
}

export function createInstallationCoordinator({ stateDir, gamesRoot, rooms, gameSlugs = () => [], scan = scanInstallation, launch, sameProcess = isSameProcess }) {
  const store = createInstallationStore(stateDir);
  const pending = new Map();
  let ticking = false;
  let metadataChecking = false;
  async function withMetadataCheck(check) {
    if (metadataChecking || ticking || store.all().some((job) => !TERMINAL.has(job.status) && job.status !== "waiting")) throw new Error("Installation maintenance is active");
    metadataChecking = true;
    try { return await check(); } finally { metadataChecking = false; }
  }
  const active = (key) => store.all().find((job) => job.key === key && !TERMINAL.has(job.status));
  function blockedReason(slug) {
    return installationDependencies(slug).some((key) => active(key)) ? "Shared installation maintenance is queued or running; new starts are paused" : null;
  }
  function beginStart(slug) {
    const reason = blockedReason(slug);
    if (reason) throw new Error(reason);
    const keys = installationDependencies(slug);
    for (const key of keys) pending.set(key, (pending.get(key) || 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      for (const key of keys) pending.set(key, Math.max(0, (pending.get(key) || 0) - 1));
    };
  }
  function queue(key, action, actor) {
    if (!INSTALLATION_TARGETS[key] || !["update", "rollback"].includes(action)) throw new Error("Unsupported installation action");
    if (INSTALLATION_TARGETS[key].blockedReason) throw new Error(INSTALLATION_TARGETS[key].blockedReason);
    const existing = active(key);
    if (existing) return existing; // Duplicate requests never dispatch a second worker.
    if (store.all().length >= 500) throw new Error("Update history needs operator archival before adding more jobs");
    const installed = verifyInstallation(path.join(gamesRoot, key), key);
    let rollbackId;
    if (action === "rollback") {
      rollbackId = store.all().find((job) => job.key === key && job.status === "completed" && job.action === "update" && !job.rollbackConsumed)?.id;
      if (!rollbackId) throw new Error("No retained installation is available for rollback");
      verifyInstallation(path.join(gamesRoot, `.pb-rollback-${key}-${rollbackId}`), key);
    }
    const job = { id: crypto.randomUUID(), key, action, actor: String(actor || "admin").slice(0, 160), status: "waiting", createdAt: Date.now(), beforeBuild: installed.buildId, rollbackId };
    store.write(job);
    return job;
  }
  function cancel(id) {
    const job = store.read(id);
    if (job.status !== "waiting") throw new Error("Only a waiting update can be cancelled");
    store.write({ ...job, status: "cancelled" });
  }
  async function tick() {
    if (ticking || metadataChecking) return;
    ticking = true;
    try {
      for (let job of store.all().filter((row) => !TERMINAL.has(row.status))) {
        if (job.status !== "waiting") {
          if (job.status !== "interrupted" && !sameProcess(job.pid, job.identity)) {
            store.write({ ...job, status: "interrupted", message: "Update worker disappeared. New starts stay blocked; an operator must inspect the installation." });
          }
          continue;
        }
        const count = [...rooms()].filter((room) => installationDependencies(room.gameSlug).includes(job.key)).length + (pending.get(job.key) || 0);
        let message;
        if (count) message = `Waiting for ${count} affected server(s) or starts to stop. Existing games are preserved.`;
        else {
          try { if (await scan(job.key, gamesRoot)) message = "Waiting for an affected or unclassified process to stop; no running game will be interrupted"; }
          catch (error) { message = error.message; }
        }
        // Cancellation may have happened while the process scan was running.
        job = store.read(job.id);
        if (job.status !== "waiting") continue;
        if (message) { store.write({ ...job, message }); continue; }
        if (store.all().some((row) => row.id !== job.id && !TERMINAL.has(row.status) && row.status !== "waiting")) {
          store.write({ ...job, message: "Waiting for the other installation update or recovery to finish" });
          continue;
        }
        store.write({ ...job, status: "launching", message: "Starting isolated update worker" });
        try {
          if (launch) await launch(job, store);
          else {
            const child = fork(fileURLToPath(new URL("./installationUpdateWorker.js", import.meta.url)), [], {
              detached: true, execArgv: [], stdio: ["ignore", "ignore", "ignore", "ipc"],
              env: { PATH: "/usr/local/bin:/usr/bin:/bin:/usr/games", HOME: process.env.HOME || "/var/lib/playbound-host", LANG: "C.UTF-8" },
            });
            const identity = processIdentity(child.pid);
            if (!identity) { child.kill(); throw new Error("Worker identity unavailable"); }
            store.write({ ...job, status: "launching", pid: child.pid, identity });
            child.on("error", () => {});
            child.send({ id: job.id, stateDir, gamesRoot });
            child.unref();
          }
        } catch {
          store.write({ ...job, status: "failed", message: "Could not launch update worker; installation was not changed" });
        }
      }
    } finally { ticking = false; }
  }
  function snapshot() {
    const jobs = store.all();
    return {
      gameSlugs: [...new Set(gameSlugs())].filter((slug) => typeof slug === "string" && /^[a-z0-9][a-z0-9-]{0,127}$/.test(slug)).sort(),
      targets: Object.entries(INSTALLATION_TARGETS).map(([key, target]) => {
        let installed, blocked = target.blockedReason;
        try { installed = verifyInstallation(path.join(gamesRoot, key), key); } catch {
          if (key === "factorio") blocked = "Factorio requires an official-package integrity baseline and a compatible headless runtime before updates. Custom files require operator review.";
        }
        const rollback = jobs.find((job) => job.key === key && job.status === "completed" && job.action === "update" && !job.rollbackConsumed);
        return { key, name: target.name, installed: Boolean(installed), buildId: installed?.buildId, branch: installed?.branch, rollbackAvailable: Boolean(rollback), blockedReason: blocked };
      }),
      jobs: [...jobs.filter((job) => !TERMINAL.has(job.status)), ...jobs.filter((job) => TERMINAL.has(job.status)).slice(0, 30)]
        .map(({ pid: _pid, identity: _identity, ...job }) => job),
    };
  }
  return { blockedReason, beginStart, queue, cancel, tick, snapshot, withMetadataCheck };
}
