import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { PAIRED_RUNTIMES, verifyPairedInstallation } from "./pairedRuntimeUpdates.js";

const run = promisify(execFile);

/** Hash large assets off the control agent's event loop. */
export async function prepareOpenFortressRuntime(shared, home, ctx) {
  openFortressHome(home, ctx);
  const { stdout } = await run(process.execPath, ["--max-old-space-size=256", fileURLToPath(import.meta.url), "--verify", shared], {
    timeout: 180_000, maxBuffer: 2048,
    env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8" },
  });
  const verified = JSON.parse(stdout);
  if (typeof verified.buildId !== "string") throw new Error("Open Fortress verification did not complete");
  return prepareOpenFortress(shared, home, ctx, { verify: () => verified });
}

export function openFortressHome(home, ctx) {
  const id = String(ctx?.communityServerId || ctx?.partyId || "");
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new Error("Open Fortress requires a valid server identity");
  return path.join(home, "open-fortress-servers", `pb-${id}`);
}

function directory(target) {
  let ancestor = target;
  while (!fs.existsSync(ancestor)) {
    // existsSync follows dangling links; lstat still rejects them.
    try { fs.lstatSync(ancestor); throw new Error("Open Fortress directory binding requires review"); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    ancestor = path.dirname(ancestor);
  }
  if (fs.realpathSync(ancestor) !== path.resolve(ancestor)) throw new Error("Open Fortress directory ancestor requires review");
  fs.mkdirSync(target, { recursive: true, mode: 0o700 });
  if (!fs.lstatSync(target).isDirectory() || fs.realpathSync(target) !== path.resolve(target)) throw new Error("Open Fortress private directory requires review");
}

function binding(target, source) {
  try {
    if (!fs.lstatSync(target).isSymbolicLink() || fs.readlinkSync(target) !== source) throw new Error("Open Fortress shared binding requires review");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    fs.symlinkSync(source, target, fs.statSync(source).isDirectory() ? "dir" : "file");
  }
}

/** Only immutable engine/assets are shared; native writes belong to this identity. */
export function prepareOpenFortress(shared, home, ctx, { verify = verifyPairedInstallation, launcherDigests = PAIRED_RUNTIMES["open-fortress"].versions.map(version => version.launcherSha256).filter(Boolean) } = {}) {
  const release = verify(shared, "open-fortress");
  const runtime = path.join(shared, "runtime"), privateHome = openFortressHome(home, ctx);
  directory(privateHome);
  const local = path.join(privateHome, "runtime"), mod = path.join(local, "open_fortress");
  directory(local); directory(mod);
  for (const name of ["hl2", "platform"]) binding(path.join(local, name), path.join(runtime, name));
  const launcher = path.join(local, "srcds_linux"), sourceLauncher = path.join(runtime, "srcds_linux");
  try { fs.copyFileSync(sourceLauncher, launcher, fs.constants.COPYFILE_EXCL); fs.chmodSync(launcher, 0o700); }
  catch (error) { if (error.code !== "EEXIST") throw error; }
  const launcherInfo = fs.lstatSync(launcher);
  if (!launcherInfo.isFile() || launcherInfo.isSymbolicLink() || launcherInfo.nlink !== 1 || launcherInfo.size > 1024 * 1024) throw new Error("Open Fortress private launcher requires review");
  const oldLauncher = fs.readFileSync(launcher);
  if (!oldLauncher.equals(fs.readFileSync(sourceLauncher))) {
    if (!launcherDigests.includes(createHash("sha256").update(oldLauncher).digest("hex"))) throw new Error("Open Fortress private launcher requires review");
    const temporary = path.join(local, ".launcher-" + randomUUID());
    try {
      fs.copyFileSync(sourceLauncher, temporary, fs.constants.COPYFILE_EXCL); fs.chmodSync(temporary, 0o700); fs.renameSync(temporary, launcher);
    } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  }
  const sdkBin = path.join(local, "bin"), sharedSdkBin = path.join(runtime, "bin");
  directory(sdkBin);
  const sdkAliases = new Set(["datacache", "dedicated", "engine", "materialsystem", "replay", "scenefilecache", "shaderapiempty", "soundemittersystem", "studiorender", "vphysics"]);
  for (const name of fs.readdirSync(sharedSdkBin)) {
    const stem = name.endsWith(".so") ? name.slice(0, -3) : "";
    binding(path.join(sdkBin, name), path.join(sharedSdkBin, sdkAliases.has(stem) ? stem + "_srv.so" : name));
  }
  const mutable = new Set(["cfg", "download", "downloadlists", "custom", "logs", "replay", "cache"]);
  for (const entry of fs.readdirSync(path.join(runtime, "open_fortress"))) {
    if (mutable.has(entry) || entry === "modelsounds.cache" || entry === "bin" || entry === "maps" || entry === "gameinfo.txt" || /^console.*\.log$/.test(entry)) continue;
    binding(path.join(mod, entry), path.join(runtime, "open_fortress", entry));
  }
  for (const name of mutable) directory(path.join(mod, name));
  const soundCache = path.join(mod, "modelsounds.cache"), sharedSoundCache = path.join(runtime, "open_fortress/modelsounds.cache");
  try {
    const info = fs.lstatSync(soundCache);
    if (info.isSymbolicLink()) {
      if (fs.readlinkSync(soundCache) !== sharedSoundCache) throw new Error("Open Fortress sound cache binding requires review");
      if (fs.existsSync(sharedSoundCache)) {
        const temporary = path.join(mod, ".sound-cache-" + randomUUID());
        try { fs.copyFileSync(sharedSoundCache, temporary, fs.constants.COPYFILE_EXCL); fs.chmodSync(temporary, 0o600); fs.renameSync(temporary, soundCache); }
        finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
      } else fs.unlinkSync(soundCache); // The engine regenerates its own cache.
    } else if (!info.isFile() || info.nlink !== 1) throw new Error("Open Fortress sound cache requires review");
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  const maps = path.join(mod, "maps"), sharedMaps = path.join(runtime, "open_fortress/maps");
  directory(maps); directory(path.join(maps, "graphs"));
  for (const name of fs.readdirSync(sharedMaps)) {
    // Source generates node graphs on first map load. Keep those out of the
    // immutable package so one server cannot invalidate another's baseline.
    if (name !== "graphs") binding(path.join(maps, name), path.join(sharedMaps, name));
  }
  const nativeBin = path.join(mod, "bin"), sharedBin = path.join(runtime, "open_fortress/bin");
  directory(nativeBin);
  for (const name of fs.readdirSync(sharedBin)) {
    // Its module introspection expects the loaded file to be named server.so,
    // even though the dedicated SDK requests server_srv.so.
    binding(path.join(nativeBin, name), path.join(sharedBin, name === "server_srv.so" ? "server.so" : name));
  }
  // Copy defaults once, refusing links in both new and retained configuration.
  const defaults = path.join(runtime, "defaults", "cfg"), cfg = path.join(mod, "cfg");
  const copyDefaults = (source, destination) => {
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
      const from = path.join(source, entry.name), to = path.join(destination, entry.name);
      if (entry.isDirectory()) { directory(to); copyDefaults(from, to); }
      else if (entry.isFile()) {
        try { fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL); fs.chmodSync(to, 0o600); }
        catch (error) { if (error.code !== "EEXIST") throw error; }
      } else throw new Error("Open Fortress default configuration is unsafe");
    }
  };
  const validateConfig = (parent) => {
    for (const name of fs.readdirSync(parent)) {
      const target = path.join(parent, name), info = fs.lstatSync(target);
      if (info.isSymbolicLink() || (!info.isDirectory() && (!info.isFile() || info.nlink !== 1))) throw new Error("Open Fortress private configuration requires review");
      if (info.isDirectory()) validateConfig(target);
    }
  };
  validateConfig(cfg); copyDefaults(defaults, cfg);
  const name = String(ctx.name || "PlayBound Open Fortress").replace(/[\x00-\x1f\x7f"\\]/g, " ").trim().slice(0, 48);
  const password = ctx.rconPassword || "";
  if (password && !/^[a-zA-Z0-9_-]{1,128}$/.test(password)) throw new Error("Open Fortress control credential is invalid");
  // Keep names and credentials out of Source's tiny command-line buffer.
  fs.writeFileSync(path.join(cfg, "playbound-managed.cfg"), `hostname "${name}"\nrcon_password "${password}"\n`, { mode: 0o600 });
  const gameinfo = path.join(mod, "gameinfo.txt");
  try {
    const info = fs.lstatSync(gameinfo);
    if (!info.isFile() || info.nlink !== 1 || info.isSymbolicLink()) throw new Error("Open Fortress gameinfo requires review");
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  let template = fs.readFileSync(path.join(runtime, "open_fortress", "gameinfo.txt"), "utf8");
  // The official Windows paths do not mount TF2 resources on the Linux SDK.
  const tf2 = path.join(path.dirname(shared), "team-fortress-2").split(path.sep).join("/");
  template = template.replace(/\|all_source_engine_paths\|\.\.[\\/]Team Fortress 2[\\/]/g, tf2 + "/")
    .replaceAll("/opt/playbound-host/games/team-fortress-2/", tf2 + "/")
    .replace(/\|all_source_engine_paths\|hl2\\/g, "|all_source_engine_paths|hl2/");
  fs.writeFileSync(gameinfo, template, { mode: 0o600 });
  directory(path.join(privateHome, ".steam", "sdk32"));
  binding(path.join(privateHome, ".steam", "sdk32", "steamclient.so"), path.join(runtime, "bin", "steamclient.so"));
  return { ...release, home: privateHome, runtime: local, mod };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4 || process.argv[2] !== "--verify") throw new Error("Expected a runtime verification request");
  console.log(JSON.stringify(verifyPairedInstallation(process.argv[3], "open-fortress")));
}
