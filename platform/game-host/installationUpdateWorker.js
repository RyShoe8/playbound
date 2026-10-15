import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { INSTALLATION_TARGETS, verifyInstallation, prepareInstallationLinks, restoreInstallationLinks } from "./installationTargets.js";
import { createInstallationStore, scanInstallation } from "./installationJobs.js";
import { baselineBarotraumaHomes } from "./barotraumaRuntime.js";
import { stageMindustryRelease } from "./mindustryUpdates.js";
import { stageOpenRARelease, validateOpenRABaseline } from "./openraUpdates.js";
import { stageOpenHVRelease } from "./openhvUpdates.js";
import { stageOpenE2140Release } from "./openE2140Updates.js";
import { stageHypersomniaRelease } from "./hypersomniaUpdates.js";

const GIB = 1024 ** 3;

export function diskAvailable(root) {
  const disk = fs.statfsSync(root);
  return { free: disk.bavail * disk.bsize, reserve: Math.max(8 * GIB, disk.blocks * disk.bsize * 0.1) };
}

// Each command owns a process group so a timeout also stops SteamCMD's children.
export function runCommand(command, args, { root, timeout = 90 * 60_000, maxOutput } = {}) {
  return new Promise((resolve, reject) => {
    let output = "";
    let failure;
    const child = spawn("/usr/bin/nice", ["-n", "19", "/usr/bin/ionice", "-c", "3", command, ...args], {
      detached: true, stdio: ["ignore", "pipe", "pipe"],
    });
    let killTimer;
    function stop(reason) {
      if (failure) return;
      failure = new Error(reason);
      try { process.kill(-child.pid, "SIGTERM"); } catch { /* Already exited. */ }
      killTimer = setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch { /* Already exited. */ } }, 5000);
    }
    const timer = setTimeout(() => stop("Update command timed out"), timeout);
    const monitor = setInterval(() => {
      if (!root) return;
      try {
        const disk = diskAvailable(root);
        if (disk.free < disk.reserve) stop("Update stopped to preserve free disk space");
      } catch { stop("Cannot verify free disk space"); }
    }, 2000);
    const capture = (chunk) => {
      output += chunk.toString();
      if (maxOutput && output.length > maxOutput) stop("Update command output exceeded safe limits");
      output = output.slice(-(maxOutput || 32_768));
    };
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    function cleanup() { clearTimeout(timer); clearTimeout(killTimer); clearInterval(monitor); }
    child.on("error", () => { cleanup(); reject(new Error("Update command could not be started")); });
    child.on("close", (code) => {
      cleanup();
      if (failure || code !== 0) reject(failure || new Error("Update command failed; current installation was preserved"));
      else resolve(output);
    });
  });
}

// Injection is only for isolated tests, never an HTTP input or downloaded script.
export async function runInstallationUpdate({ id, stateDir, gamesRoot }, { run = runCommand, scan = scanInstallation, disk = diskAvailable, hostHome = process.env.HOME, stageRelease = stageMindustryRelease, stageArchive = stageOpenRARelease, stageOpenHV = stageOpenHVRelease, stageOpenE2140 = stageOpenE2140Release, stageHypersomnia = stageHypersomniaRelease } = {}) {
  const store = createInstallationStore(stateDir);
  let job = store.read(id);
  const target = INSTALLATION_TARGETS[job.key];
  if (!target || job.status !== "launching") throw new Error("Invalid update job");
  const current = path.join(gamesRoot, job.key);
  const stage = path.join(gamesRoot, `.pb-update-${job.key}-${job.id}`);
  const backup = path.join(gamesRoot, `.pb-rollback-${job.key}-${job.id}`);
  const previous = job.rollbackId ? path.join(gamesRoot, `.pb-rollback-${job.key}-${job.rollbackId}`) : null;
  let activated = false;
  const phase = (status, message, extra = {}) => {
    job = { ...job, ...extra, status, message };
    store.write(job);
  };
  try {
    verifyInstallation(current, job.key);
    if (await scan(job.key, gamesRoot)) throw new Error("An affected process is still running; no files were changed");
    if (job.key === "openra") validateOpenRABaseline(current);
    if (job.key === "barotrauma") {
      if (!hostHome) throw new Error("Barotrauma host home is unavailable");
      baselineBarotraumaHomes(current, hostHome);
    }
    if (job.action === "update") {
      phase("staging", "Copying installation; current files remain untouched");
      const size = Number((await run("/usr/bin/du", ["-sb", "--", current], { root: gamesRoot, timeout: 60_000 })).split(/\s/)[0]);
      const available = disk(gamesRoot);
      if (!Number.isFinite(size) || size <= 0 || available.free < size * 1.25 + available.reserve) {
        throw new Error("Not enough free disk for a staged update and rollback copy");
      }
      if (fs.existsSync(stage) || fs.existsSync(backup)) throw new Error("Update directory already exists; operator inspection required");
      await run("/usr/bin/cp", ["-a", "--reflink=auto", "--sparse=always", "--", current, stage], { root: gamesRoot });
      const detachedLinks = prepareInstallationLinks(stage, current, true);
      if (["github-appimage", "signed-appimage"].includes(target.strategy)) {
        phase("downloading", job.key === "openra" ? "Verifying and extracting the three official OpenRA packages" : `Verifying the official ${target.name} AppImage and embedded game version`);
        const prepare = job.key === "hypersomnia" ? stageHypersomnia : job.key === "openhv" ? stageOpenHV : job.key === "earth-2140-trilogy" ? stageOpenE2140 : stageArchive;
        await prepare(stage, { run, diskCheck: () => {
          const available = disk(gamesRoot);
          if (available.free < available.reserve + 3 * GIB) throw new Error("Update stopped to preserve free disk space");
        } });
      } else if (target.strategy === "github-jar") {
        phase("downloading", "Downloading the official Mindustry server and verifying its release digest");
        await stageRelease(stage, { diskCheck: () => {
          const available = disk(gamesRoot);
          if (available.free < available.reserve + 256 * 1024 ** 2) throw new Error("Update stopped to preserve free disk space");
        } });
      } else {
        phase("downloading", "SteamCMD is updating the staged installation");
        const output = await run("/usr/games/steamcmd", ["+force_install_dir", stage, "+login", "anonymous", "+app_update", String(target.appId), "+quit"], { root: gamesRoot });
        if (!output.includes(`Success! App '${target.appId}' fully installed.`)) throw new Error("SteamCMD did not confirm a complete installation");
      }
      restoreInstallationLinks(detachedLinks);
    } else {
      if (!previous) throw new Error("Rollback installation is unavailable");
    }
    phase("validating", ["github-appimage", "signed-appimage"].includes(target.strategy) ? "Checking official AppImage installation integrity and version" : target.strategy === "github-jar" ? "Checking JAR integrity, server version and Java compatibility" : "Checking Steam manifest and required executables");
    const prepared = job.action === "update" ? stage : previous;
    const verified = verifyInstallation(prepared, job.key);
    if (job.key === "openra") validateOpenRABaseline(prepared);
    if (await scan(job.key, gamesRoot)) throw new Error("An affected process appeared; activation was refused");
    if (fs.existsSync(backup)) throw new Error("Rollback destination already exists");
    phase("activating", "Activating verified installation", { afterBuild: verified.buildId });
    fs.renameSync(current, backup);
    try { fs.renameSync(prepared, current); }
    catch (error) { fs.renameSync(backup, current); throw error; }
    activated = true;
    verifyInstallation(current, job.key);
    prepareInstallationLinks(backup, current);
    if (job.action === "rollback") {
      const source = store.read(job.rollbackId);
      store.write({ ...source, rollbackConsumed: true });
    }
    phase("completed", job.key === "barotrauma"
      ? "Installation ready. Private runtimes refresh on their next start, retaining current saves and the previous runtime. Binary rollback does not restore or guarantee compatibility with older save formats."
      : "Installation ready. Servers may be started normally; no game was stopped by this update.");
  } catch (error) {
    // Once activation began, uncertainty must keep starts blocked for inspection.
    const uncertain = activated || (job.status === "activating" && !fs.existsSync(current));
    phase(uncertain ? "interrupted" : "failed", uncertain
      ? "Activation needs operator inspection. New starts remain blocked; the rollback copy is retained."
      : error instanceof Error && /^(Not enough|An affected|SteamCMD|Mindustry|OpenRA|OpenHV|OpenE2140|Hypersomnia|Update command|Update stopped|Cannot verify|Barotrauma|Unexpected Barotrauma|Invalid Barotrauma)/.test(error.message)
        ? error.message : "Update failed before activation; the previous installation was preserved");
    // Retain partial staging files for diagnosis. Never recurse into customer save links.
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let started = false;
  process.once("disconnect", () => { if (!started) process.exit(1); });
  process.once("message", async (input) => {
    started = true;
    // Node 20 still processes its pending IPC messages after this callback.
    // Disconnecting synchronously here can null its channel before that step.
    setImmediate(() => { if (process.connected) process.disconnect(); });
    try { await runInstallationUpdate(input); process.exit(0); }
    catch { process.exit(1); }
  });
  setTimeout(() => { if (!started) process.exit(1); }, 10_000).unref();
}
