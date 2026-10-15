/** Reviewed first profile only. This is a filesystem/process namespace boundary,
 * not the completed per-customer UID, cgroup, network or plugin isolation rollout.
 * There is deliberately no fallback to an unrestricted launch if setup fails.
 */
import fs from "node:fs";
import path from "node:path";

export const TEEWORLDS_ISOLATION = "teeworlds-bwrap-v1";

function privateDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(directory) !== path.resolve(directory) ||
      (process.getuid && (stat.uid !== process.getuid() || (stat.mode & 0o077)))) throw new Error("Isolation data directory must be private and service-owned");
}

export function customerIsolationLaunch({ gameSlug, customerOwned, communityServerId, binary, args, home }) {
  if (!customerOwned || gameSlug !== "teeworlds") return null;
  if (!/^[a-f0-9]{24}$/i.test(communityServerId || "") || !path.isAbsolute(home)) throw new Error("Invalid isolation identity");
  // Alternate/custom executables need their own reviewed dependency profile.
  if (binary !== "/usr/games/teeworlds-server") throw new Error("Customer isolation requires the reviewed system Teeworlds server");
  const expectedConfig = path.join(home, "teeworlds", `pb-${communityServerId}.cfg`);
  if (!Array.isArray(args) || args.length !== 3 || args[0] !== "-f" || args[1] !== expectedConfig || !/^sv_port (?:83\d{2})$/.test(args[2])) throw new Error("Unexpected Teeworlds isolation arguments");
  for (const executable of [binary, "/usr/bin/bwrap", "/usr/bin/prlimit"]) {
    const stat = fs.statSync(executable);
    if (!stat.isFile() || stat.uid !== 0 || (stat.mode & 0o022)) throw new Error("Isolation requires trusted host executables");
  }
  const config = fs.lstatSync(expectedConfig);
  if (!config.isFile() || config.isSymbolicLink() || config.nlink !== 1 || config.size > 64 * 1024 || fs.realpathSync(expectedConfig) !== expectedConfig) throw new Error("Unsafe isolation configuration");
  const root = path.join(home, "customer-sandboxes");
  privateDirectory(root);
  const data = path.join(root, `pb-${communityServerId}`);
  privateDirectory(data);
  try {
    const mounted = fs.lstatSync(path.join(data, "server.cfg"));
    if (!mounted.isFile() || mounted.isSymbolicLink() || mounted.nlink !== 1) throw new Error("Unsafe sandbox configuration mount");
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  return {
    profile: TEEWORLDS_ISOLATION,
    binary: "/usr/bin/prlimit",
    // Address space, descriptors and core dumps are bounded per process.
    // CPU/RSS/process-count controls require the later cgroup rollout.
    args: ["--as=1073741824", "--nofile=1024", "--core=0", "--", "/usr/bin/bwrap",
      "--unshare-user", "--unshare-pid", "--unshare-ipc", "--unshare-uts", "--unshare-cgroup",
      "--disable-userns", "--cap-drop", "ALL",
      "--ro-bind", "/usr", "/usr", "--symlink", "usr/lib", "/lib", "--symlink", "usr/lib64", "/lib64", "--symlink", "usr/bin", "/bin",
      "--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp",
      "--bind", data, "/server", "--ro-bind", expectedConfig, "/server/server.cfg",
      "--clearenv", "--setenv", "PATH", "/usr/bin:/usr/games", "--setenv", "HOME", "/server",
      "--setenv", "LANG", "C.UTF-8", "--chdir", "/server",
      "--", binary, "-f", "server.cfg", args[2]],
    cwd: data,
    env: { PATH: "/usr/bin:/usr/games", HOME: data, LANG: "C.UTF-8" },
  };
}
