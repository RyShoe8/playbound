/**
 * Upload PlayBound Setup + electron-updater metadata to Vercel Blob.
 *
 * Usage (from platform/):
 *   npx vercel env pull .env.local --environment=production
 *   cd ../launcher && npm run dist
 *   npm run upload:launcher -- ../launcher/dist/PlayBound-Setup-0.1.5.exe
 *
 * Uploads:
 *   - versioned Setup.exe (as named in latest.yml)
 *   - latest.yml + .blockmap (for in-app auto-update)
 *   - stable alias launcher/PlayBound-Launcher-Setup.exe (site download button)
 */
import { readFileSync, existsSync, readdirSync } from "fs";
import { basename, dirname, resolve } from "path";
import { loadEnvConfig } from "@next/env";
import { put } from "@vercel/blob";

loadEnvConfig(process.cwd());

async function uploadBlob(pathname: string, filePath: string, contentType: string) {
  const bytes = readFileSync(filePath);
  console.log(`  ${pathname} (${(bytes.length / 1024 / 1024).toFixed(2)} MB)`);
  const blob = await put(pathname, bytes, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType,
    multipart: bytes.length > 4 * 1024 * 1024,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  return blob.url;
}

async function main() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    console.error("BLOB_READ_WRITE_TOKEN is not set. Pull env with: npx vercel env pull");
    process.exit(1);
  }

  const argPath = process.argv[2];
  const distDir = resolve(process.cwd(), "../launcher/dist");
  let setupPath = argPath ? resolve(argPath) : "";

  if (!setupPath || !existsSync(setupPath)) {
    const candidates = existsSync(distDir)
      ? readdirSync(distDir)
          .filter((f) => /^PlayBound-Setup-\d+\.\d+\.\d+\.exe$/i.test(f))
          .sort()
      : [];
    if (candidates.length === 0) {
      console.error("Setup.exe not found. Build first: cd launcher && npm run dist");
      process.exit(1);
    }
    setupPath = resolve(distDir, candidates[candidates.length - 1]);
  }

  const setupName = basename(setupPath);
  const dir = dirname(setupPath);
  const ymlPath = resolve(dir, "latest.yml");
  const blockmapPath = resolve(dir, `${setupName}.blockmap`);

  console.log(`Uploading updater package from ${dir}…`);

  const setupUrl = await uploadBlob(
    `launcher/${setupName}`,
    setupPath,
    "application/octet-stream"
  );

  let ymlUrl: string | null = null;
  if (existsSync(ymlPath)) {
    ymlUrl = await uploadBlob("launcher/latest.yml", ymlPath, "text/yaml; charset=utf-8");
  } else {
    console.warn("  warning: latest.yml missing — auto-update checks will fail until present");
  }

  if (existsSync(blockmapPath)) {
    await uploadBlob(
      `launcher/${basename(blockmapPath)}`,
      blockmapPath,
      "application/octet-stream"
    );
  } else {
    console.warn("  warning: .blockmap missing — delta updates unavailable");
  }

  const aliasUrl = await uploadBlob(
    "launcher/PlayBound-Launcher-Setup.exe",
    setupPath,
    "application/octet-stream"
  );

  const feedBase = aliasUrl.replace(/\/[^/]+$/, "/");

  console.log("");
  console.log("Uploaded.");
  console.log(`  Versioned: ${setupUrl}`);
  console.log(`  Site alias: ${aliasUrl}`);
  if (ymlUrl) console.log(`  Update feed: ${ymlUrl}`);
  console.log(`  electron-updater url: ${feedBase}`);
  console.log("");
  console.log("Set on Vercel (Production + Preview) if changed:");
  console.log(`  NEXT_PUBLIC_LAUNCHER_DOWNLOAD_URL=${aliasUrl}`);
}

main().catch((err) => {
  console.error("upload:launcher failed:", err);
  process.exit(1);
});
