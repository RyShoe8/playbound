/** Reviewed HX distribution files. Private INI files and saves are never refreshed. */
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

export const HX_RUNTIME_FILES = Object.freeze({
  "HCC.exe": "97b4e9bc657860cc486d7160be038f61675aededae12b6fecdcf438777458495",
  "HX.dll": "f6f3af72a468c2a801cdcdfea0d2d63a9ad686b0654d895883c5fec71b89182d",
  "HX.exe": "d8bd4d62a9ef591ad623295b963ec1f3ad2cfedaee77f267d880935784da0c95",
  "HX.int": "f609027b191987d7c66b86a32d8d645cf2779e95c6149e6fd00a941f7fc996c1",
  "HX.u": "7485fa7374853165a5d95f4f44d6d3f31c54aae5a8bafc16162dacdf289cb3eb",
});

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
function regularFile(file) {
  const info = fs.lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 32 * 1024 ** 2 || fs.realpathSync(file) !== path.resolve(file)) throw new Error("HX runtime file requires review");
  return fs.readFileSync(file);
}

/** Only call during stopped-room preparation. Preflight all files before writing. */
export function refreshHxRuntime(baseSystem, privateSystem, { files = HX_RUNTIME_FILES, previous = [] } = {}) {
  for (const directory of [baseSystem, privateSystem]) {
    if (!fs.lstatSync(directory).isDirectory() || fs.realpathSync(directory) !== path.resolve(directory)) throw new Error("HX runtime directory requires review");
  }
  const changes = [];
  for (const [name, expected] of Object.entries(files)) {
    if (!/^[A-Za-z0-9_-]+\.(exe|dll|u|int)$/.test(name) || !/^[a-f0-9]{64}$/.test(expected)) throw new Error("HX reviewed runtime profile is invalid");
    const source = regularFile(path.join(baseSystem, name));
    if (hash(source) !== expected) throw new Error("HX installed runtime differs from the reviewed release");
    const destination = path.join(privateSystem, name);
    let existing;
    try { existing = hash(regularFile(destination)); } catch (error) { if (error.code !== "ENOENT") throw error; }
    if (existing === expected) continue;
    if (existing && !previous.some(release => release[name] === existing)) throw new Error("HX private runtime was modified and requires review");
    changes.push({ destination, source });
  }
  for (const { destination, source } of changes) {
    const temporary = path.join(privateSystem, ".hx-runtime-" + randomUUID());
    try {
      fs.writeFileSync(temporary, source, { flag: "wx", mode: 0o600 });
      fs.renameSync(temporary, destination);
    } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  }
  return changes.length;
}
