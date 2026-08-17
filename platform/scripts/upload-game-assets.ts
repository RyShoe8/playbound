/**
 * Upload a verified game-data package to the public Blob store.
 *
 * This deliberately does not update MongoDB or any install recipe. It is for
 * preparing a stable content URL; the narrowly-scoped catalog change that
 * references it remains a separate, reviewable step.
 *
 * Usage:
 *   npx tsx scripts/upload-game-assets.ts <local-file> <blob-path>
 */
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { loadEnvConfig } from "@next/env";
import { put } from "@vercel/blob";

loadEnvConfig(process.cwd());

async function main() {
  const [fileArg, pathname] = process.argv.slice(2);
  const filePath = fileArg ? resolve(fileArg) : "";
  if (!filePath || !pathname || !existsSync(filePath)) {
    throw new Error("Usage: npx tsx scripts/upload-game-assets.ts <local-file> <blob-path>");
  }
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is not set");

  const bytes = readFileSync(filePath);
  const blob = await put(pathname, bytes, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/zip",
    multipart: true,
    token,
  });
  console.log(blob.url);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
