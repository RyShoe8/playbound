import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

/** Validate the paired public build and fixed system runtime, never private configuration. */
export function verifySpaceStation14Metadata(root, release, { command = execFileSync } = {}) {
  const read = name => {
    const file = path.join(root, name), info = fs.lstatSync(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 16_384) throw new Error("SS14 public build metadata is invalid");
    return JSON.parse(fs.readFileSync(file, "utf8"));
  };
  const build = read("build.json"), runtime = read("Robust.Server.runtimeconfig.json").runtimeOptions;
  if (build.version !== release.buildId || build.engine_version !== release.engineVersion || build.fork_id !== "wizards"
    || !/^[a-f0-9]{64}$/i.test(build.hash || "") || runtime?.tfm !== "net10.0"
    || runtime.framework?.name !== "Microsoft.NETCore.App" || runtime.framework.version !== "10.0.0") {
    throw new Error("SS14 engine, content or .NET version differs from review");
  }
  const installed = String(command("/usr/bin/dotnet", ["--list-runtimes"], {
    timeout: 10_000, maxBuffer: 8192, env: { PATH: "/usr/bin:/bin", LANG: "C", DOTNET_ROOT: "/usr/lib/dotnet" },
  }));
  if (!/^Microsoft\.NETCore\.App 10\.0\.\d+ \[\/usr\/lib\/dotnet\/shared\/Microsoft\.NETCore\.App\]$/m.test(installed.trim())) {
    throw new Error("SS14 requires the reviewed system .NET 10 runtime");
  }
}

/** Preserve legacy shared data; customer servers always use their own data/configuration. */
export function spaceStation14Paths(gamesRoot, hostHome, ctx) {
  const shared = path.join(gamesRoot, "space-station-14");
  const runtime = fs.existsSync(path.join(shared, "runtime")) ? path.join(shared, "runtime") : shared;
  let home = shared;
  if (ctx?.customerOwned) {
    const id = String(ctx.communityServerId || ctx.partyId || "");
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new Error("SS14 customer identity is required");
    home = path.join(hostHome, "space-station-14-servers", "pb-" + id);
  }
  return { runtime, home, data: path.join(home, "data"), config: path.join(home, "server_config.toml") };
}

export function prepareSpaceStation14Data(paths, hostHome, customerOwned) {
  const create = (directory) => {
    try { fs.mkdirSync(directory, { mode: 0o700 }); }
    catch (error) { if (error.code !== "EEXIST") throw error; }
    const info = fs.lstatSync(directory);
    if (!info.isDirectory() || info.isSymbolicLink() || fs.realpathSync(directory) !== path.resolve(directory)) throw new Error("SS14 data directories require review");
  };
  if (customerOwned) {
    if (fs.realpathSync(hostHome) !== path.resolve(hostHome)) throw new Error("SS14 host home requires review");
    create(path.dirname(paths.home));
    create(paths.home);
  }
  create(paths.data);
  create(path.join(paths.data, "logs"));
  try { fs.writeFileSync(paths.config, "[hub]\nadvertise = false\n", { flag: "wx", mode: 0o600 }); }
  catch (error) { if (error.code !== "EEXIST") throw error; }
  const info = fs.lstatSync(paths.config);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new Error("SS14 private configuration requires review");
}
