/**
 * Download + extract dedicated game binaries on the VPS when a recipe is
 * hostable but the binary is missing. Used by:
 *   - POST /ensure-missing (Vercel deploy / cron)
 *   - startRoom() before failing with "does not have X yet"
 *
 * Keep URLs in sync with install.sh. Full bootstrap (apt, ufw, systemd) still
 * requires install.sh over SSH — this only fills missing game trees.
 */

import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import {
  access,
  chmod,
  cp,
  mkdir,
  readdir,
  rm,
  symlink,
} from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { resolveRecipe } from "./recipes.js";
import {
  ET_SLUG,
  prepareEtLegacyInstall,
  verifyEtLegacyReady,
} from "./etLegacyInstall.js";

const GAMES_ROOT = process.env.GAME_HOST_GAMES_DIR || "/opt/playbound-host/games";

/**
 * @typedef {{
 *   archiveUrl: string,
 *   overlayUrl?: string,
 *   overlayDest?: string,
 *   binaryNames: string[],
 *   linkAs?: string,
 * }} EnsureSpec
 */

/** @type {Record<string, EnsureSpec>} */
const ENSURE_SPECS = {
  "wolfenstein-enemy-territory": {
    // Linux x86_64 archive — file id bumps on new ET: Legacy releases.
    archiveUrl:
      process.env.ET_LEGACY_LINUX_URL || "https://www.etlegacy.com/download/file/728",
    overlayUrl:
      process.env.ET_LEGACY_OVERLAY_URL ||
      "https://mt8u2b96lweefbpb.public.blob.vercel-storage.com/launcher-packages/games/wolfenstein-enemy-territory/ET-260b-Base-Data.zip",
    overlayDest: "etmain",
    binaryNames: ["etlded", "etlded.x86_64", "etl.x86_64.ded"],
    linkAs: "etlded",
  },
  xonotic: {
    archiveUrl: process.env.XONOTIC_URL || "https://dl.xonotic.org/xonotic-0.8.6.zip",
    binaryNames: ["xonotic-linux64-dedicated", "xonotic-dedicated"],
  },
  freedoom: {
    archiveUrl:
      process.env.ZANDRONUM_LINUX_URL ||
      "https://zandronum.com/downloads/zandronum3.2-linux-x86_64.tar.bz2",
    overlayUrl:
      process.env.FREEDOOM_IWADS_URL ||
      "https://github.com/freedoom/freedoom/releases/download/v0.13.0/freedoom-0.13.0.zip",
    overlayCheckFile: "freedoom2.wad",
    binaryNames: ["zandronum-server", "odasrv", "odamex-server", "chocolate-server"],
    linkAs: "zandronum-server",
  },
};

export function canEnsure(slug) {
  return Boolean(ENSURE_SPECS[slug]);
}

export function listEnsureableSlugs() {
  return Object.keys(ENSURE_SPECS);
}

/** @type {Map<string, Promise<{ ok: boolean, skipped?: boolean, binary?: string|null, error?: string }>>} */
const inFlight = new Map();

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], ...opts });
    let err = "";
    child.stderr?.on("data", (b) => {
      err += String(b);
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}${err ? `: ${err.slice(0, 300)}` : ""}`));
    });
  });
}

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function download(url, dest) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30 * 60 * 1000) });
  if (!res.ok || !res.body) {
    throw new Error(`Download failed ${res.status} for ${url}`);
  }
  await mkdir(path.dirname(dest), { recursive: true });
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

async function extractArchive(archivePath, destDir) {
  await mkdir(destDir, { recursive: true });
  const lower = archivePath.toLowerCase();
  if (lower.endsWith(".zip")) {
    await run("unzip", ["-qo", archivePath, "-d", destDir]);
    return;
  }
  // tar.gz / .tar.bz2 / .tar.xz / mislabeled archives from Content-Disposition
  try {
    await run("tar", ["-xf", archivePath, "-C", destDir]);
  } catch {
    await run("unzip", ["-qo", archivePath, "-d", destDir]);
  }
}

async function flattenSingleRoot(extractDir) {
  const entries = await readdir(extractDir, { withFileTypes: true });
  if (entries.length !== 1 || !entries[0].isDirectory()) return extractDir;
  return path.join(extractDir, entries[0].name);
}

async function needsOverlay(gameDir, spec) {
  if (spec.overlayCheckFile) {
    return !(await exists(path.join(gameDir, spec.overlayCheckFile)));
  }
  if (spec.overlayDest) {
    const pak0 = path.join(gameDir, "etmain", "pak0.pk3");
    return !(await exists(pak0));
  }
  return false;
}

async function ensureEtLegacyGame(gameDir, spec, work) {
  const before = await verifyEtLegacyReady(gameDir);
  if (before.ok) {
    return { ok: true, skipped: true };
  }

  const hasBinary = await findBinary(gameDir, spec.binaryNames);
  if (!hasBinary) {
    const archivePath = path.join(work, "engine.bin");
    console.log(`[ensure] ${ET_SLUG}: downloading engine…`);
    await download(spec.archiveUrl, archivePath);
    const extractDir = path.join(work, "extract");
    await extractArchive(archivePath, extractDir);
    const root = await flattenSingleRoot(extractDir);
    await cp(root, gameDir, { recursive: true, force: true });

    let binary = await findBinary(gameDir, spec.binaryNames);
    if (binary && spec.linkAs) {
      const linkPath = path.join(gameDir, spec.linkAs);
      if (!(await exists(linkPath))) {
        try {
          await symlink(path.basename(binary), linkPath);
        } catch {
          await cp(binary, linkPath);
        }
      }
    }
  }

  if (spec.overlayUrl && (await needsEtOverlay(gameDir))) {
    console.log(`[ensure] ${ET_SLUG}: downloading etmain assets…`);
    const overlayZip = path.join(work, "overlay.zip");
    await download(spec.overlayUrl, overlayZip);
    const overlayExtract = path.join(work, "overlay");
    await extractArchive(overlayZip, overlayExtract);
    const overlayDir = path.join(gameDir, spec.overlayDest || "etmain");
    await mkdir(overlayDir, { recursive: true });
    const overlayRoot = await flattenSingleRoot(overlayExtract);
    const nested = path.join(overlayRoot, spec.overlayDest || "etmain");
    const from = (await exists(nested)) ? nested : overlayRoot;
    await cp(from, overlayDir, { recursive: true, force: true });
  }

  await prepareEtLegacyInstall(gameDir);
  const after = await verifyEtLegacyReady(gameDir);
  if (!after.ok) {
    return { ok: false, error: `ET install incomplete: missing ${after.missing.join(", ")}` };
  }
  return { ok: true };
}

async function findBinary(dir, names) {
  for (const name of names) {
    const p = path.join(dir, name);
    if (await exists(p)) return p;
  }
  // shallow search one level (some archives nest the engine)
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    for (const name of names) {
      const p = path.join(dir, ent.name, name);
      if (await exists(p)) return p;
    }
  }
  return null;
}

/**
 * Ensure a hostable game's dedicated binary exists. No-op if already installed
 * or if this slug has no ensure recipe.
 *
 * @param {string} slug
 * @returns {Promise<{ ok: boolean, skipped?: boolean, binary?: string|null, error?: string }>}
 */
export async function ensureGame(slug) {
  const existing = inFlight.get(slug);
  if (existing) return existing;

  const run = ensureGameUnlocked(slug);
  inFlight.set(slug, run);
  try {
    return await run;
  } finally {
    inFlight.delete(slug);
  }
}

async function ensureGameUnlocked(slug) {
  const spec = ENSURE_SPECS[slug];
  if (!spec) {
    return { ok: false, error: `No auto-install recipe for ${slug}` };
  }

  const gameDir = path.join(GAMES_ROOT, slug);
  const work = path.join("/tmp", `pb-ensure-${slug}-${Date.now()}`);

  if (slug === ET_SLUG) {
    try {
      await mkdir(gameDir, { recursive: true });
      await mkdir(work, { recursive: true });
      const result = await ensureEtLegacyGame(gameDir, spec, work);
      if (!result.ok) return result;
      const after = resolveRecipe(slug);
      if (!after?.binary) {
        return { ok: false, error: "ET install finished but etlded not found" };
      }
      return { ok: true, skipped: result.skipped, binary: after.binary };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[ensure] ${slug} failed:`, message);
      return { ok: false, error: message };
    } finally {
      await rm(work, { recursive: true, force: true }).catch(() => {});
    }
  }

  const before = resolveRecipe(slug);
  if (before?.binary) {
    return { ok: true, skipped: true, binary: before.binary };
  }

  try {
    await mkdir(gameDir, { recursive: true });
    await mkdir(work, { recursive: true });

    const archivePath = path.join(work, "engine.bin");
    console.log(`[ensure] ${slug}: downloading engine…`);
    await download(spec.archiveUrl, archivePath);

    const extractDir = path.join(work, "extract");
    await extractArchive(archivePath, extractDir);
    const root = await flattenSingleRoot(extractDir);
    await cp(root, gameDir, { recursive: true, force: true });

    let binary = await findBinary(gameDir, spec.binaryNames);
    if (binary && spec.linkAs) {
      const linkPath = path.join(gameDir, spec.linkAs);
      if (!(await exists(linkPath))) {
        try {
          await symlink(path.basename(binary), linkPath);
        } catch {
          await cp(binary, linkPath);
        }
      }
      binary = linkPath;
    }
    if (binary) {
      try {
        await chmod(binary, 0o755);
      } catch {
        /* ignore */
      }
    }

    if (spec.overlayUrl && (await needsOverlay(gameDir, spec))) {
      const destLabel = spec.overlayDest || "game";
      console.log(`[ensure] ${slug}: downloading ${destLabel} assets…`);
      const overlayZip = path.join(work, "overlay.zip");
      await download(spec.overlayUrl, overlayZip);
      const overlayExtract = path.join(work, "overlay");
      await extractArchive(overlayZip, overlayExtract);
      const overlayDir = spec.overlayDest
        ? path.join(gameDir, spec.overlayDest)
        : gameDir;
      await mkdir(overlayDir, { recursive: true });
      const overlayRoot = await flattenSingleRoot(overlayExtract);
      const nested = spec.overlayDest
        ? path.join(overlayRoot, spec.overlayDest)
        : overlayRoot;
      const from = (await exists(nested)) ? nested : overlayRoot;
      await cp(from, overlayDir, { recursive: true, force: true });
    }

    const after = resolveRecipe(slug);
    if (!after?.binary) {
      return {
        ok: false,
        error: `Downloaded ${slug} but could not find ${spec.binaryNames.join(" / ")}`,
      };
    }
    console.log(`[ensure] ${slug}: ready at ${after.binary}`);
    return { ok: true, binary: after.binary };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ensure] ${slug} failed:`, message);
    return { ok: false, error: message };
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Ensure every missing ensureable slug. Skips games that are already installed
 * or have no auto-install recipe.
 */
export async function ensureMissingGames() {
  const { listGameHostStatus } = await import("./recipes.js");
  const status = listGameHostStatus();
  const results = {};
  for (const slug of listEnsureableSlugs()) {
    const entry = status[slug];
    if (entry?.ready) {
      results[slug] = { ok: true, skipped: true };
      continue;
    }
    results[slug] = await ensureGame(slug);
  }
  return results;
}
