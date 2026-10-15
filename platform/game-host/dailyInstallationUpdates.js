import fs from "node:fs";
import path from "node:path";
import { INSTALLATION_TARGETS } from "./installationTargets.js";
import { readRelease } from "./githubReleaseAssets.js";
import { runCommand } from "./installationUpdateWorker.js";
import { ETLEGACY_RELEASES } from "./etlegacyUpdates.js";
import { OPENMOHAA_RELEASE } from "./openmohaaUpdates.js";
import { UNVANQUISHED_RELEASES } from "./unvanquishedUpdates.js";
import { REVIEWED_COMPONENTS } from "./reviewedComponentUpdates.js";
import { PAIRED_RUNTIMES } from "./pairedRuntimeUpdates.js";
import { REVIEWED_JAVA } from "./reviewedJavaUpdates.js";

const DAY = 24 * 60 * 60_000;
const RELEASES = {
  mindustry: ["Anuken/Mindustry", /^v\d+(?:\.\d+)*$/],
  openra: ["OpenRA/OpenRA", /^release-\d{8}$/],
  openhv: ["OpenHV/OpenHV", /^\d{8}$/],
  "earth-2140-trilogy": ["OpenE2140/OpenE2140", /^release-\d{8}$/],
  openmohaa: ["openmoh/openmohaa", /^v\d+\.\d+\.\d+$/],
  unvanquished: ["Unvanquished/Unvanquished", /^v\d+\.\d+\.\d+$/],
  morrowind: ["TES3MP/TES3MP", /^tes3mp-\d+\.\d+\.\d+$/],
};
export const automaticInstallationUpdate = (key) => Boolean(INSTALLATION_TARGETS[key]?.appId || RELEASES[key] || PAIRED_RUNTIMES[key] || REVIEWED_JAVA[key] || ["factorio", "hypersomnia", "wolfenstein-enemy-territory", "re-volt-rvgl"].includes(key));

// Parse only quoted VDF keys/values and braces. Never confuse a beta/depot's
// build with depots.branches.public.buildid, even when it appears first.
export function steamPublicBuild(output, appId) {
  if (output.length > 4 * 1024 ** 2) throw new Error("Steam metadata exceeds its size limit");
  const start = output.indexOf(`"${appId}"`);
  if (start < 0) throw new Error("Steam did not return app metadata");
  const tokens = output.slice(start).match(/"(?:[^"\\]|\\.)*"|[{}]/g) || [];
  let index = 1;
  function object(depth = 0) {
    if (depth > 32 || tokens[index++] !== "{") throw new Error("Steam metadata is invalid");
    const value = Object.create(null);
    while (index < tokens.length && tokens[index] !== "}") {
      const key = tokens[index++];
      if (!key?.startsWith('"')) throw new Error("Steam metadata is invalid");
      const name = JSON.parse(key);
      if (Object.hasOwn(value, name)) throw new Error("Steam metadata has duplicate keys");
      value[name] = tokens[index] === "{" ? object(depth + 1) : JSON.parse(tokens[index++]);
    }
    if (tokens[index++] !== "}") throw new Error("Steam metadata is incomplete");
    return value;
  }
  const build = object().depots?.branches?.public?.buildid;
  if (!/^\d{1,20}$/.test(build || "")) throw new Error("Steam public build is unavailable");
  return build;
}

async function boundedText(url, request, limit = 16_384) {
  const response = await request(url, { redirect: "error", signal: AbortSignal.timeout(30_000), headers: { "User-Agent": "PlayBound-game-host" } });
  if (!response.ok || !response.body) throw new Error("Official release feed is unavailable");
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    if ((size += chunk.length) > limit) throw new Error("Official release metadata is too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString();
}

export async function latestInstallationBuild(key, { request = fetch, run = runCommand, steamHome } = {}) {
  const target = INSTALLATION_TARGETS[key];
  if (target?.appId) {
    if (!steamHome) throw new Error("Isolated Steam metadata home is required");
    fs.mkdirSync(steamHome, { recursive: true, mode: 0o700 });
    const output = await run("/usr/bin/env", ["-i", "PATH=/usr/local/bin:/usr/bin:/bin:/usr/games", "LANG=C.UTF-8", `HOME=${steamHome}`, `XDG_DATA_HOME=${path.join(steamHome, ".local/share")}`, "/usr/games/steamcmd", "+login", "anonymous", "+app_info_update", "1", "+app_info_print", String(target.appId), "+quit"], { timeout: 120_000, maxOutput: 4 * 1024 ** 2 });
    return steamPublicBuild(output, target.appId);
  }
  if (RELEASES[key]) {
    const [repository, tag] = RELEASES[key];
    const release = await readRelease(repository, { request, signal: AbortSignal.timeout(30_000), label: target.name });
    if (release.draft !== false || release.prerelease !== false || !tag.test(release.tag_name || "")) throw new Error("Official release is not a stable supported build");
    return key === "morrowind" ? release.tag_name.slice(7) : ["mindustry", "openmohaa", "unvanquished"].includes(key) ? release.tag_name.slice(1) : release.tag_name;
  }
  if (REVIEWED_JAVA[key]) {
    const profile = REVIEWED_JAVA[key];
    const release = await readRelease(profile.repository, { request, signal: AbortSignal.timeout(30_000), label: target.name });
    const validTag = key === "ysoccer" ? release.tag_name === "ysoccer-online-latest" : /^\d{4}-\d{2}\.\d+\.\d+$/.test(release.tag_name || "");
    const assets = release.assets?.filter(row => row.name === (key === "ysoccer" ? "ysoccer-server.jar" : "game-headless.zip"));
    const asset = assets?.length === 1 ? assets[0] : null;
    if (release.draft !== false || release.prerelease !== false || !validTag || !asset || !/^sha256:[a-f0-9]{64}$/.test(asset.digest || "")
      || !Number.isSafeInteger(asset.size) || asset.size < 1 || asset.size > 128 * 1024 ** 2
      || asset.browser_download_url !== `https://github.com/${profile.repository}/releases/download/${release.tag_name}/${asset.name}`) throw new Error("Java dedicated release metadata is invalid");
    return key === "ysoccer" ? asset.digest.replace(":", "-") : release.tag_name;
  }
  if (key === "factorio") {
    const version = JSON.parse(await boundedText("https://factorio.com/api/latest-releases", request)).stable?.headless;
    if (!/^\d+\.\d+\.\d+$/.test(version || "")) throw new Error("Factorio stable version is invalid");
    return version;
  }
  if (key === "re-volt-rvgl") {
    const page = await boundedText("https://rvgl.org/", request, 128 * 1024);
    const version = page.match(/Current version:\s*(?:<[^>]+>\s*)*(\d{2}\.\d{4}[a-z]\d+)\b/)?.[1];
    if (!version) throw new Error("RVGL official version metadata is unavailable");
    return version;
  }
  if (key === "bombsquad") {
    const page = await boundedText("https://ballistica.net/downloads", request, 256 * 1024);
    const versions = [...page.matchAll(/https:\/\/files\.ballistica\.net\/bombsquad\/builds\/BombSquad_Server_Linux_x86_64_(\d+\.\d+\.\d+(?:a\d+)?)\.tar\.gz/g)].map(match => match[1]);
    if (new Set(versions).size !== 1) throw new Error("BombSquad official release metadata is ambiguous or missing");
    return versions[0];
  }
  if (key === "veloren") {
    const release = JSON.parse(await boundedText("https://api.github.com/repos/veloren/veloren/releases/tags/weekly", request, 4 * 1024 ** 2));
    if (release.draft !== false || release.tag_name !== "weekly" || !Array.isArray(release.assets)) throw new Error("Veloren weekly channel metadata is invalid");
    const names = release.assets.map(row => row.name).filter(name => /^weekly-linux-x86_64-\d{4}-\d{2}-\d{2}T\d{2}_\d{2}\.zip$/.test(name || "")).sort();
    if (!names.length) throw new Error("Veloren weekly Linux package is unavailable");
    return names.at(-1);
  }
  if (key === "wolfenstein-enemy-territory") {
    const page = await boundedText("https://www.etlegacy.com/download", request, 128 * 1024);
    const version = page.match(/ET: Legacy stable release (\d+\.\d+\.\d+)\s*-/)?.[1];
    if (!version) throw new Error("ET Legacy stable release metadata is unavailable");
    return version;
  }
  if (key === "hypersomnia") {
    const version = (await boundedText("https://hypersomnia.io/builds/latest/version-Headless-AppImage.txt", request)).split(/\r?\n/)[0];
    if (!/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(version)) throw new Error("Hypersomnia version is invalid");
    // Discovery is advisory; the worker verifies the artifact's upstream signature.
    return version;
  }
  throw new Error("New versions require a reviewed installation profile");
}

function newer(next, current) {
  const numbers = (value) => value.replace(/^release-/, "").split(".").map((part) => BigInt(part));
  try {
    const a = numbers(next), b = numbers(current);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if ((a[i] || 0n) !== (b[i] || 0n)) return (a[i] || 0n) > (b[i] || 0n);
    }
    return false;
  } catch { throw new Error("Installed and upstream versions cannot be safely compared"); }
}

// One persisted report, not one test/result row per poll. The agent is the
// always-on scheduler; restart catches up a missed check without duplicate jobs.
export function createDailyInstallationUpdates({ stateDir, coordinator, latest = (key) => latestInstallationBuild(key, { steamHome: path.join(stateDir, "release-check-steam") }), now = Date.now }) {
  const filename = path.join(stateDir, "daily-installation-updates.json");
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  let running = false;
  function snapshot() {
    if (!fs.existsSync(filename)) return { enabled: true, nextCheckAt: 0, targets: {} };
    const report = JSON.parse(fs.readFileSync(filename, "utf8"));
    if (report.version !== 1 || !report.targets || typeof report.targets !== "object") throw new Error("Daily update state needs inspection");
    return report;
  }
  function save(report) {
    const temp = `${filename}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify({ ...report, version: 1 }), { mode: 0o600 });
    fs.renameSync(temp, filename);
  }
  async function tick() {
    if (running) return;
    const previous = snapshot();
    const due = previous.startedAt && !previous.completedAt
      ? Math.min(previous.nextCheckAt, previous.startedAt + 60 * 60_000) : previous.nextCheckAt;
    if (due > now()) return;
    running = true;
    const report = { enabled: true, startedAt: now(), nextCheckAt: now() + DAY, targets: { ...previous.targets } };
    save(report);
    try {
      // Metadata SteamCMD and installation SteamCMD share a cache. Do not run
      // either concurrently; updates can still be queued while checking feeds.
      await coordinator.withMetadataCheck(async () => {
        const inventory = coordinator.snapshot();
        for (const target of inventory.targets) {
          const reviewedPackage = REVIEWED_JAVA[target.key] || PAIRED_RUNTIMES[target.key];
          const old = previous.targets[target.key];
          const row = { checkedAt: now(), installedBuild: target.buildId,
            lastAttemptBuild: old?.lastAttemptBuild, jobId: old?.jobId };
          report.targets[target.key] = row;
          try {
            if (target.branch && target.branch !== "public") {
              row.status = "review_required";
              row.message = "Non-public Steam branch: automatic updates will not switch the installed channel.";
            } else if (!automaticInstallationUpdate(target.key)) {
              row.status = "review_required";
              row.message = "Pinned/custom build: new upstream versions need a reviewed handler before automatic installation.";
            } else if (!target.installed || target.blockedReason) {
              row.status = "unavailable";
              row.message = target.blockedReason || "Installation missing or incomplete; automatic installation is paused.";
            } else {
              row.availableBuild = await latest(target.key);
              if (REVIEWED_COMPONENTS[target.key]) {
                row.status = row.availableBuild === target.buildId ? "up_to_date" : "review_required";
                if (row.status === "review_required") row.message = "New engine release requires matching game data, scripts, dependencies and a reviewed checksum profile. Existing files remain unchanged.";
              } else if (reviewedPackage && row.availableBuild === target.buildId) row.status = "up_to_date";
              else if (reviewedPackage && row.availableBuild !== reviewedPackage.latest) {
                row.status = "review_required"; row.message = PAIRED_RUNTIMES[target.key] ? "New paired package needs reviewed controller/engine/assets compatibility and checksums; the installed runtime is unchanged." : "New Java server package needs reviewed runtime/client compatibility and checksums; the installation is unchanged.";
              } else if (!reviewedPackage && !newer(row.availableBuild, target.buildId)) row.status = "up_to_date";
              else if (target.key === "unvanquished" && row.availableBuild !== UNVANQUISHED_RELEASES.latest) {
                row.status = "review_required"; row.message = "New Unvanquished version needs reviewed engine/sandbox/game package compatibility and checksums.";
              } else if (target.key === "openmohaa" && row.availableBuild !== OPENMOHAA_RELEASE.version) {
                row.status = "review_required"; row.message = "New OpenMoHAA release needs reviewed engine/module compatibility and checksums.";
              } else if (target.key === "wolfenstein-enemy-territory" && row.availableBuild !== ETLEGACY_RELEASES.latest) {
                row.status = "review_required"; row.message = "New ET Legacy package needs a reviewed engine/mod/bot compatibility profile.";
              } else if (target.key === "factorio" && row.availableBuild.split(".")[0] !== target.buildId.split(".")[0]) {
                row.status = "review_required"; row.message = "Major Factorio upgrade requires world compatibility review.";
              } else {
                const job = old?.jobId && coordinator.snapshot().jobs.find((job) => job.id === old.jobId);
                // A cancellation, rollback or failed build must not get silently
                // reapplied every day. A new upstream build permits a new attempt.
                if (old?.lastAttemptBuild === row.availableBuild && old.jobId
                  && (!job || ["failed", "cancelled", "completed"].includes(job.status))) {
                  row.status = "review_required"; row.jobId = old.jobId;
                  row.message = "This build was already attempted or cancelled. Use Queue update to retry deliberately.";
                } else {
                  const queued = coordinator.queue(target.key, "update", "daily-updater");
                  row.jobId = queued.id; row.lastAttemptBuild = row.availableBuild; row.status = "queued";
                  row.message = "Update queued; activation waits for all affected servers to stop.";
                }
              }
            }
          } catch {
            row.status = "check_failed";
            row.message = "Could not verify the release or queue its update; existing files are unchanged. Next daily check will retry.";
          }
          save(report);
        }
      });
      report.completedAt = now();
    } catch {
      report.message = "Installation maintenance is active; daily release checks will retry in one hour.";
      report.nextCheckAt = now() + 60 * 60_000;
    } finally { save(report); running = false; }
  }
  return { tick, snapshot };
}
