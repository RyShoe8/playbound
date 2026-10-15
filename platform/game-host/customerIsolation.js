/** Reviewed engine profiles only. This is a filesystem/process namespace boundary,
 * not the completed per-customer UID, cgroup, network or plugin isolation rollout.
 * There is deliberately no fallback to an unrestricted launch if setup fails.
 */
import fs from "node:fs";
import path from "node:path";

export const TEEWORLDS_ISOLATION = "teeworlds-bwrap-v1";
export const CUSTOMER_ISOLATION_GAMES = Object.freeze(["teeworlds", "bzflag", "hedgewars", "openttd", "luanti"]);

function regularFile(filename, maxBytes = Infinity) {
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > maxBytes || fs.realpathSync(filename) !== path.resolve(filename)) throw new Error("Unsafe isolation configuration");
}

function unlinkedAncestors(filename) {
  const absolute = path.resolve(filename);
  let current = path.parse(absolute).root;
  for (const component of absolute.slice(current.length).split(path.sep)) {
    current = path.join(current, component);
    try {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink()) throw new Error("Linked customer runtime paths are not allowed");
    } catch (error) { if (error.code === "ENOENT") return; throw error; }
  }
}

/** Runs before recipes write any generated configuration, not just at spawn. */
export function validateCustomerPreparation({ gameSlug, customerOwned, communityServerId: id, home }) {
  if (!customerOwned || !CUSTOMER_ISOLATION_GAMES.includes(gameSlug)) return;
  if (!/^[a-f0-9]{24}$/i.test(id || "") || typeof home !== "string" || !path.isAbsolute(home)) throw new Error("Invalid isolation identity");
  const outputs = {
    teeworlds: [path.join(home, "teeworlds", `pb-${id}.cfg`), path.join(home, "customer-sandboxes", `pb-${id}`)],
    openttd: [path.join(home, "openttd", `pb-${id.slice(-16)}.cfg`), path.join(home, "openttd-servers", `pb-${id}`)],
    bzflag: [path.join(home, "bzflag-servers", `pb-${id}`)],
    hedgewars: [path.join(home, "hedgewars-servers", `pb-${id}`)],
    luanti: [path.join(home, "luanti-servers", `pb-${id}`, "world", "playbound.conf")],
  }[gameSlug];
  for (const filename of outputs) {
    unlinkedAncestors(filename);
    try {
      const stat = fs.lstatSync(filename);
      if (stat.isFile()) regularFile(filename);
      else if (!stat.isDirectory()) throw new Error("Unsupported customer runtime file");
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
}

function withinPort(value, first, last) {
  return typeof value === "string" && /^\d+$/.test(value) && Number(value) >= first && Number(value) <= last;
}

function privateDirectory(directory) {
  unlinkedAncestors(directory);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(directory) !== path.resolve(directory) ||
      (process.getuid && (stat.uid !== process.getuid() || (stat.mode & 0o077)))) throw new Error("Isolation data directory must be private and service-owned");
}

export function customerIsolationLaunch({ gameSlug, customerOwned, communityServerId, binary, args, home }) {
  if (!customerOwned || !CUSTOMER_ISOLATION_GAMES.includes(gameSlug)) return null;
  validateCustomerPreparation({ gameSlug, customerOwned, communityServerId, home });
  if (!/^[a-f0-9]{24}$/i.test(communityServerId || "") || !path.isAbsolute(home)) throw new Error("Invalid isolation identity");
  if (!Array.isArray(args) || args.some(value => typeof value !== "string" || value.includes("\0"))) throw new Error("Invalid isolation arguments");
  if (gameSlug !== "teeworlds") return nativeIsolationLaunch({ gameSlug, communityServerId, binary, args, home });
  // Alternate/custom executables need their own reviewed dependency profile.
  if (binary !== "/usr/games/teeworlds-server") throw new Error("Customer isolation requires the reviewed system Teeworlds server");
  const expectedConfig = path.join(home, "teeworlds", `pb-${communityServerId}.cfg`);
  if (!Array.isArray(args) || args.length !== 3 || args[0] !== "-f" || args[1] !== expectedConfig || !/^sv_port (?:83\d{2})$/.test(args[2])) throw new Error("Unexpected Teeworlds isolation arguments");
  trustedExecutables(binary);
  regularFile(expectedConfig, 64 * 1024);
  const root = path.join(home, "customer-sandboxes");
  privateDirectory(root);
  const data = path.join(root, `pb-${communityServerId}`);
  privateDirectory(data);
  return sandboxPlan({ gameSlug, binary, gameArgs: ["-f", "server.cfg", args[2]], data, mounts: [[expectedConfig, "/server/server.cfg"]] });
}

function trustedExecutables(binary) {
  for (const executable of [binary, "/usr/bin/bwrap", "/usr/bin/prlimit"]) {
    const stat = fs.statSync(executable);
    if (!stat.isFile() || stat.uid !== 0 || (stat.mode & 0o022)) throw new Error("Isolation requires trusted host executables");
  }
}

function sandboxPlan({ gameSlug, binary, gameArgs, data, mounts = [], addressSpace = 1073741824 }) {
  for (const [, target] of mounts) {
    const relative = path.posix.relative("/server", target);
    if (relative.startsWith("..") || path.posix.isAbsolute(relative)) throw new Error("Invalid isolation mount");
    const location = path.join(data, relative);
    try { regularFile(location); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  return {
    profile: `${gameSlug}-bwrap-v1`,
    binary: "/usr/bin/prlimit",
    // Address space, descriptors and core dumps are bounded per process.
    // CPU/RSS/process-count controls require the later cgroup rollout.
    args: [`--as=${addressSpace}`, "--nofile=1024", "--core=0", "--", "/usr/bin/bwrap",
      "--unshare-user", "--unshare-pid", "--unshare-ipc", "--unshare-uts", "--unshare-cgroup",
      "--disable-userns", "--cap-drop", "ALL",
      "--ro-bind", "/usr", "/usr", "--symlink", "usr/lib", "/lib", "--symlink", "usr/lib64", "/lib64", "--symlink", "usr/bin", "/bin",
      "--proc", "/proc", "--dev", "/dev", "--size", "67108864", "--tmpfs", "/tmp",
      "--bind", data, "/server", ...mounts.flatMap(([source, target]) => ["--ro-bind", source, target]),
      // Fixed system DNS/CA inputs only. Never bind the whole /etc tree.
      ...["/etc/resolv.conf", "/etc/hosts", "/etc/protocols", "/etc/services", "/etc/ssl/certs"].filter(filename => fs.existsSync(filename)).flatMap(filename => ["--ro-bind", filename, filename]),
      "--clearenv", "--setenv", "PATH", "/usr/bin:/usr/games", "--setenv", "HOME", "/server",
      "--setenv", "XDG_DATA_HOME", "/server", "--setenv", "XDG_CONFIG_HOME", "/server",
      "--setenv", "LANG", "C.UTF-8", "--chdir", "/server",
      "--", binary, ...gameArgs],
    cwd: data,
    env: { PATH: "/usr/bin:/usr/games", HOME: data, LANG: "C.UTF-8" },
  };
}

function nativeIsolationLaunch({ gameSlug, communityServerId: id, binary, args, home }) {
  const supported = {
    bzflag: ["/usr/games/bzfs", "bzflag-servers"],
    hedgewars: ["/usr/lib/hedgewars/bin/hedgewars-server", "hedgewars-servers"],
    openttd: ["/usr/games/openttd", "openttd-servers"],
    luanti: ["/usr/games/minetestserver", "luanti-servers"],
  };
  const [expected, folder] = supported[gameSlug];
  if (binary !== expected) throw new Error("Customer isolation requires the reviewed system server");
  trustedExecutables(binary);
  const data = path.join(home, folder, `pb-${id}`);
  privateDirectory(path.dirname(data));
  privateDirectory(data);
  let gameArgs = args;
  const mounts = [];
  if (gameSlug === "hedgewars") {
    if (args.length !== 2 || args[0] !== "-p" || !withinPort(args[1], 46631, 46650)) throw new Error("Unexpected Hedgewars isolation arguments");
  } else if (gameSlug === "bzflag") {
    if (args.length !== 10 || args[0] !== "-p" || !withinPort(args[1], 5155, 5174) ||
        args.slice(2, 7).join(" ") !== "-offa -q -j +r +s" || !withinPort(args[7], 0, 100) || args[8] !== "-mp" || !withinPort(args[9], 2, 200)) throw new Error("Unexpected BZFlag isolation arguments");
  } else if (gameSlug === "openttd") {
    const config = path.join(home, "openttd", `pb-${id.slice(-16)}.cfg`);
    if (args.length !== 4 || args[0] !== "-D" || !args[1].startsWith("0.0.0.0:") || !withinPort(args[1].slice(8), 3979, 3999) || args[2] !== "-c" || args[3] !== config) throw new Error("Unexpected OpenTTD isolation arguments");
    regularFile(config, 64 * 1024);
    mounts.push([config, "/server/openttd.cfg"]);
    gameArgs = ["-D", args[1], "-c", "/server/openttd.cfg"];
  } else if (gameSlug === "luanti") {
    const config = path.join(data, "world", "playbound.conf");
    if (args.length !== 10 || args[0] !== "--port" || !withinPort(args[1], 30000, 30020) ||
        args.slice(2).join("\0") !== ["--world", path.join(data, "world"), "--gameid", "minetest", "--config", config, "--logfile", path.join(data, "minetest.log")].join("\0")) throw new Error("Unexpected Luanti isolation arguments");
    regularFile(config, 64 * 1024);
    mounts.push([config, "/server/world/playbound.conf"]);
    gameArgs = ["--port", args[1], "--world", "/server/world", "--gameid", "minetest", "--config", "/server/world/playbound.conf", "--logfile", "/server/minetest.log"];
  }
  return sandboxPlan({ gameSlug, binary, gameArgs, data, mounts, addressSpace: gameSlug === "luanti" ? 2147483648 : 1073741824 });
}
