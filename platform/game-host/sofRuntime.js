/** Per-room files for the original Soldier of Fortune 1.07f server under Wine. */
import fs from "node:fs";
import path from "node:path";

/** The base game (Platinum 1.07f) rather than the openMERC edition. */
export function isSofBase(ctx) {
  return !ctx?.editionSlug || ["official", "base"].includes(ctx.editionSlug);
}

const SOF_WRAPPER = '#!/usr/bin/env bash\nset -euo pipefail\nexec /usr/bin/wine SoF.exe "$@"\n';

/**
 * One private runtime per base-game room: the engine and game DLLs link to the
 * shared win107f copy, base/ is a private folder (SoF writes config.cfg and
 * logs there) whose paks and DLLs link back, and the Wine prefix is per room.
 */
export function prepareSofBaseRuntime(source, home) {
  for (const required of ["SoF.exe", "base/gamex86.dll", "base/player.dll", "base/pak0.pak"]) {
    if (!fs.statSync(path.join(source, required), { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`Soldier of Fortune server files are incomplete: ${required}`);
    }
  }
  const runtime = path.join(home, "runtime"), base = path.join(runtime, "base");
  fs.mkdirSync(base, { recursive: true, mode: 0o700 });
  if (fs.realpathSync(runtime) !== path.resolve(runtime)) throw new Error("Soldier of Fortune room directory requires review");
  const link = (from, to) => {
    try {
      if (!fs.lstatSync(to).isSymbolicLink() || fs.readlinkSync(to) !== from) throw new Error("Soldier of Fortune runtime binding requires review");
    } catch (error) { if (error.code !== "ENOENT") throw error; fs.symlinkSync(from, to); }
  };
  for (const name of fs.readdirSync(source)) if (name !== "base") link(path.join(source, name), path.join(runtime, name));
  for (const name of fs.readdirSync(path.join(source, "base"))) link(path.join(source, "base", name), path.join(base, name));
  const wrapper = path.join(runtime, "run-server.sh");
  try { fs.writeFileSync(wrapper, SOF_WRAPPER, { flag: "wx", mode: 0o700 }); } catch (error) { if (error.code !== "EEXIST") throw error; }
  if (fs.readFileSync(wrapper, "utf8") !== SOF_WRAPPER) throw new Error("Soldier of Fortune private wrapper requires review");
  fs.mkdirSync(path.join(home, "wineprefix"), { recursive: true, mode: 0o700 });
  return runtime;
}
