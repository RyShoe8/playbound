import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { httpsGetStream } from "./downloadStream.js";
import { verifyNativePackageInstallation } from "./nativePackageUpdates.js";

const RELEASE = JSON.parse(fs.readFileSync(new URL("./xonotic086.json", import.meta.url), "utf8"));

export function verifyXonoticInstallation(root) {
  return verifyNativePackageInstallation(root, "xonotic", { requireRoot: false, profile: RELEASE });
}

/** Fixed publisher-reviewed release, not an arbitrary mirror or shell updater.
 * Only the dedicated ELF changes. Existing 0.8.6 assets/configuration stay put. */
export async function stageXonoticRelease(stage, { run, request = httpsGetStream, diskCheck = () => {}, verify = verifyXonoticInstallation } = {}) {
  if (!/^\.pb-update-xonotic-[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(path.basename(stage))) throw new Error("Xonotic updates require an isolated worker directory");
  verify(stage);
  const archive = path.join(stage, ".reviewed-xonotic.zip"), fresh = path.join(stage, ".reviewed-xonotic-engine");
  let response;
  try {
    response = await request(RELEASE.url, { maxRedirects: 0, signal: AbortSignal.timeout(15 * 60_000) });
    if (response.statusCode !== 200 || !response.stream) { response.stream?.destroy?.(); throw new Error("Xonotic official mirror download failed"); }
    const file = fs.openSync(archive, "wx", 0o600), hash = createHash("sha512"); let size = 0;
    try {
      for await (const chunk of response.stream) {
        size += chunk.length;
        if (size > RELEASE.archiveBytes) throw new Error("Xonotic archive exceeds its reviewed size");
        diskCheck(); hash.update(chunk);
        let offset = 0;
        while (offset < chunk.length) { const written = fs.writeSync(file, chunk, offset, chunk.length - offset); if (!written) throw new Error("Xonotic download write failed"); offset += written; }
      }
      if (size !== RELEASE.archiveBytes || hash.digest("hex") !== RELEASE.archiveSha512) throw new Error("Xonotic archive failed its publisher SHA-512 check");
      fs.fsyncSync(file);
    } finally { fs.closeSync(file); }
    await run("/usr/bin/python3", [fileURLToPath(new URL("./xonoticArchive.py", import.meta.url)), archive, fresh], { timeout: 120000, maxOutput: 4096 });
    fs.renameSync(fresh, path.join(stage, RELEASE.binary));
    return verify(stage);
  } finally {
    response?.stream?.destroy?.();
    for (const file of [archive, fresh]) if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}
