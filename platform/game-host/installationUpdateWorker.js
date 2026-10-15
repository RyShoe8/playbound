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
import { stageAssaultCubeRelease } from "./assaultcubeUpdates.js";
import { stageFactorioRelease } from "./factorioUpdates.js";
import { stageTerrariaRelease } from "./terrariaUpdates.js";
import { stageNativePackageRelease } from "./nativePackageUpdates.js";
import { stageRimworldRelease } from "./rimworldUpdates.js";
import { stageXonoticRelease } from "./xonoticUpdates.js";
import { stageFgmsRelease } from "./fgmsUpdates.js";
import { stageEtlegacyRelease } from "./etlegacyUpdates.js";
import { stageOpenMohaaRelease } from "./openmohaaUpdates.js";
import { stageUnvanquishedRelease, validateUnvanquishedOverrides } from "./unvanquishedUpdates.js";
import { stageReviewedComponent, validInstallationComponent } from "./reviewedComponentUpdates.js";

const GIB = 1024 ** 3;

export function steamCommandFailure(output) {
  if (/access denied|no subscription|no license/i.test(output)) return "SteamCMD download authorization was denied; the current installation was preserved";
  if (/disk write failure|not enough disk|insufficient disk/i.test(output)) return "SteamCMD could not write the staged download; the current installation was preserved";
  if (/no connection|failed to connect|connection timeout/i.test(output)) return "SteamCMD could not connect to Steam; the current installation was preserved";
  return "SteamCMD download failed; the current installation was preserved";
}

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
      if (failure || code !== 0) reject(failure || new Error(command === "/usr/games/steamcmd" ? steamCommandFailure(output) : "Update command failed; current installation was preserved"));
      else resolve(output);
    });
  });
}

// Injection is only for isolated tests, never an HTTP input or downloaded script.
export async function runInstallationUpdate({ id, stateDir, gamesRoot }, { run = runCommand, scan = scanInstallation, disk = diskAvailable, hostHome = process.env.HOME, stageRelease = stageMindustryRelease, stageArchive = stageOpenRARelease, stageOpenHV = stageOpenHVRelease, stageOpenE2140 = stageOpenE2140Release, stageHypersomnia = stageHypersomniaRelease, stageAssaultCube = stageAssaultCubeRelease, stageFactorio = stageFactorioRelease, stageTerraria = stageTerrariaRelease, stageXonotic = stageXonoticRelease } = {}) {
  const store = createInstallationStore(stateDir);
  let job = store.read(id);
  const target = INSTALLATION_TARGETS[job.key];
  if (!target || job.status !== "launching") throw new Error("Invalid update job");
  const current = path.join(gamesRoot, job.key);
  const stage = path.join(gamesRoot, `.pb-update-${job.key}-${job.id}`);
  const backup = path.join(gamesRoot, `.pb-rollback-${job.key}-${job.id}`);
  const previous = job.rollbackId ? path.join(gamesRoot, `.pb-rollback-${job.key}-${job.rollbackId}`) : null;
  if (target.component && !validInstallationComponent(target.component)) throw new Error("Invalid installation component");
  const activePath = target.component ? path.join(current, target.component) : current;
  const stagedPath = target.component ? path.join(stage, target.component) : stage;
  const backupPath = target.component ? path.join(backup, target.component) : backup;
  let activated = false;
  const phase = (status, message, extra = {}) => {
    job = { ...job, ...extra, status, message };
    store.write(job);
  };
  try {
    const original = verifyInstallation(current, job.key);
    if (job.key === "unvanquished") validateUnvanquishedOverrides(hostHome);
    if (original.branch && !/^[a-zA-Z0-9_-]{1,64}$/.test(original.branch)) throw new Error("SteamCMD installed branch requires operator review");
    if (await scan(job.key, gamesRoot)) throw new Error("An affected process is still running; no files were changed");
    if (job.key === "openra") validateOpenRABaseline(current);
    if (job.key === "barotrauma") {
      if (!hostHome) throw new Error("Barotrauma host home is unavailable");
      baselineBarotraumaHomes(current, hostHome);
    }
    if (job.action === "update") {
      phase("staging", "Copying installation; current files remain untouched");
      const size = Number((await run("/usr/bin/du", ["-sb", "--", activePath], { root: gamesRoot, timeout: 60_000 })).split(/\s/)[0]);
      const available = disk(gamesRoot);
      if (!Number.isFinite(size) || size <= 0 || available.free < size * 1.25 + available.reserve) {
        throw new Error("Not enough free disk for a staged update and rollback copy");
      }
      if (fs.existsSync(stage) || fs.existsSync(backup)) throw new Error("Update directory already exists; operator inspection required");
      if (target.component) fs.mkdirSync(stage, { mode: 0o700 });
      // Reviewed native files are root-owned. The unprivileged worker copies
      // their bytes, then the fixed promotion helper restores trusted ownership.
      await run("/usr/bin/cp", ["-a", ...(["reviewed-distro-native", "reviewed-native-zip"].includes(target.strategy) ? ["--no-preserve=ownership"] : []), "--reflink=auto", "--sparse=always", "--", activePath, stagedPath], { root: gamesRoot });
      const detachedLinks = prepareInstallationLinks(stage, current, true);
      if (target.strategy === "reviewed-component") {
        phase("downloading", "Verifying the reviewed engine; installed game data, profiles, scripts and worlds stay in place");
        await stageReviewedComponent(stage, job.key, { run, diskCheck: () => {
          const available = disk(gamesRoot);
          if (available.free < available.reserve + 256 * 1024 ** 2) throw new Error("Update stopped to preserve free disk space");
        } });
      } else if (target.strategy === "reviewed-unvanquished-package") {
        phase("downloading", "Verifying the reviewed Unvanquished engine, sandbox helpers and game packages together");
        await stageUnvanquishedRelease(stage, { run, diskCheck: () => {
          const available = disk(gamesRoot);
          if (available.free < available.reserve + 2 * GIB) throw new Error("Update stopped to preserve free disk space");
        } });
      } else if (target.strategy === "reviewed-openmohaa-package") {
        phase("downloading", "Verifying the reviewed OpenMoHAA engine, server module and libraries together");
        await stageOpenMohaaRelease(stage, { run, diskCheck: () => {
          const available = disk(gamesRoot);
          if (available.free < available.reserve + 256 * 1024 ** 2) throw new Error("Update stopped to preserve free disk space");
        } });
      } else if (target.strategy === "reviewed-etlegacy-package") {
        phase("downloading", "Verifying the reviewed ET Legacy engine, server mod and bot assets together");
        await stageEtlegacyRelease(stage, { run, diskCheck: () => {
          const available = disk(gamesRoot);
          if (available.free < available.reserve + 512 * 1024 ** 2) throw new Error("Update stopped to preserve free disk space");
        } });
      } else if (target.strategy === "reviewed-cmake-source") {
        phase("downloading", "Building the reviewed fgms relay; logs and server configuration stay outside the binary swap");
        await stageFgmsRelease(stage, { run });
      } else if (target.strategy === "reviewed-dotnet-source") {
        phase("downloading", "Building the reviewed RimWorld Together source with locked dependencies and PlayBound management bridge");
        await stageRimworldRelease(stage, { run });
      } else if (target.strategy === "reviewed-distro-native") {
        phase("downloading", "Verifying reviewed distro-native bytes; operating-system packages and saved data stay in place");
        await stageNativePackageRelease(stage, job.key, { run, diskCheck: () => {
          const available = disk(gamesRoot);
          if (available.free < available.reserve + 256 * 1024 ** 2) throw new Error("Update stopped to preserve free disk space");
        } });
      } else if (job.key === "xonotic") {
        phase("downloading", "Verifying the publisher-reviewed Xonotic dedicated engine; maps and server configuration stay in place");
        await stageXonotic(stage, { run, diskCheck: () => {
          const available = disk(gamesRoot);
          if (available.free < available.reserve + 256 * 1024 ** 2) throw new Error("Update stopped to preserve free disk space");
        } });
      } else if (job.key === "terraria") {
        phase("downloading", "Verifying the reviewed Terraria Linux package; saved worlds stay outside the installation");
        await stageTerraria(stage, { run, diskCheck: () => {
          const available = disk(gamesRoot);
          if (available.free < available.reserve + 512 * 1024 ** 2) throw new Error("Update stopped to preserve free disk space");
        } });
      } else if (job.key === "factorio") {
        phase("downloading", "Verifying the official stable Factorio headless package; saved worlds stay outside the installation");
        await stageFactorio(stage, { run, diskCheck: () => {
          const available = disk(gamesRoot);
          if (available.free < available.reserve + 2 * GIB) throw new Error("Update stopped to preserve free disk space");
        } });
      } else if (target.strategy === "github-native-binaries") {
        phase("downloading", "Verifying the official native package; configuration and game data stay in place");
        await stageAssaultCube(stage, { run, diskCheck: () => {
          const available = disk(gamesRoot);
          if (available.free < available.reserve + 256 * 1024 ** 2) throw new Error("Update stopped to preserve free disk space");
        } });
      } else if (["github-appimage", "signed-appimage"].includes(target.strategy)) {
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
        const output = await run("/usr/games/steamcmd", ["+force_install_dir", stage, "+login", "anonymous", "+app_update", String(target.appId), ...(original.branch && original.branch !== "public" ? ["-beta", original.branch] : []), "+quit"], { root: gamesRoot });
        if (!output.includes(`Success! App '${target.appId}' fully installed.`) && !output.includes(`Success! App '${target.appId}' already up to date.`)) throw new Error("SteamCMD did not confirm a complete installation");
      }
      restoreInstallationLinks(detachedLinks);
    } else {
      if (!previous) throw new Error("Rollback installation is unavailable");
    }
    phase("validating", job.key === "xonotic" ? "Checking reviewed Xonotic native bytes and host libraries" : target.strategy === "reviewed-cmake-source" ? "Checking reviewed fgms relay and host libraries" : target.strategy === "reviewed-dotnet-source" ? "Checking reviewed patched RimWorld binary, upstream license and host libraries" : target.strategy === "reviewed-distro-native" ? "Checking reviewed native package, root ownership and host libraries" : job.key === "terraria" ? "Checking reviewed Terraria Linux package and runtime dependencies" : job.key === "factorio" ? "Checking Factorio headless executable, base data and package integrity" : target.strategy === "github-native-binaries" ? "Checking reviewed native executables without replacing server data" : ["github-appimage", "signed-appimage"].includes(target.strategy) ? "Checking official AppImage installation integrity and version" : target.strategy === "github-jar" ? "Checking JAR integrity, server version and Java compatibility" : "Checking Steam manifest and required executables");
    const prepared = job.action === "update" ? stage : previous;
    const verified = verifyInstallation(prepared, job.key);
    if (job.action === "update" && target.appId && (original.branch || "public") !== (verified.branch || "public")) {
      throw new Error("SteamCMD changed the installed branch; activation was refused");
    }
    if (job.key === "openra") validateOpenRABaseline(prepared);
    if (await scan(job.key, gamesRoot)) throw new Error("An affected process appeared; activation was refused");
    if (fs.existsSync(backup)) throw new Error("Rollback destination already exists");
    phase("activating", "Activating verified installation", { afterBuild: verified.buildId });
    if (target.component) fs.mkdirSync(backup, { mode: 0o700 });
    const preparedPath = target.component ? path.join(prepared, target.component) : prepared;
    fs.renameSync(activePath, backupPath);
    try { fs.renameSync(preparedPath, activePath); }
    catch (error) { fs.renameSync(backupPath, activePath); throw error; }
    activated = true;
    verifyInstallation(current, job.key);
    prepareInstallationLinks(backup, current);
    if (job.action === "rollback") {
      const source = store.read(job.rollbackId);
      store.write({ ...source, rollbackConsumed: true });
    }
    phase("completed", target.strategy === "reviewed-component" ? "Reviewed engine ready. Saved worlds, accounts, Lua scripts, profiles and game data were not changed. New engine/data versions require a reviewed compatibility profile." : job.key === "unvanquished" ? "Reviewed Unvanquished engine and game packages ready. Private settings, custom maps and per-server data were retained. Clients must use a compatible release; new package versions require review." : job.key === "wolfenstein-enemy-territory" ? "Reviewed ET Legacy engine, server mod and bot assets ready. Original assets, maps, generated bot configuration and per-server data were retained. New releases require a reviewed package profile." : job.key === "xonotic" ? "Reviewed Xonotic 0.8.6 engine ready. Existing data, maps and server configuration were retained; new engine/data versions require compatibility review." : target.strategy === "reviewed-cmake-source" ? "Reviewed fgms relay ready. Existing configuration and logs were retained; new source/compiler versions require compatibility review."
      : target.strategy === "reviewed-dotnet-source" ? "Reviewed RimWorld Together build ready. PlayBound management/tracking and per-server data were retained. New source, SDK, dependencies or client versions require review; binary rollback does not reverse colony migrations."
      : target.strategy === "reviewed-distro-native" ? "Reviewed native server ready. Operating-system packages and saved data were not changed. New package versions require compatibility review."
      : job.key === "terraria" ? "Reviewed Terraria Linux installation ready. Saved worlds were not changed. New server versions require a new reviewed package and matching client/world compatibility checks."
      : job.key === "factorio"
      ? "Factorio installation ready. Saved worlds were not changed. Back up the world before starting a newer version: binary rollback does not restore or guarantee compatibility with older save formats."
      : job.key === "barotrauma" ? "Installation ready. Private runtimes refresh on their next start, retaining current saves and the previous runtime. Binary rollback does not restore or guarantee compatibility with older save formats."
      : "Installation ready. Servers may be started normally; no game was stopped by this update.");
  } catch (error) {
    // Once activation began, uncertainty must keep starts blocked for inspection.
    const uncertain = activated || (job.status === "activating" && !fs.existsSync(activePath));
    phase(uncertain ? "interrupted" : "failed", uncertain
      ? "Activation needs operator inspection. New starts remain blocked; the rollback copy is retained."
      : error instanceof Error && /^(Reviewed component|Not enough|An affected|Unvanquished|OpenMoHAA|ET Legacy|FlightGear|RimWorld|Xonotic|Native package|Legacy|SteamCMD|Mindustry|OpenRA|OpenHV|OpenE2140|Hypersomnia|AssaultCube|Factorio|Terraria|Update command|Update stopped|Cannot verify|Barotrauma|Unexpected Barotrauma|Invalid Barotrauma)/.test(error.message)
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
