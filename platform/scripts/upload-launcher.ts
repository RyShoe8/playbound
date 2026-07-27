/**
 * Upload PlayBound-Launcher-Setup.exe to Vercel Blob and print the public URL.
 *
 * Usage (from platform/):
 *   npx vercel env pull .env.local --environment=production
 *   npm run upload:launcher -- ../launcher/dist/PlayBound-Launcher-Setup-0.1.0.exe
 *
 * Then set NEXT_PUBLIC_LAUNCHER_DOWNLOAD_URL on Vercel to the printed URL.
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { loadEnvConfig } from "@next/env";
import { put } from "@vercel/blob";

loadEnvConfig(process.cwd());

async function main() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    console.error("BLOB_READ_WRITE_TOKEN is not set. Pull env with: npx vercel env pull");
    process.exit(1);
  }

  const argPath = process.argv[2];
  const defaultPath = resolve(
    process.cwd(),
    "../launcher/dist/PlayBound-Launcher-Setup-0.1.0.exe"
  );
  const filePath = resolve(argPath || defaultPath);

  if (!existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    console.error("Build first: cd launcher && npm run dist");
    process.exit(1);
  }

  const bytes = readFileSync(filePath);
  console.log(`Uploading ${filePath} (${(bytes.length / 1024 / 1024).toFixed(1)} MB)…`);

  const blob = await put("launcher/PlayBound-Launcher-Setup.exe", bytes, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/octet-stream",
    multipart: true,
    token,
  });

  console.log("Uploaded.");
  console.log(`URL: ${blob.url}`);
  console.log("");
  console.log("Set on Vercel (Production + Preview):");
  console.log(`  NEXT_PUBLIC_LAUNCHER_DOWNLOAD_URL=${blob.url}`);
  console.log("Or append to .env.local for local builds.");
}

main().catch((err) => {
  console.error("upload:launcher failed:", err);
  process.exit(1);
});
