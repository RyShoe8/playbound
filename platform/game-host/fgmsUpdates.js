import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyNativePackageInstallation } from "./nativePackageUpdates.js";

export const FGMS_BUILD = Object.freeze(JSON.parse(fs.readFileSync(new URL("./fgmsBuild.json", import.meta.url), "utf8")));
export function verifyFgmsInstallation(root, { profile = FGMS_BUILD, command } = {}) {
  const stat = fs.lstatSync(path.join(root, "fgms"));
  const variant = [profile.binary, profile.legacyBinary].find(value => value.bytes === stat.size);
  if (!variant) throw new Error("FlightGear relay differs from reviewed build");
  return verifyNativePackageInstallation(root, "flightgear", { requireRoot: false, ...(command ? { command } : {}), profile: { binary: "fgms", component: "fgms", binaryBytes: variant.bytes, binarySha256: variant.sha256, version: profile.version } });
}
export async function stageFgmsRelease(stage, { run, verify = verifyFgmsInstallation } = {}) {
  if (!/^\.pb-update-flightgear-[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(path.basename(stage))) throw new Error("FlightGear source build requires a reviewed worker directory");
  verify(stage);
  const fresh = `${stage}-source`;
  try {
    await run("/usr/bin/python3", [fileURLToPath(new URL("./fgmsSourceBuild.py", import.meta.url)), fresh], { timeout: 10 * 60_000, maxOutput: 32768, root: path.dirname(stage) });
    const publish = path.join(fresh, "publish"); verify(publish);
    fs.renameSync(path.join(publish, "fgms"), path.join(stage, "fgms"));
    return verify(stage);
  } finally { if (fs.existsSync(fresh)) fs.rmSync(fresh, { recursive: true }); }
}
