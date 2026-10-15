import fs from "node:fs";
import path from "node:path";
import { appImageOffset } from "./openraUpdates.js";
import { createVerifiedAppImageInstallation } from "./appImageInstallation.js";
import { verifySshArtifactSignature } from "./sshArtifactSignature.js";

// https://github.com/TeamHypersomnia/Hypersomnia/blob/master/src/signing_keys.h
const PUBLIC_KEY = "AAAAC3NzaC1lZDI1NTE5AAAAILOAjiu83c1VUMG7nIPxok0+yIxqLzPmcZk4Dyr6IiVX";
const ROOT = "https://hypersomnia.io/builds/latest/";
const BINARY = "Hypersomnia-Headless.AppImage", MARKER = ".pb-hypersomnia-release.json";
const VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;
export const verifyHypersomniaInstallation = createVerifiedAppImageInstallation({
  label: "Hypersomnia", binary: BINARY, marker: MARKER, tag: VERSION,
  // Matched to the official rolling image and independently verified with the
  // upstream self_updater SSH signature on 2026-10-14. No blind legacy adoption.
  legacy: { buildId: "3.0.0", size: 26294776, digest: "sha256:d741618283090d3ab298ad3e72e80c5431d6a57b8a28f704278444267683a44d" },
});

async function response(name, request, signal) {
  const result = await request(ROOT + name, { signal, redirect: "error" });
  if (!result.ok || !result.body) throw new Error("Hypersomnia official download is unavailable");
  return result;
}
// Dependency injection is for isolated tests, never an HTTP operation input.
export async function stageHypersomniaRelease(stage, { run, request = fetch, diskCheck = () => {}, verifySignature = verifySshArtifactSignature }) {
  if (!/^\.pb-update-hypersomnia-[a-f0-9-]{36}$/.test(path.basename(stage))) throw new Error("Hypersomnia requires an isolated worker staging directory");
  const installed = verifyHypersomniaInstallation(stage);
  const signal = AbortSignal.timeout(5 * 60_000);
  const metadata = await response("version-Headless-AppImage.txt", request, signal);
  const chunks = []; let length = 0;
  for await (const chunk of metadata.body) {
    if ((length += chunk.length) > 8192) throw new Error("Hypersomnia version metadata is too large");
    chunks.push(chunk);
  }
  const [buildId, commit, ...signature] = Buffer.concat(chunks).toString().replace(/\r\n/g, "\n").split("\n");
  if (!VERSION.test(buildId) || !/^Commit hash: [a-f0-9]{40}$/.test(commit)) throw new Error("Hypersomnia version metadata is invalid");
  const next = buildId.split(".").map(Number), previous = installed.buildId.split(".").map(Number);
  const difference = next.findIndex((value, index) => value !== previous[index]);
  if (difference >= 0 && next[difference] < previous[difference]) throw new Error("Hypersomnia rolling updates cannot downgrade the installed version; use reviewed rollback");
  const work = path.join(stage, ".pb-hypersomnia-work"); fs.mkdirSync(work, { mode: 0o700 });
  const image = path.join(work, BINARY), download = await response(BINARY, request, signal);
  const expectedSize = Number(download.headers.get("content-length"));
  if (!Number.isSafeInteger(expectedSize) || expectedSize < 1 || expectedSize > 256 * 1024 ** 2) throw new Error("Hypersomnia download has no bounded declared size");
  const fd = fs.openSync(image, "wx", 0o600); let size = 0;
  try {
    for await (const chunk of download.body) {
      if ((size += chunk.length) > expectedSize) throw new Error("Hypersomnia download exceeds its declared size");
      diskCheck(); let offset = 0;
      while (offset < chunk.length) { const written = fs.writeSync(fd, chunk, offset, chunk.length - offset); if (!written) throw new Error("Hypersomnia download write failed"); offset += written; }
    }
    if (size !== expectedSize) throw new Error("Hypersomnia download is truncated");
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  const verified = verifySignature(image, signature.join("\n"), PUBLIC_KEY);
  appImageOffset(image); fs.chmodSync(image, 0o755);
  // Only the signed upstream program runs, with an empty environment and a new
  // HOME/cwd/temp directory. --version exits without starting a game server.
  const output = await run("/usr/bin/env", ["-i", `--chdir=${work}`, "PATH=/usr/bin:/bin", `HOME=${work}`, `TMPDIR=${work}`, image, "--appimage-extract-and-run", "--version"], { root: stage, timeout: 30_000, maxOutput: 8192 });
  if (!output.split(/\r?\n/).includes(`Hypersomnia version ${buildId}`)) throw new Error("Hypersomnia signed binary version differs from its metadata");
  diskCheck(); fs.renameSync(image, path.join(stage, BINARY));
  fs.writeFileSync(path.join(stage, MARKER), JSON.stringify({ version: 1, buildId, commit: commit.slice(13), ...verified }), { mode: 0o600 });
  fs.rmSync(work, { recursive: true });
  return verifyHypersomniaInstallation(stage);
}
