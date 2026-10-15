import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyNativePackageInstallation } from "./nativePackageUpdates.js";

export const HURRY_BUILD = Object.freeze(JSON.parse(fs.readFileSync(new URL("./sourceRuntimeBuilds.json", import.meta.url), "utf8"))["hurry-curry"]);
export function verifyHurryInstallation(root, { profile = HURRY_BUILD, command } = {}) {
  const info = fs.lstatSync(path.join(root, "hurrycurry-server"));
  const candidates = [profile.binary, profile.legacyBinary].filter(row => row?.bytes === info.size);
  if (candidates.length !== 1) throw new Error("Hurry Curry requires a reviewed patched build");
  const candidate = candidates[0];
  return verifyNativePackageInstallation(root, "hurry-curry", { requireRoot: false, ...(command ? { command } : {}), profile: { binary: "hurrycurry-server", component: "hurrycurry-server", binaryBytes: candidate.bytes, binarySha256: candidate.sha256, version: candidate === profile.binary ? profile.latest : "legacy-3.1.2" } });
}

export async function stageHurryRelease(stage, { run, verify = verifyHurryInstallation } = {}) {
  if (!/^\.pb-update-hurry-curry-[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(path.basename(stage))) throw new Error("Hurry Curry requires an isolated reviewed source build");
  verify(stage);
  const fresh = stage + "-source";
  try {
    await run("/usr/bin/python3", [fileURLToPath(new URL("./reviewedHostedSourceBuild.py", import.meta.url)), "hurry-curry", fresh], { timeout: 35 * 60_000, maxOutput: 8192, root: path.dirname(stage) });
    const output = path.join(fresh, "publish");
    if (verify(output).buildId !== HURRY_BUILD.latest) throw new Error("Hurry Curry compiled output differs from its reviewed patch/toolchain");
    fs.renameSync(path.join(output, "hurrycurry-server"), path.join(stage, "hurrycurry-server"));
    return verify(stage);
  } finally { if (fs.existsSync(fresh)) fs.rmSync(fresh, { recursive: true }); }
}
