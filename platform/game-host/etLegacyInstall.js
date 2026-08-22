/**
 * ET: Legacy dedicated install repair — mirrors launcher maybeRepairWolfensteinEtInstall.
 */

import fs from "node:fs";
import {
  access,
  chmod,
  cp,
  mkdir,
  readdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

export const ET_SLUG = "wolfenstein-enemy-territory";
export const ET_OVERLAY_URL =
  process.env.ET_LEGACY_OVERLAY_URL ||
  "https://mt8u2b96lweefbpb.public.blob.vercel-storage.com/launcher-packages/games/wolfenstein-enemy-territory/ET-260b-Base-Data.zip";

const PAK_FILES = ["pak0.pk3", "pak1.pk3", "pak2.pk3"];
const BINARY_NAMES = ["etlded", "etlded.x86_64", "etl.x86_64.ded"];

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
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

async function download(url, dest) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30 * 60 * 1000) });
  if (!res.ok || !res.body) {
    throw new Error(`Download failed ${res.status} for ${url}`);
  }
  await mkdir(path.dirname(dest), { recursive: true });
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

async function extractZip(zipPath, destDir) {
  await mkdir(destDir, { recursive: true });
  await run("unzip", ["-qo", zipPath, "-d", destDir]);
}

async function flattenSingleRoot(extractDir) {
  const entries = await readdir(extractDir, { withFileTypes: true });
  if (entries.length !== 1 || !entries[0].isDirectory()) return extractDir;
  return path.join(extractDir, entries[0].name);
}

/**
 * Promote nested etlegacy folder, move loose paks into etmain/.
 * @param {string} gameDir
 */
export async function repairEtLegacyLayout(gameDir) {
  if (!(await exists(gameDir))) return;

  const entries = await readdir(gameDir).catch(() => []);
  const nestedEtl = entries.find((n) => /^etlegacy/i.test(n));
  if (nestedEtl) {
    const nestedPath = path.join(gameDir, nestedEtl);
    try {
      const st = await stat(nestedPath);
      if (st.isDirectory()) {
        const inner = await readdir(nestedPath);
        for (const item of inner) {
          const src = path.join(nestedPath, item);
          const dst = path.join(gameDir, item);
          if (!(await exists(dst))) {
            await rename(src, dst).catch(() => {});
          } else {
            const srcSt = await stat(src).catch(() => null);
            const dstSt = await stat(dst).catch(() => null);
            if (srcSt?.isDirectory() && dstSt?.isDirectory()) {
              const subItems = await readdir(src);
              for (const sub of subItems) {
                const subSrc = path.join(src, sub);
                const subDst = path.join(dst, sub);
                if (!(await exists(subDst))) {
                  await rename(subSrc, subDst).catch(() => {});
                }
              }
            }
          }
        }
        await rm(nestedPath, { recursive: true, force: true }).catch(() => {});
      }
    } catch {
      /* ignore */
    }
  }

  const etmainDir = path.join(gameDir, "etmain");
  await mkdir(etmainDir, { recursive: true });

  for (const pak of PAK_FILES) {
    const loosePak = path.join(gameDir, pak);
    const targetPak = path.join(etmainDir, pak);
    if ((await exists(loosePak)) && !(await exists(targetPak))) {
      await rename(loosePak, targetPak).catch(() => {});
    }
  }
}

/**
 * @param {string} gameDir
 * @returns {{ ok: boolean, missing: string[] }}
 */
export function verifyEtLegacyReady(gameDir) {
  const missing = [];
  if (!fs.existsSync(gameDir)) {
    return { ok: false, missing: ["game directory"] };
  }

  let hasBinary = false;
  for (const name of BINARY_NAMES) {
    if (fs.existsSync(path.join(gameDir, name))) {
      hasBinary = true;
      break;
    }
  }
  if (!hasBinary) missing.push("etlded");

  if (!fs.existsSync(path.join(gameDir, "etmain", "pak0.pk3"))) {
    missing.push("etmain/pak0.pk3");
  }

  return { ok: missing.length === 0, missing };
}

/**
 * Download overlay when pak0.pk3 is missing.
 * @param {string} gameDir
 * @param {string} [overlayUrl]
 */
export async function ensureEtLegacyOverlay(gameDir, overlayUrl = ET_OVERLAY_URL) {
  const pak0 = path.join(gameDir, "etmain", "pak0.pk3");
  if (await exists(pak0)) return;

  const work = path.join("/tmp", `pb-et-overlay-${Date.now()}`);
  try {
    const overlayZip = path.join(work, "overlay.zip");
    await mkdir(work, { recursive: true });
    console.log("[et] downloading etmain overlay (pak0 missing)…");
    await download(overlayUrl, overlayZip);
    const overlayExtract = path.join(work, "extract");
    await extractZip(overlayZip, overlayExtract);
    const overlayDir = path.join(gameDir, "etmain");
    await mkdir(overlayDir, { recursive: true });
    const overlayRoot = await flattenSingleRoot(overlayExtract);
    const nested = path.join(overlayRoot, "etmain");
    const from = (await exists(nested)) ? nested : overlayRoot;
    await cp(from, overlayDir, { recursive: true, force: true });
    await repairEtLegacyLayout(gameDir);
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Full repair: overlay if needed, layout fix, chmod binaries.
 * @param {string} gameDir
 */
export async function prepareEtLegacyInstall(gameDir) {
  await mkdir(gameDir, { recursive: true });
  await ensureEtLegacyOverlay(gameDir);
  await repairEtLegacyLayout(gameDir);
  for (const name of BINARY_NAMES) {
    const p = path.join(gameDir, name);
    if (await exists(p)) {
      await chmod(p, 0o755).catch(() => {});
    }
  }
  return verifyEtLegacyReady(gameDir);
}
