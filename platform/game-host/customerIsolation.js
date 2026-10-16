/** Reviewed engine profiles only. This builds the filesystem/process namespace
 * boundary; customerRuntime applies cgroup limits before running the plan.
 * The five reviewed native engines have opt-in UID handoffs. Other host UIDs, network policy and
 * executable-plugin isolation remain unfinished.
 * There is deliberately no fallback to an unrestricted launch if setup fails.
 */
import fs from "node:fs";
import path from "node:path";
import { customerResourceLimits } from "./customerResourceLimits.js";
import { identityMigrationMetadata } from "./customerMigration.js";
import { NATIVE_PACKAGE_PROFILES, verifyNativePackageInstallation } from "./nativePackageUpdates.js";

export const CUSTOMER_IDENTITY_GAMES = Object.freeze(["teeworlds", "bzflag", "hedgewars", "openttd", "luanti", "openarena", "battle-for-wesnoth", "supertuxkart", "0-ad", "ysoccer"]);
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
export function validateCustomerPreparation({ gameSlug, customerOwned, communityServerId: id, home, identityProfile }) {
  if (customerOwned && ["openarena","battle-for-wesnoth","supertuxkart","0-ad","ysoccer"].includes(gameSlug) && identityProfile) {
    if (identityProfile !== `${gameSlug}-unix-v1` || identityMigrationMetadata(id,home)?.identityProfile !== identityProfile) throw new Error("Customer identity migration is not ready");
    return;
  }
  if (!customerOwned || !CUSTOMER_ISOLATION_GAMES.includes(gameSlug)) return;
  if (!/^[a-f0-9]{24}$/i.test(id || "") || typeof home !== "string" || !path.isAbsolute(home)) throw new Error("Invalid isolation identity");
  if (identityProfile && ["openttd","luanti"].includes(gameSlug)) {
    const migration = identityMigrationMetadata(id,home);
    if (migration?.identityProfile !== identityProfile || identityProfile !== `${gameSlug}-unix-v1`) throw new Error("Customer identity migration is not ready");
    return; // No legacy data is prepared; the root supervisor generates typed configuration.
  }
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

export function customerIsolationLaunch({ gameSlug, customerOwned, communityServerId, binary, args, home, resourceLimits, identityProfile, settings }) {
  if (!customerOwned || (!CUSTOMER_ISOLATION_GAMES.includes(gameSlug) && !(["openarena","battle-for-wesnoth","supertuxkart","0-ad","ysoccer"].includes(gameSlug) && identityProfile))) return null;
  if (identityProfile !== undefined && (!CUSTOMER_IDENTITY_GAMES.includes(gameSlug) || identityProfile !== `${gameSlug}-unix-v1`)) throw new Error("Unsupported customer identity profile");
  const limits = customerResourceLimits(gameSlug, resourceLimits);
  validateCustomerPreparation({ gameSlug, customerOwned, communityServerId, home, identityProfile });
  if (!/^[a-f0-9]{24}$/i.test(communityServerId || "") || !path.isAbsolute(home)) throw new Error("Invalid isolation identity");
  if (!Array.isArray(args) || args.some(value => typeof value !== "string" || value.includes("\0"))) throw new Error("Invalid isolation arguments");
  if (gameSlug !== "teeworlds") return nativeIsolationLaunch({ gameSlug, communityServerId, binary, args, home, resourceLimits: limits, identityProfile, settings });
  // Alternate/custom executables need their own reviewed dependency profile.
  const systemBinary = "/usr/games/teeworlds-server";
  let engineMount;
  if (binary !== systemBinary) {
    const root = "/opt/playbound-host/games/teeworlds";
    if (binary !== path.join(root, NATIVE_PACKAGE_PROFILES.teeworlds.binary)) throw new Error("Customer isolation requires the reviewed Teeworlds server");
    verifyNativePackageInstallation(root, "teeworlds");
    engineMount = binary;
  }
  const expectedConfig = path.join(home, "teeworlds", `pb-${communityServerId}.cfg`);
  if (!Array.isArray(args) || args.length !== 3 || args[0] !== "-f" || args[1] !== expectedConfig || !/^sv_port (?:83\d{2})$/.test(args[2])) throw new Error("Unexpected Teeworlds isolation arguments");
  trustedExecutables(binary);
  regularFile(expectedConfig, 64 * 1024);
  const migration = identityProfile ? identityMigrationMetadata(communityServerId, home) : null;
  if (migration) {
    return { ...identityPlan(expectedConfig, identityProfile, limits, args[2]), networkProfile: migration.networkProfile };
  }
  const root = path.join(home, "customer-sandboxes");
  privateDirectory(root);
  const data = path.join(root, `pb-${communityServerId}`);
  privateDirectory(data);
  const plan = sandboxPlan({ gameSlug, binary: systemBinary, engineMount, gameArgs: ["-f", "server.cfg", args[2]], data, mounts: [[expectedConfig, "/server/server.cfg"]], resourceLimits: limits });
  if (identityProfile) {
    // No implicit migration or empty replacement of a customer's existing data.
    let needsMigration = false;
    for (const name of fs.readdirSync(data)) {
      const info = fs.lstatSync(path.join(data, name));
      if (name !== "server.cfg" || !info.isFile() || info.nlink !== 1 || info.size !== 0) needsMigration = true;
    }
    if (needsMigration) throw new Error("Existing customer data requires an explicit identity migration");
    const identity = identityPlan(expectedConfig, identityProfile, limits, args[2]);
    plan.identityProfile = identity.identityProfile;
    plan.identityRuntime = identity.identityRuntime;
  }
  return plan;
}

function identityPlan(config, identityProfile, resourceLimits, portArgument) {
  const fd = fs.openSync(config, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const info = fs.fstatSync(fd);
    if (!info.isFile() || info.nlink !== 1 || info.size > 16384) throw new Error("Invalid identity configuration");
    return {
      profile: TEEWORLDS_ISOLATION, resourceLimits, identityProfile,
      identityRuntime: { port: Number(portArgument.slice(8)), config: fs.readFileSync(fd, "utf8") },
      binary: "/usr/bin/prlimit", args: [], cwd: "/", env: { PATH: "/usr/bin:/usr/games", LANG: "C.UTF-8" },
    };
  } finally { fs.closeSync(fd); }
}

function trustedExecutables(binary) {
  for (const executable of [binary, "/usr/bin/bwrap", "/usr/bin/prlimit"]) {
    const stat = fs.statSync(executable);
    if (!stat.isFile() || stat.uid !== 0 || (stat.mode & 0o022)) throw new Error("Isolation requires trusted host executables");
  }
}

function sandboxPlan({ gameSlug, binary, gameArgs, data, mounts = [], resourceLimits, engineMount }) {
  for (const [, target] of mounts) {
    const relative = path.posix.relative("/server", target);
    if (relative.startsWith("..") || path.posix.isAbsolute(relative)) throw new Error("Invalid isolation mount");
    const location = path.join(data, relative);
    try { regularFile(location); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  return {
    profile: `${gameSlug}-bwrap-v1`,
    resourceLimits,
    binary: "/usr/bin/prlimit",
    // Address space, descriptors and core dumps are bounded per process.
    // Aggregate CPU/RSS/task/swap controls are applied by customerRuntime.
    args: [`--as=${Math.max(1073741824, resourceLimits.memoryMiB * 2 * 1024 ** 2)}`, "--nofile=1024", "--core=0", "--", "/usr/bin/bwrap",
      "--unshare-user", "--unshare-pid", "--unshare-ipc", "--unshare-uts", "--unshare-cgroup",
      "--disable-userns", "--cap-drop", "ALL",
      "--ro-bind", "/usr", "/usr", "--symlink", "usr/lib", "/lib", "--symlink", "usr/lib64", "/lib64", "--symlink", "usr/bin", "/bin",
      ...(engineMount ? ["--ro-bind", engineMount, binary] : []),
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

/** Accept only the existing recipe's declared tokens, never a console program. */
export function openArenaIdentityConfiguration(args) {
  if (!Array.isArray(args) || args.at(-2) !== "+map" || args.at(-1) !== "oa_dm1") throw new Error("Unexpected OpenArena map");
  const values = {};
  for (let index = 0; index < args.length - 2; index += 3) {
    const [marker,key,value] = args.slice(index,index+3);
    if (marker !== "+set" || typeof key !== "string" || typeof value !== "string" || Object.hasOwn(values,key)) throw new Error("Unexpected OpenArena settings");
    values[key] = value;
  }
  const fixed = {com_basegame:"baseoa",fs_basepath:"/usr/lib/openarena-server",com_homepath:".openarena",com_legacyprotocol:"71",com_protocol:"71",cl_motd:"0",dedicated:"1",sv_master1:'""'};
  const allowed = new Set([...Object.keys(fixed),"net_port","sv_hostname","rconpassword","sv_maxclients","bot_enable","bot_minplayers"]);
  if (Object.keys(values).some(key=>!allowed.has(key)) || Object.entries(fixed).some(([key,value])=>values[key]!==value) || !withinPort(values.net_port,27960,27980)) throw new Error("Unexpected OpenArena startup contract");
  const maxPlayers = Number(values.sv_maxclients ?? 12), botPlayers = Number(values.bot_minplayers ?? 0);
  if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 64 || !Number.isInteger(botPlayers) || botPlayers < 0 || botPlayers > maxPlayers || (values.bot_enable !== undefined && values.bot_enable !== "1") || typeof values.sv_hostname !== "string" || !values.sv_hostname.length || values.sv_hostname.length > 100 || /[\x00-\x1f\x7f"\\;]/.test(values.sv_hostname) || !/^[A-Za-z0-9_-]{24,64}$/.test(values.rconpassword || "")) throw new Error("Invalid OpenArena typed settings");
  return {port:Number(values.net_port),config:JSON.stringify({maxPlayers,botPlayers,name:values.sv_hostname,rconPassword:values.rconpassword})};
}

export function superTuxKartIdentityConfiguration(args) {
  const values={};
  for (const item of args) {
    if (item === "--no-graphics") { if (values.headless) throw new Error("Duplicate headless flag"); values.headless=true; continue; }
    const match=/^--(lan-server|port|max-players|mode|difficulty)=(.*)$/.exec(item);
    if (!match || Object.hasOwn(values,match[1])) throw new Error("Unexpected SuperTuxKart startup contract");
    values[match[1]]=match[2];
  }
  const name=values["lan-server"],maxPlayers=Number(values["max-players"]??8),mode=Number(values.mode??3),difficulty=Number(values.difficulty??1);
  if (!values.headless || !withinPort(values.port,2759,2779) || typeof name!=="string" || !name.length || name.length>100 || /[\x00-\x1f\x7f]/.test(name) || !Number.isInteger(maxPlayers) || maxPlayers<2 || maxPlayers>12 || ![0,1,3,4,6,7,8].includes(mode) || !Number.isInteger(difficulty) || difficulty<0 || difficulty>3) throw new Error("Invalid SuperTuxKart typed settings");
  return {port:Number(values.port),config:JSON.stringify({name,maxPlayers,mode,difficulty})};
}

export function zeroAdIdentityConfiguration(args) {
  if (!Array.isArray(args) || args.length!==8 || args[1]!=="-autostart-host" || args.slice(3).join("\0")!==["-autostart-playername=PlayBound Server","-autostart-seed=-1","-autostart-nonvisual","-quickstart","-nosound"].join("\0")) throw new Error("Unexpected 0 A.D. startup contract");
  const map=/^-autostart=((?:random|scenarios|skirmishes)\/[A-Za-z0-9_-]{1,64})$/.exec(args[0])?.[1];
  const slots=/^-autostart-host-players=([2-8])$/.exec(args[2])?.[1];
  if (!map || !slots) throw new Error("Invalid 0 A.D. typed settings");
  return {port:20595,config:JSON.stringify({map,maxPlayers:Number(slots)})};
}

function nativeIsolationLaunch({ gameSlug, communityServerId: id, binary, args, home, resourceLimits, identityProfile, settings }) {
  if (gameSlug === "ysoccer") {
    if (binary!=="/usr/bin/java" || args.length!==4 || args[0]!=="-jar" || args[1]!=="/opt/playbound-host/games/ysoccer/ysoccer-server.jar" || args[2]!==args[3] || !withinPort(args[2],54555,54575) || identityProfile!=="ysoccer-unix-v1" || identityMigrationMetadata(id,home)?.identityProfile!==identityProfile) throw new Error("Unexpected YSoccer identity contract");
    trustedExecutables(binary);
    return {profile:"ysoccer-bwrap-v1",resourceLimits,identityProfile,identityRuntime:{gameSlug,port:Number(args[2]),config:"{}"},binary:"/usr/bin/prlimit",args:[],cwd:"/",env:{PATH:"/usr/bin:/usr/games",LANG:"C.UTF-8"}};
  }
  const supported = {
    bzflag: ["/usr/games/bzfs", "bzflag-servers"],
    hedgewars: ["/usr/lib/hedgewars/bin/hedgewars-server", "hedgewars-servers"],
    openttd: ["/usr/games/openttd", "openttd-servers"],
    luanti: ["/usr/games/minetestserver", "luanti-servers"],
    openarena: ["/usr/lib/ioquake3/ioq3ded", "openarena-servers"],
    "battle-for-wesnoth": ["/usr/games/wesnothd-1.18", "wesnoth-servers"],
    supertuxkart: ["/usr/games/supertuxkart", "supertuxkart-servers"],
    "0-ad": ["/usr/games/pyrogenesis", "0ad-servers"],
  };
  const [expected, folder] = supported[gameSlug];
  let engineMount;
  if (binary !== expected) {
    const packageKey=gameSlug === "0-ad" ? "0ad" : gameSlug;
    const profile = NATIVE_PACKAGE_PROFILES[packageKey];
    const root = path.join("/opt/playbound-host/games", packageKey);
    if (!profile || binary !== path.join(root, profile.binary)) throw new Error("Customer isolation requires the reviewed system server");
    verifyNativePackageInstallation(root, packageKey);
    engineMount = binary;
  }
  trustedExecutables(binary);
  if (gameSlug === "0-ad") {
    if (identityProfile !== "0-ad-unix-v1" || identityMigrationMetadata(id,home)?.identityProfile !== identityProfile) throw new Error("Customer identity migration is not ready");
    return {profile:"0-ad-bwrap-v1",resourceLimits,identityProfile,identityRuntime:{gameSlug,...zeroAdIdentityConfiguration(args)},binary:"/usr/bin/prlimit",args:[],cwd:"/",env:{PATH:"/usr/bin:/usr/games",LANG:"C.UTF-8"}};
  }
  if (gameSlug === "supertuxkart") {
    if (identityProfile !== "supertuxkart-unix-v1" || identityMigrationMetadata(id,home)?.identityProfile !== identityProfile) throw new Error("Customer identity migration is not ready");
    return {profile:"supertuxkart-bwrap-v1",resourceLimits,identityProfile,identityRuntime:{gameSlug,...superTuxKartIdentityConfiguration(args)},binary:"/usr/bin/prlimit",args:[],cwd:"/",env:{PATH:"/usr/bin:/usr/games",LANG:"C.UTF-8"}};
  }
  if (gameSlug === "battle-for-wesnoth") {
    const config = "/opt/playbound-host/games/battle-for-wesnoth/wesnothd.cfg";
    const port = args.at(-1);
    if (identityProfile !== "battle-for-wesnoth-unix-v1" || identityMigrationMetadata(id,home)?.identityProfile !== identityProfile || !withinPort(port,15000,15020) || !(args.length === 2 && args[0] === "-p" || args.length === 4 && args[0] === "-c" && args[1] === config && args[2] === "-p")) throw new Error("Unexpected Wesnoth identity arguments");
    return {profile:"battle-for-wesnoth-bwrap-v1",resourceLimits,identityProfile,identityRuntime:{gameSlug,port:Number(port),config:"{}"},binary:"/usr/bin/prlimit",args:[],cwd:"/",env:{PATH:"/usr/bin:/usr/games",LANG:"C.UTF-8"}};
  }
  if (gameSlug === "openarena") {
    if (identityProfile !== "openarena-unix-v1" || identityMigrationMetadata(id,home)?.identityProfile !== identityProfile) throw new Error("Customer identity migration is not ready");
    return {profile:"openarena-bwrap-v1",resourceLimits,identityProfile,identityRuntime:{gameSlug,...openArenaIdentityConfiguration(args)},binary:"/usr/bin/prlimit",args:[],cwd:"/",env:{PATH:"/usr/bin:/usr/games",LANG:"C.UTF-8"}};
  }
  const data = path.join(home, folder, `pb-${id}`);
  if (!identityProfile) {
    privateDirectory(path.dirname(data));
    privateDirectory(data);
  }
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
    if (!identityProfile) regularFile(config, 64 * 1024);
    mounts.push([config, "/server/openttd.cfg"]);
    gameArgs = ["-D", args[1], "-c", "/server/openttd.cfg"];
  } else if (gameSlug === "luanti") {
    const config = path.join(data, "world", "playbound.conf");
    if (args.length !== 10 || args[0] !== "--port" || !withinPort(args[1], 30000, 30020) ||
        args.slice(2).join("\0") !== ["--world", path.join(data, "world"), "--gameid", "minetest", "--config", config, "--logfile", path.join(data, "minetest.log")].join("\0")) throw new Error("Unexpected Luanti isolation arguments");
    if (!identityProfile) regularFile(config, 64 * 1024);
    mounts.push([config, "/server/world/playbound.conf"]);
    gameArgs = ["--port", args[1], "--world", "/server/world", "--gameid", "minetest", "--config", "/server/world/playbound.conf", "--logfile", "/server/minetest.log"];
  }
  if (identityProfile) {
    const migration = identityMigrationMetadata(id, home);
    if (!migration || migration.identityProfile !== identityProfile) throw new Error("Customer identity migration is not ready");
    const config = gameSlug === "bzflag" ? { scoreLimit: Number(args[7]), maxPlayers: Number(args[9]) } : ["openttd","luanti"].includes(gameSlug) ? { maxPlayers: settings?.maxPlayers ?? 12 } : {};
    return { profile: `${gameSlug}-bwrap-v1`, resourceLimits, identityProfile, networkProfile: migration.networkProfile,
      identityRuntime: { gameSlug, port: Number(gameSlug === "openttd" ? args[1].slice(8) : args[1]), config: JSON.stringify(config) },
      binary: "/usr/bin/prlimit", args: [], cwd: "/", env: { PATH: "/usr/bin:/usr/games", LANG: "C.UTF-8" } };
  }
  return sandboxPlan({ gameSlug, binary: engineMount ? NATIVE_PACKAGE_PROFILES[gameSlug].systemBinary : expected, gameArgs, data, mounts, resourceLimits, engineMount });
}
