import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { verifyPairedInstallation, verifyPairedTree } from "./pairedRuntimeUpdates.js";

/** Refresh only the private immutable engine/Packs; never replace UserData. */
export function prepareTrackmaniaPackage(shared, runtime, { verifyInstalled = verifyPairedInstallation, verifyTree = verifyPairedTree } = {}) {
  const expected = verifyInstalled(shared, "trackmania").buildId;
  if (fs.realpathSync(runtime) !== path.resolve(runtime) || !fs.lstatSync(runtime).isDirectory()) throw new Error("Trackmania runtime must be a real directory");
  const installed = path.join(runtime, "package"), previous = path.join(runtime, ".package-previous");
  if (!fs.existsSync(installed) && fs.existsSync(previous)) fs.renameSync(previous, installed);
  const packs = path.join(runtime, "Packs"), legacy = path.join(runtime, ".legacy-Packs");
  if (fs.existsSync(packs) && fs.lstatSync(packs).isSymbolicLink() && fs.readlinkSync(packs) !== "package/Packs") throw new Error("Custom Trackmania Packs link requires review");
  if (!fs.existsSync(installed) || verifyTree(installed, "trackmania").buildId !== expected) {
    const fresh = path.join(runtime, ".package-" + randomUUID());
    fs.cpSync(path.join(shared, "runtime"), fresh, { recursive: true, dereference: false });
    if (verifyTree(fresh, "trackmania").buildId !== expected) throw new Error("Trackmania shared package changed during preparation");
    if (fs.existsSync(previous)) {
      verifyTree(previous, "trackmania");
      fs.rmSync(previous, { recursive: true });
    }
    if (fs.existsSync(installed)) fs.renameSync(installed, previous);
    try { fs.renameSync(fresh, installed); }
    catch (error) { if (fs.existsSync(previous) && !fs.existsSync(installed)) fs.renameSync(previous, installed); throw error; }
  }
  if (fs.existsSync(packs) && !fs.lstatSync(packs).isSymbolicLink()) {
    if (!fs.lstatSync(packs).isDirectory() || fs.existsSync(legacy)) throw new Error("Trackmania legacy Packs require inspection");
    fs.renameSync(packs, legacy);
  }
  if (!fs.existsSync(packs)) fs.symlinkSync("package/Packs", packs, "dir");
  for (const name of ["UserData", "Logs", "CommonData"]) {
    const target = path.join(runtime, name), link = path.join(installed, name);
    fs.mkdirSync(target, {recursive:true,mode:0o700});
    if (!fs.lstatSync(target).isDirectory() || fs.lstatSync(target).isSymbolicLink()) throw new Error("Trackmania private data must be an isolated directory");
    try {
      const info = fs.lstatSync(link);
      if (!info.isSymbolicLink() || fs.readlinkSync(link) !== "../" + name) throw new Error("Trackmania package contains unreviewed mutable data");
    } catch(error) { if (error.code === "ENOENT") fs.symlinkSync("../" + name, link, "dir"); else throw error; }
  }
  return path.join(installed, "TrackmaniaServer");
}
