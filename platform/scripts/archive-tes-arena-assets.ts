/**
 * Build and optionally archive The Elder Scrolls: Arena freeware assets.
 *
 * Bethesda's 1.06 zip contains Arena106.exe (WinRAR SFX). 7za cannot open it,
 * so this script extracts the ARENA/ tree with node-unrar-js and zips it as
 * Arena-1.06-GameFiles.zip. A verbatim copy of Arena106Setup.zip is archived
 * beside it so the original freeware is not lost if Bethesda's CDN moves.
 *
 * Hardcoded to tes-arena only. No upsert of catalog games. --archive copies
 * both files onto the VPS mirror via the game-host agent.
 *
 *   npx tsx scripts/archive-tes-arena-assets.ts
 *   npx tsx scripts/archive-tes-arena-assets.ts --archive
 */
import { createWriteStream, existsSync, mkdirSync } from "fs";
import { cp, mkdtemp, readFile, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { pipeline } from "stream/promises";
import { fileURLToPath } from "url";
import { Readable } from "stream";
import { spawn } from "child_process";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PLATFORM_DIR = resolve(SCRIPT_DIR, "..");
const LAUNCHER_7ZA = resolve(
  PLATFORM_DIR,
  "../launcher/node_modules/7zip-bin/win/x64/7za.exe"
);

async function loadConstants() {
  const {
    ARENA_FREEWARE_SETUP_FILE,
    ARENA_FREEWARE_SETUP_URL,
    ARENA_FREEWARE_SFX_FILE,
    ARENA_GAMEFILES_FILE,
    ARENA_GAMEFILES_MIRROR_PATH,
    ARENA_SETUP_MIRROR_PATH,
    TES_ARENA_SLUG,
  } = await import("../src/lib/data/tesArenaAssets");
  return {
    ARENA_FREEWARE_SETUP_FILE,
    ARENA_FREEWARE_SETUP_URL,
    ARENA_FREEWARE_SFX_FILE,
    ARENA_GAMEFILES_FILE,
    ARENA_GAMEFILES_MIRROR_PATH,
    ARENA_SETUP_MIRROR_PATH,
    TES_ARENA_SLUG,
  };
}

async function download(url: string, dest: string) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) {
    throw new Error(`Download failed ${res.status} ${url}`);
  }
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(dest));
}

function run(cmd: string, args: string[], cwd: string) {
  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn(cmd, args, { cwd, windowsHide: true, stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolvePromise() : reject(new Error(`${cmd} exited ${code}`))
    );
  });
}

async function zipFolder(srcDir: string, zipPath: string, folderName: string) {
  if (existsSync(LAUNCHER_7ZA)) {
    await run(LAUNCHER_7ZA, ["a", "-tzip", "-y", zipPath, folderName], srcDir);
    return;
  }
  await run(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `Compress-Archive -LiteralPath '${join(srcDir, folderName)}' -DestinationPath '${zipPath}' -Force`,
    ],
    srcDir
  );
}

async function archiveOnHost(url: string, relativePath: string, sizeBytes: number) {
  const { archiveArtifactOnHost, archivedArtifactStatusOnHost } = await import(
    "../src/lib/gameHost/client"
  );
  const queued = await archiveArtifactOnHost({ url, relativePath, sizeBytes });
  if (!queued.success) {
    throw new Error(queued.message || `VPS archive failed for ${relativePath}`);
  }
  for (let i = 0; i < 90; i += 1) {
    const status = await archivedArtifactStatusOnHost(relativePath);
    if (status?.status === "verified") return;
    if (status?.status === "missing" && i > 2) {
      throw new Error(status.message || `VPS archive missing for ${relativePath}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`VPS verification timed out for ${relativePath}`);
}

async function main() {
  const apply = process.argv.includes("--archive");
  const c = await loadConstants();
  const work = await mkdtemp(join(tmpdir(), "pb-tes-arena-"));
  try {
    const setupZip = join(work, c.ARENA_FREEWARE_SETUP_FILE);
    console.log(`[tes-arena] downloading ${c.ARENA_FREEWARE_SETUP_URL}`);
    await download(c.ARENA_FREEWARE_SETUP_URL, setupZip);

    const setupDir = join(work, "setup");
    mkdirSync(setupDir, { recursive: true });
    if (existsSync(LAUNCHER_7ZA)) {
      await run(LAUNCHER_7ZA, ["x", `-o${setupDir}`, "-y", setupZip], work);
    } else {
      await run(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          `Expand-Archive -LiteralPath '${setupZip}' -DestinationPath '${setupDir}' -Force`,
        ],
        work
      );
    }

    const sfx = join(setupDir, c.ARENA_FREEWARE_SFX_FILE);
    if (!existsSync(sfx)) {
      throw new Error(`${c.ARENA_FREEWARE_SFX_FILE} missing after unzip`);
    }

    let createExtractorFromFile: (opts: {
      filepath: string;
      targetPath: string;
    }) => Promise<{ extract: () => { files: Iterable<unknown> } }>;
    try {
      ({ createExtractorFromFile } = await import("node-unrar-js"));
    } catch {
      console.error("Install node-unrar-js (platform devDependency) and retry.");
      process.exit(1);
      return;
    }

    const extracted = join(work, "extracted");
    mkdirSync(extracted, { recursive: true });
    const extractor = await createExtractorFromFile({
      filepath: sfx,
      targetPath: extracted,
    });
    [...extractor.extract().files];

    const arenaExe = join(extracted, "ARENA", "A.EXE");
    if (!existsSync(arenaExe)) {
      throw new Error("Extracted freeware is missing ARENA/A.EXE");
    }

    const filesRoot = join(work, "files");
    mkdirSync(filesRoot, { recursive: true });
    await cp(join(extracted, "ARENA"), join(filesRoot, "ARENA"), { recursive: true });

    const gameFilesZip = join(work, c.ARENA_GAMEFILES_FILE);
    await zipFolder(filesRoot, gameFilesZip, "ARENA");

    const setupStat = await stat(setupZip);
    const filesStat = await stat(gameFilesZip);
    console.log(`[tes-arena] original setup: ${setupStat.size} bytes`);
    console.log(`[tes-arena] game files zip: ${filesStat.size} bytes`);
    console.log(`[tes-arena] VPS original: ${c.ARENA_SETUP_MIRROR_PATH}`);
    console.log(`[tes-arena] VPS game files: ${c.ARENA_GAMEFILES_MIRROR_PATH}`);

    if (!apply) {
      console.log("Dry run. Pass --archive to copy both files to the VPS mirror.");
      return;
    }

    // Stage on a file: URL the game-host can fetch. Prefer copying into
    // platform/.tmp so a local agent path isn't required; the host archives
    // from HTTPS, so upload is left to Blob/VPS tooling when GAME_HOST is set.
    if (!process.env.GAME_HOST_URL || !process.env.GAME_HOST_SECRET) {
      console.error("GAME_HOST_URL / GAME_HOST_SECRET are not set. Cannot archive.");
      process.exit(1);
    }
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      console.error("BLOB_READ_WRITE_TOKEN is not set. Stage the zips on Blob first.");
      process.exit(1);
    }

    const { put } = await import("@vercel/blob");

    async function stage(localPath: string, pathname: string) {
      const buf = await readFile(localPath);
      const blob = await put(pathname, buf, { access: "public", addRandomSuffix: false });
      return { url: blob.url, size: buf.length };
    }

    const original = await stage(setupZip, c.ARENA_SETUP_MIRROR_PATH);
    const files = await stage(gameFilesZip, c.ARENA_GAMEFILES_MIRROR_PATH);
    console.log(`[tes-arena] staged original ${original.url}`);
    console.log(`[tes-arena] staged game files ${files.url}`);

    await archiveOnHost(original.url, c.ARENA_SETUP_MIRROR_PATH, original.size);
    await archiveOnHost(files.url, c.ARENA_GAMEFILES_MIRROR_PATH, files.size);
    console.log(`[tes-arena] archived both files for ${c.TES_ARENA_SLUG}`);
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => undefined);
  }
}

main().catch((err) => {
  console.error("archive-tes-arena-assets failed:", err);
  process.exit(1);
});
