/** Reviewed engine profiles only. This builds the filesystem/process namespace
 * boundary; customerRuntime applies cgroup limits before running the plan.
 * Reviewed engine profiles have opt-in UID handoffs. Other host UIDs, network policy and
 * executable-plugin isolation remain unfinished.
 * There is deliberately no fallback to an unrestricted launch if setup fails.
 */
import fs from "node:fs";
import path from "node:path";
import { customerResourceLimits } from "./customerResourceLimits.js";
import { identityMigrationMetadata } from "./customerMigration.js";
import { NATIVE_PACKAGE_PROFILES, verifyNativePackageInstallation } from "./nativePackageUpdates.js";

export { CUSTOMER_IDENTITY_GAMES } from "./customerIdentityProfiles.js";
import { CUSTOMER_IDENTITY_GAMES, supportsCustomerIdentity } from "./customerIdentityProfiles.js";
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
function freshRvglIdentityCandidate(id, home) {
  if (!/^[a-f0-9]{24}$/.test(id || "") || home !== "/var/lib/playbound-host") return false;
  const exists = (filename) => { try { fs.lstatSync(filename); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; } };
  return !exists(path.join(home, "rvgl-servers", `pb-${id}`)) &&
    !exists(path.join("/var/lib/playbound-customer-runtime", id));
}

export function validateCustomerPreparation({ gameSlug, customerOwned, communityServerId: id, home, identityProfile }) {
  if (customerOwned && (supportsCustomerIdentity(gameSlug) && !CUSTOMER_ISOLATION_GAMES.includes(gameSlug)) && identityProfile) {
    if (identityProfile !== `${gameSlug}-unix-v1` ||
        (identityMigrationMetadata(id,home)?.identityProfile !== identityProfile &&
         !(gameSlug === "re-volt-rvgl" && freshRvglIdentityCandidate(id, home)))) throw new Error("Customer identity migration is not ready");
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

export function customerIsolationLaunch({ gameSlug, customerOwned, communityServerId, binary, args, home, resourceLimits, identityProfile, settings, startupPort, serverName, rconPassword }) {
  if (!customerOwned || (!CUSTOMER_ISOLATION_GAMES.includes(gameSlug) && !((supportsCustomerIdentity(gameSlug) && !CUSTOMER_ISOLATION_GAMES.includes(gameSlug)) && identityProfile))) return null;
  if (identityProfile !== undefined && (!CUSTOMER_IDENTITY_GAMES.includes(gameSlug) || identityProfile !== `${gameSlug}-unix-v1`)) throw new Error("Unsupported customer identity profile");
  const limits = customerResourceLimits(gameSlug, resourceLimits);
  validateCustomerPreparation({ gameSlug, customerOwned, communityServerId, home, identityProfile });
  if (!/^[a-f0-9]{24}$/i.test(communityServerId || "") || !path.isAbsolute(home)) throw new Error("Invalid isolation identity");
  if (!Array.isArray(args) || args.some(value => typeof value !== "string" || value.includes("\0"))) throw new Error("Invalid isolation arguments");
  if (gameSlug !== "teeworlds") return nativeIsolationLaunch({ gameSlug, communityServerId, binary, args, home, resourceLimits: limits, identityProfile, settings, startupPort, serverName, rconPassword });
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
  if (!values.headless || (!withinPort(values.port,2759,2777) || Number(values.port)%2!==1) || typeof name!=="string" || !name.length || name.length>100 || /[\x00-\x1f\x7f]/.test(name) || !Number.isInteger(maxPlayers) || maxPlayers<2 || maxPlayers>12 || ![0,1,3,4,6,7,8].includes(mode) || !Number.isInteger(difficulty) || difficulty<0 || difficulty>3) throw new Error("Invalid SuperTuxKart typed settings");
  return {port:Number(values.port),config:JSON.stringify({name,maxPlayers,mode,difficulty})};
}

export function zeroAdIdentityConfiguration(args) {
  if (!Array.isArray(args) || args.length!==8 || args[1]!=="-autostart-host" || args.slice(3).join("\0")!==["-autostart-playername=PlayBound Server","-autostart-seed=-1","-autostart-nonvisual","-quickstart","-nosound"].join("\0")) throw new Error("Unexpected 0 A.D. startup contract");
  const map=/^-autostart=((?:random|scenarios|skirmishes)\/[A-Za-z0-9_-]{1,64})$/.exec(args[0])?.[1];
  const slots=/^-autostart-host-players=([2-8])$/.exec(args[2])?.[1];
  if (!map || !slots) throw new Error("Invalid 0 A.D. typed settings");
  return {port:20595,config:JSON.stringify({map,maxPlayers:Number(slots)})};
}

export function coreKeeperIdentityConfiguration(args, port, serverId, home, name) {
  if (!Array.isArray(args) || args.length !== 14 || args.some(arg => typeof arg !== "string" || arg.includes("\0")) ||
      !/^[a-f0-9]{24}$/.test(serverId || "") || home !== "/var/lib/playbound-host" ||
      !Number.isInteger(port) || port < 1300 || port > 1320 || (port - 1300) % 2 ||
      typeof name !== "string" || !name.length || name.length > 80 || /[\x00-\x1f\x7f]/.test(name) ||
      !/^[1-9]\d*$/.test(args[9])) throw new Error("Unexpected Core Keeper identity contract");
  const maxPlayers = Number(args[9]);
  if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 64) throw new Error("Invalid Core Keeper slots");
  const data = path.posix.join(home, "core-keeper-servers", `pb-${serverId}`, "data");
  const expected = ["-a", "--", "/opt/playbound-host/games/core-keeper/CoreKeeperServer", "-batchmode", "-ip", "0.0.0.0",
    "-port", String(port), "-maxplayers", String(maxPlayers), "-datapath", data, "-logfile", path.posix.join(data, "server.log")];
  if (args.join("\0") !== expected.join("\0")) throw new Error("Unexpected Core Keeper launch arguments");
  return { name, maxPlayers };
}

export function sourceIdentityConfiguration(game, args, port) {
  if (!["team-fortress-2","counter-strike-2","counter-strike-source"].includes(game)||!Array.isArray(args)||args.length>64) throw new Error("Unknown native Source contract");
  const tf=game==="team-fortress-2",css=game==="counter-strike-source",values=Object.create(null),flags=new Set();
  const flagNames=new Set(["-dedicated","-norestart","-usercon",...(css?["-strictportbind","-nohltv"]:[])]);
  const valueNames=new Set(["-game","+ip","+map",...(css?["+mp_timelimit","+clientport"]:[]),tf?"+maxplayers":"-maxplayers","-port","+hostname","+rcon_password",tf?"+tf_bot_join_after_player":"+bot_join_after_player",tf?"+tf_bot_quota_mode":"+bot_quota_mode",tf?"+tf_bot_quota":"+bot_quota"]);
  for(let index=0;index<args.length;index++) {
    const key=args[index];
    if(flagNames.has(key)) { if(flags.has(key))throw new Error("Repeated Source flag"); flags.add(key); continue; }
    if(!valueNames.has(key)||Object.hasOwn(values,key)||typeof args[index+1]!=="string")throw new Error("Unexpected Source argument");
    values[key]=args[++index];
  }
  const rawName=values["+hostname"],name=(tf||css)&&rawName?.startsWith('"')&&rawName?.endsWith('"')?rawName.slice(1,-1):rawName;
  const rawSlots=values[tf?"+maxplayers":"-maxplayers"],rawBots=values[tf?"+tf_bot_quota":"+bot_quota"]??"0";
  const maxPlayers=Number(rawSlots),botFill=Number(rawBots),rconPassword=values["+rcon_password"]??"";
  if((!css&&!flags.has("-dedicated"))||(tf&&!flags.has("-norestart"))||(tf&&values["-game"]!=="tf")||(css&&values["-game"]!=="cstrike")||(!tf&&!css&&values["-game"]!==undefined)||values["+ip"]!==undefined&&values["+ip"]!=="0.0.0.0"||values["-port"]!==String(port)||!Number.isInteger(port)||port<(tf?27015:css?27060:27030)||port>(tf?27025:css?27070:27040)||!/^\d+$/.test(rawSlots??"")||!/^\d+$/.test(rawBots)||maxPlayers<2||maxPlayers>(tf?32:64)||botFill<0||botFill>=maxPlayers||!Number.isInteger(botFill)||typeof name!=="string"||!name.length||name.length>100||rconPassword.length>128||[name,rconPassword].some(value=>/[\x00-\x1f\x7f"\\;]/.test(value))||!/^[A-Za-z0-9_-]{1,64}$/.test(values["+map"]??""))throw new Error("Invalid native Source settings");
  const quota=tf?"+tf_bot_quota":"+bot_quota",mode=tf?"+tf_bot_quota_mode":"+bot_quota_mode",join=tf?"+tf_bot_join_after_player":"+bot_join_after_player";
  if(Object.hasOwn(values,quota)&&(values[mode]!=="fill"||values[join]!=="0")||!Object.hasOwn(values,quota)&&(Object.hasOwn(values,mode)||Object.hasOwn(values,join)))throw new Error("Unexpected Source bot mode");
  if(css&&(values["+clientport"]!==String(port+1000)||!/^\d+$/.test(values["+mp_timelimit"]??"")||Number(values["+mp_timelimit"])>600))throw new Error("Invalid Source time limit");
  return {name,maxPlayers,map:values["+map"],botFill,rconPassword,...(css?{timeLimit:Number(values["+mp_timelimit"])}:{})};
}

export function openFortressIdentityConfiguration(args,startupPort,serverName,rconPassword) {
  if(!Array.isArray(args)||args.length>64||!Number.isInteger(startupPort)||startupPort<27150||startupPort>27169)throw new Error("Invalid Open Fortress allocation");
    const flags=new Set(),values=Object.create(null),flagNames=new Set(["-norestart","-strictportbind","-nohltv"]),valueNames=new Set(["-game","-ip","-port","+clientport","+exec","+map","+maxplayers","+mp_timelimit","+tf_bot_join_after_player","+tf_bot_quota_mode","+tf_bot_quota"]);
    for(let i=0;i<args.length;i++){
      const key=args[i];
      if(flagNames.has(key)){if(flags.has(key))throw new Error("Repeated Open Fortress flag");flags.add(key);continue;}
      if(!valueNames.has(key)||Object.hasOwn(values,key)||typeof args[i+1]!=="string")throw new Error("Unexpected Open Fortress argument");
      values[key]=args[++i];
    }
    const maxPlayers=Number(values["+maxplayers"]),botFill=Number(values["+tf_bot_quota"]??0),timeLimit=Number(values["+mp_timelimit"]);
    if(flags.size!==3||values["-game"]!=="open_fortress"||values["-ip"]!=="0.0.0.0"||values["-port"]!==String(startupPort)||values["+clientport"]!==String(startupPort+1000)||values["+exec"]!=="playbound-managed.cfg"||!/^[A-Za-z0-9_-]{1,64}$/.test(values["+map"]??"")||!Number.isInteger(maxPlayers)||maxPlayers<2||maxPlayers>32||!Number.isInteger(botFill)||botFill<0||botFill>=maxPlayers||!Number.isInteger(timeLimit)||timeLimit<0||timeLimit>600||typeof serverName!=="string"||!serverName.length||serverName.length>100||/[\x00-\x1f\x7f"\\;]/.test(serverName)||rconPassword!==undefined&&(typeof rconPassword!=="string"||!/^[A-Za-z0-9_-]{1,128}$/.test(rconPassword)))throw new Error("Invalid Open Fortress settings");
    if(Object.hasOwn(values,"+tf_bot_quota")&&(values["+tf_bot_quota_mode"]!=="fill"||values["+tf_bot_join_after_player"]!=="0")||!Object.hasOwn(values,"+tf_bot_quota")&&(Object.hasOwn(values,"+tf_bot_quota_mode")||Object.hasOwn(values,"+tf_bot_join_after_player")))throw new Error("Invalid Open Fortress bot mode");
    return {name:serverName,maxPlayers,map:values["+map"],botFill,timeLimit,rconPassword:rconPassword??""};
}

export function rvglIdentityConfiguration(args, port) {
  if (!Number.isInteger(port) || port < 2310 || port > 2330 || !Array.isArray(args)) throw new Error("Invalid RVGL allocation");
  const expected = ["-n",String(port),"-f",`/var/lib/playbound-host/rvgl-displays/${port}.xauth`,
    "-s","-screen 0 640x480x24 -nolisten tcp","/opt/playbound-host/games/re-volt-rvgl/rvgl.64",
    "-lobby","-profile","PlayBound","-serverport",String(port),"-nosound","-window","640","480"];
  if (args.length !== expected.length || args.some((value,index) => value !== expected[index])) throw new Error("Unexpected RVGL launch arguments");
  return {};
}

function nativeIsolationLaunch({ gameSlug, communityServerId: id, binary, args, home, resourceLimits, identityProfile, settings, startupPort, serverName, rconPassword }) {
  if (gameSlug === "re-volt-rvgl") {
    if (binary !== "/usr/bin/xvfb-run" || home !== "/var/lib/playbound-host" || identityProfile !== "re-volt-rvgl-unix-v1" ||
        (identityMigrationMetadata(id,home)?.identityProfile !== identityProfile && !freshRvglIdentityCandidate(id,home))) throw new Error("RVGL identity migration is not ready");
    const configuration = rvglIdentityConfiguration(args,startupPort);
    if (settings && Object.keys(settings).length) throw new Error("RVGL identity settings are not verified");
    return {profile:"re-volt-rvgl-bwrap-v1",resourceLimits,identityProfile,
      identityRuntime:{gameSlug,port:startupPort,config:JSON.stringify(configuration)},
      binary:"/usr/bin/prlimit",args:[],cwd:"/",env:{PATH:"/usr/bin:/usr/games",LANG:"C.UTF-8"}};
  }
  if (gameSlug === "core-keeper") {
    if (binary !== "/usr/bin/xvfb-run" || identityProfile !== "core-keeper-unix-v1" ||
        identityMigrationMetadata(id, home)?.identityProfile !== identityProfile) throw new Error("Core Keeper identity migration is not ready");
    const configuration = coreKeeperIdentityConfiguration(args, startupPort, id, home, serverName);
    return {profile:"core-keeper-bwrap-v1",resourceLimits,identityProfile,
      identityRuntime:{gameSlug,port:startupPort,config:JSON.stringify(configuration)},
      binary:"/usr/bin/prlimit",args:[],cwd:"/",env:{PATH:"/usr/bin:/usr/games",LANG:"C.UTF-8"}};
  }
  if(gameSlug==="battlefield-1942-anthology") {
    const configuration={name:serverName,maxPlayers:Math.min(64,settings?.maxPlayers??12),map:settings?.map??"berlin",gameMode:settings?.gameMode??"GPM_CQ",botSkill:settings?.botSkill??75};
    if(binary!=="/opt/playbound-host/games/battlefield-1942-anthology/bf1942_lnxded.static"||identityProfile!=="battlefield-1942-anthology-unix-v1"||identityMigrationMetadata(id,home)?.identityProfile!==identityProfile||args.join("\0")!==["+overlayPath",path.join(home,"battlefield-1942-anthology-servers",`pb-${id}`)].join("\0")||!Number.isInteger(startupPort)||startupPort<14567||startupPort>14586||typeof serverName!=="string"||!serverName.length||serverName.length>80||/[\x00-\x1f\x7f"\\;]/.test(serverName)||!Number.isInteger(configuration.maxPlayers)||configuration.maxPlayers<2||typeof configuration.map!=="string"||!/^[A-Za-z0-9_]{1,64}$/.test(configuration.map)||!["GPM_CQ","GPM_COOP"].includes(configuration.gameMode)||!Number.isInteger(configuration.botSkill)||configuration.botSkill<1||configuration.botSkill>100)throw new Error("Unexpected Battlefield identity contract");
    return {profile:"battlefield-1942-anthology-bwrap-v1",resourceLimits,identityProfile,identityRuntime:{gameSlug,port:startupPort,config:JSON.stringify(configuration)},binary:"/usr/bin/prlimit",args:[],cwd:"/",env:{PATH:"/usr/bin:/usr/games",LANG:"C.UTF-8"}};
  }
  if(gameSlug==="open-fortress") {
    if(binary!=="/opt/playbound-host/games/open-fortress/runtime/srcds_linux"||identityProfile!=="open-fortress-unix-v1"||identityMigrationMetadata(id,home)?.identityProfile!==identityProfile||!Number.isInteger(startupPort)||startupPort<27150||startupPort>27169)throw new Error("Unexpected Open Fortress identity contract");
    const configuration=openFortressIdentityConfiguration(args,startupPort,serverName,rconPassword);
    return {profile:"open-fortress-bwrap-v1",resourceLimits,identityProfile,identityRuntime:{gameSlug,port:startupPort,config:JSON.stringify(configuration)},binary:"/usr/bin/prlimit",args:[],cwd:"/",env:{PATH:"/usr/bin:/usr/games",LANG:"C.UTF-8"}};
  }
  if(["team-fortress-2","counter-strike-2","counter-strike-source"].includes(gameSlug)) {
    const expected=gameSlug==="team-fortress-2"?"/opt/playbound-host/games/team-fortress-2/srcds_linux64":gameSlug==="counter-strike-source"?"/opt/playbound-host/games/counter-strike-source/srcds_linux":"/opt/playbound-host/games/counter-strike-2/game/bin/linuxsteamrt64/cs2";
    if(binary!==expected||identityProfile!==`${gameSlug}-unix-v1`||identityMigrationMetadata(id,home)?.identityProfile!==identityProfile)throw new Error("Unexpected native Source identity contract");
    const configuration=sourceIdentityConfiguration(gameSlug,args,startupPort);
    return {profile:`${gameSlug}-bwrap-v1`,resourceLimits,identityProfile,identityRuntime:{gameSlug,port:startupPort,config:JSON.stringify(configuration)},binary:"/usr/bin/prlimit",args:[],cwd:"/",env:{PATH:"/usr/bin:/usr/games",LANG:"C.UTF-8"}};
  }
  if(gameSlug==="dont-starve-together") {
    const slots=settings?.maxPlayers??12,configuration={name:serverName,maxPlayers:slots};
    const expected=["-persistent_storage_root",path.join(home,"dont-starve-together-servers",`pb-${id}`),"-conf_dir","PlayBound","-cluster","Cluster_1","-shard","Master","-port",String(startupPort),"-players",String(slots),"-steam_master_server_port",String(startupPort+1),"-steam_authentication_port",String(startupPort+2)];
    if(binary!=="/opt/playbound-host/games/dont-starve-together/bin64/dontstarve_dedicated_server_nullrenderer_x64"||identityProfile!=="dont-starve-together-unix-v1"||identityMigrationMetadata(id,home)?.identityProfile!==identityProfile||args.join("\0")!==expected.join("\0")||!Number.isInteger(startupPort)||startupPort<11020||startupPort>11041||(startupPort-11020)%3||typeof serverName!=="string"||!serverName.length||serverName.length>80||/[\x00-\x1f\x7f]/.test(serverName)||!Number.isInteger(slots)||slots<2||slots>64)throw new Error("Unexpected DST identity contract");
    return {profile:"dont-starve-together-bwrap-v1",resourceLimits,identityProfile,identityRuntime:{gameSlug,port:startupPort,config:JSON.stringify(configuration)},binary:"/usr/bin/prlimit",args:[],cwd:"/",env:{PATH:"/usr/bin:/usr/games",LANG:"C.UTF-8"}};
  }
  if(gameSlug==="trackmania") {
    const configuration={name:serverName,maxPlayers:settings?.maxPlayers??12};
    if(binary!=="/opt/playbound-host/games/trackmania/runtime/TrackmaniaServer"||identityProfile!=="trackmania-unix-v1"||identityMigrationMetadata(id,home)?.identityProfile!==identityProfile||args.join("\0")!==["/dedicated_cfg=dedicated_cfg.txt","/game_settings=MatchSettings/example.txt","/nodaemon"].join("\0")||!Number.isInteger(startupPort)||startupPort<23520||startupPort>23538||(startupPort-23520)%2||typeof serverName!=="string"||!serverName.length||serverName.length>100||/[\x00-\x1f\x7f]/.test(serverName)||!Number.isInteger(configuration.maxPlayers)||configuration.maxPlayers<2||configuration.maxPlayers>64)throw new Error("Unexpected Trackmania identity contract");
    return {profile:"trackmania-bwrap-v1",resourceLimits,identityProfile,identityRuntime:{gameSlug,port:startupPort,config:JSON.stringify(configuration)},binary:"/usr/bin/prlimit",args:[],cwd:"/",env:{PATH:"/usr/bin:/usr/games",LANG:"C.UTF-8"}};
  }
  if(gameSlug==="unturned") {
    const configuration={name:serverName,maxPlayers:settings?.maxPlayers??12,map:settings?.map??"PEI",perspective:settings?.perspective??"Both",pve:settings?.pve===true,cheats:settings?.cheats===true};
    if(binary!=="/opt/playbound-host/games/unturned/Unturned_Headless.x86_64"||identityProfile!=="unturned-unix-v1"||identityMigrationMetadata(id,home)?.identityProfile!==identityProfile||args.join("\0")!==`+InternetServer/pb-${id}`||!Number.isInteger(startupPort)||startupPort<27075||startupPort>27099||(startupPort-27075)%3||typeof serverName!=="string"||!serverName.length||serverName.length>100||/[\x00-\x1f\x7f]/.test(serverName)||!Number.isInteger(configuration.maxPlayers)||configuration.maxPlayers<2||configuration.maxPlayers>64||!["PEI","Washington","Yukon","Russia","Germany"].includes(configuration.map)||!["Both","First","Third","Vehicle"].includes(configuration.perspective))throw new Error("Unexpected Unturned identity contract");
    return {profile:"unturned-bwrap-v1",resourceLimits,identityProfile,identityRuntime:{gameSlug,port:startupPort,config:JSON.stringify(configuration)},binary:"/usr/bin/prlimit",args:[],cwd:"/",env:{PATH:"/usr/bin:/usr/games",LANG:"C.UTF-8"}};
  }
  if(gameSlug==="bombsquad") {
    const configuration={name:serverName,maxPlayers:Number(args[2])};
    if(binary!=="/opt/playbound-host/games/bombsquad/runtime/dist/bombsquad_headless"||identityProfile!=="bombsquad-unix-v1"||identityMigrationMetadata(id,home)?.identityProfile!==identityProfile||args.length!==4||args[0]!==String(startupPort)||args[1]!==serverName||args[3]!==id||!Number.isInteger(startupPort)||startupPort<43210||startupPort>43230||typeof serverName!=="string"||!serverName.length||serverName.length>100||/[\x00-\x1f\x7f]/.test(serverName)||!Number.isInteger(configuration.maxPlayers)||configuration.maxPlayers<2||configuration.maxPlayers>8)throw new Error("Unexpected BombSquad identity contract");
    return {profile:"bombsquad-bwrap-v1",resourceLimits,identityProfile,identityRuntime:{gameSlug,port:startupPort,config:JSON.stringify(configuration)},binary:"/usr/bin/prlimit",args:[],cwd:"/",env:{PATH:"/usr/bin:/usr/games",LANG:"C.UTF-8"}};
  }
  if(gameSlug==="morrowind") {
    const configuration={name:settings?.hostname??serverName,maxPlayers:settings?.maximumPlayers??settings?.maxPlayers??8,password:settings?.password??"",gameMode:settings?.gameMode??"Default"};
    if(binary!=="/opt/playbound-host/games/morrowind/tes3mp-server.x86_64"||identityProfile!=="morrowind-unix-v1"||identityMigrationMetadata(id,home)?.identityProfile!==identityProfile||args.join("\0")!==["--resources","/opt/playbound-host/games/morrowind/resources"].join("\0")||!Number.isInteger(startupPort)||startupPort<25565||startupPort>25585||!Number.isInteger(configuration.maxPlayers)||configuration.maxPlayers<2||configuration.maxPlayers>64||typeof configuration.gameMode!=="string"||!/^[A-Za-z0-9 _-]{1,64}$/.test(configuration.gameMode)||[[configuration.name,100],[configuration.password,128]].some(([value,limit])=>typeof value!=="string"||value.length>limit||/[\x00-\x1f\x7f]/.test(value))||!configuration.name)throw new Error("Unexpected TES3MP identity contract");
    return {profile:"morrowind-bwrap-v1",resourceLimits,identityProfile,identityRuntime:{gameSlug,port:startupPort,config:JSON.stringify(configuration)},binary:"/usr/bin/prlimit",args:[],cwd:"/",env:{PATH:"/usr/bin:/usr/games",LANG:"C.UTF-8"}};
  }
  if(gameSlug==="barotrauma") {
    const configuration={name:serverName,maxPlayers:Math.min(16,settings?.maxPlayers??12)};
    if(binary!=="/opt/playbound-host/games/barotrauma/DedicatedServer"||identityProfile!=="barotrauma-unix-v1"||identityMigrationMetadata(id,home)?.identityProfile!==identityProfile||args.length||!Number.isInteger(startupPort)||startupPort<27220||startupPort>27238||(startupPort-27220)%2||typeof configuration.name!=="string"||!configuration.name.length||configuration.name.length>80||/[\x00-\x1f\x7f]/.test(configuration.name)||!Number.isInteger(configuration.maxPlayers)||configuration.maxPlayers<2)throw new Error("Unexpected Barotrauma identity contract");
    return {profile:"barotrauma-bwrap-v1",resourceLimits,identityProfile,identityRuntime:{gameSlug,port:startupPort,config:JSON.stringify(configuration)},binary:"/usr/bin/prlimit",args:[],cwd:"/",env:{PATH:"/usr/bin:/usr/games",LANG:"C.UTF-8"}};
  }
  if(gameSlug==="veloren") {
    if(binary!=="/opt/playbound-host/games/veloren/runtime/veloren-server-cli"||identityProfile!=="veloren-unix-v1"||identityMigrationMetadata(id,home)?.identityProfile!==identityProfile||args.length||startupPort!==14004)throw new Error("Unexpected Veloren identity contract");
    const configuration={name:serverName||"PlayBound Dedicated",maxPlayers:settings?.maxPlayers??16};
    return {profile:"veloren-bwrap-v1",resourceLimits,identityProfile,identityRuntime:{gameSlug,port:startupPort,config:JSON.stringify(configuration)},binary:"/usr/bin/prlimit",args:[],cwd:"/",env:{PATH:"/usr/bin:/usr/games",LANG:"C.UTF-8"}};
  }
  if(gameSlug==="necesse") {
    const slots=Number(args[8]);
    const expected=["-jar","/opt/playbound-host/games/necesse/Server.jar","-nogui","-world","PlayBound","-port",String(startupPort),"-slots",String(slots),"-datadir",path.join(home,"necesse-servers",`pb-${id}`),"-pausewhenempty","0"];
    if(binary!=="/opt/playbound-host/games/necesse/jre/bin/java"||identityProfile!=="necesse-unix-v1"||identityMigrationMetadata(id,home)?.identityProfile!==identityProfile||args.join("\0")!==expected.join("\0")||!Number.isInteger(startupPort)||startupPort<14160||startupPort>14180||!Number.isInteger(slots)||slots<2||slots>64)throw new Error("Unexpected Necesse identity contract");
    return {profile:"necesse-bwrap-v1",resourceLimits,identityProfile,identityRuntime:{gameSlug,port:startupPort,config:JSON.stringify({maxPlayers:slots})},binary:"/usr/bin/prlimit",args:[],cwd:"/",env:{PATH:"/usr/bin:/usr/games",LANG:"C.UTF-8"}};
  }
  if(gameSlug==="triplea") {
    const expected=["-server",`-Duser.home=${path.join(home,"triplea-servers",`pb-${id}`)}`,"-Xmx512M","-Djava.awt.headless=true","-jar","/opt/playbound-host/games/triplea/bin/game-headless.jar","-Ptriplea.server=true","-Ptriplea.server.password="];
    if(binary!=="/opt/playbound-host/jre/temurin-25/bin/java"||identityProfile!=="triplea-unix-v1"||identityMigrationMetadata(id,home)?.identityProfile!==identityProfile||args.join("\0")!==expected.join("\0")||!Number.isInteger(startupPort)||startupPort<3303||startupPort>3323)throw new Error("Unexpected TripleA identity contract");
    return {profile:"triplea-bwrap-v1",resourceLimits,identityProfile,identityRuntime:{gameSlug,port:startupPort,config:"{}"},binary:"/usr/bin/prlimit",args:[],cwd:"/",env:{PATH:"/usr/bin:/usr/games",LANG:"C.UTF-8"}};
  }
  if(gameSlug==="space-station-14") {
    if(binary!=="/opt/playbound-host/games/space-station-14/runtime/Robust.Server"||identityProfile!=="space-station-14-unix-v1"||identityMigrationMetadata(id,home)?.identityProfile!==identityProfile||!Number.isInteger(startupPort)||startupPort<1212||startupPort>1222)throw new Error("Unexpected SS14 identity contract");
    const configuration={name:serverName||"PlayBound Community Server",softMaxPlayers:settings?.["game.soft_max_players"]??64,lobbyEnabled:settings?.["game.lobbyenabled"]??true};
    return {profile:"ss14-bwrap-v1",resourceLimits,identityProfile,identityRuntime:{gameSlug,port:startupPort,config:JSON.stringify(configuration)},binary:"/usr/bin/prlimit",args:[],cwd:"/",env:{PATH:"/usr/bin:/usr/games",LANG:"C.UTF-8"}};
  }
  if(gameSlug==="rimworld-together") {
    if(binary!=="/opt/playbound-host/games/rimworld-together/RTServer"||identityProfile!=="rimworld-together-unix-v1"||identityMigrationMetadata(id,home)?.identityProfile!==identityProfile||args.length||!Number.isInteger(startupPort)||startupPort<25590||startupPort>25610)throw new Error("Unexpected RimWorld identity contract");
    const configuration={name:serverName||"PlayBound Dedicated",maxPlayers:settings?.maxPlayers??16,settings:settings||{}};
    return {profile:"rimworld-bwrap-v1",resourceLimits,identityProfile,identityRuntime:{gameSlug,port:startupPort,config:JSON.stringify(configuration)},binary:"/usr/bin/prlimit",args:[],cwd:"/",env:{PATH:"/usr/bin:/usr/games",LANG:"C.UTF-8"}};
  }
  if(["openra","openhv","earth-2140-trilogy"].includes(gameSlug)) {
    const families={openra:["OpenRA.Server",["ra","cnc","d2k"]],openhv:["OpenHV.Server",["hv"]],"combined-arms":["OpenRA.Server",["ca"]],"earth-2140-trilogy":["OpenE2140",["e2140"]],"romanovs-vengeance":["OpenRA.Server",["rv"]],"tiberian-dawn-hd":["OpenRA.Server",["cnc"]],"crystallized-nexus":["OpenRA.Server",["cn"]]};
    const family=Object.keys(families).find(key=>binary===`/opt/playbound-host/games/${key}/${families[key][0]}`);
    if(!family||(gameSlug!=="openra"&&family!==gameSlug)||identityProfile!==`${gameSlug}-unix-v1`||identityMigrationMetadata(id,home)?.identityProfile!==identityProfile)throw new Error("Unexpected OpenRA identity contract");
    const input=args[0]==="--server"?args.slice(1):args;
    const values={};
    for(const argument of input){const equal=argument.indexOf("=");const key=argument.slice(0,equal);if(equal<1||!["Game.Mod","Server.Name","Server.ListenPort","Server.AdvertiseOnline","Server.EnableSingleplayer","Server.LockBots","Server.OrderLatency"].includes(key)||Object.hasOwn(values,key))throw new Error("Undeclared OpenRA startup argument");values[key]=argument.slice(equal+1);}
    const range={openra:[1234,1250],openhv:[1255,1270],"earth-2140-trilogy":[1275,1290]}[gameSlug];
    if(Object.keys(values).length!==7||!families[family][1].includes(values["Game.Mod"])||values["Server.ListenPort"]!==String(startupPort)||!Number.isInteger(startupPort)||startupPort<range[0]||startupPort>range[1]||!["True","False"].includes(values["Server.AdvertiseOnline"])||values["Server.OrderLatency"]!=="5"||!["True","False"].includes(values["Server.EnableSingleplayer"])||!["True","False"].includes(values["Server.LockBots"])||!values["Server.Name"]?.length||values["Server.Name"].length>100||/[\x00-\x1f\x7f]/.test(values["Server.Name"]))throw new Error("Invalid OpenRA typed setting");
    const configuration={family,mod:values["Game.Mod"],name:values["Server.Name"],enableSingleplayer:values["Server.EnableSingleplayer"]==="True",lockBots:values["Server.LockBots"]==="True"};
    return {profile:"openra-bwrap-v1",resourceLimits,identityProfile,identityRuntime:{gameSlug,port:startupPort,config:JSON.stringify(configuration)},binary:"/usr/bin/prlimit",args:[],cwd:"/",env:{PATH:"/usr/bin:/usr/games",LANG:"C.UTF-8"}};
  }
  if(gameSlug==="unvanquished") {
    if(binary!=="/opt/playbound-host/games/unvanquished/daemonded"||identityProfile!=="unvanquished-unix-v1"||identityMigrationMetadata(id,home)?.identityProfile!==identityProfile||args[0]!=="-homepath"||args[1]!==path.join(home,"unvanquished",`pb-${id}`))throw new Error("Unexpected Unvanquished identity contract");
    let offset=2;const paths=new Set();
    while(args[offset]==="-pakpath") {
      const item=args[offset+1];
      if(![path.join(home,".local/share/unvanquished/pkg"),"/opt/playbound-host/games/unvanquished/pkg"].includes(item)||paths.has(item))throw new Error("Unexpected Unvanquished package path");
      paths.add(item);offset+=2;
    }
    const values={};
    while(args[offset]==="-set") {
      const key=args[offset+1];
      if(!["net_port","sv_hostname","sv_maxclients","g_bot_defaultFill"].includes(key)||Object.hasOwn(values,key))throw new Error("Unexpected Unvanquished setting");
      values[key]=args[offset+2];offset+=3;
    }
    if(offset!==args.length-2||args[offset]!=="+map"||values.net_port!==String(startupPort)||!Number.isInteger(startupPort)||startupPort<27965||startupPort>27975)throw new Error("Unexpected Unvanquished startup arguments");
    const configuration={name:values.sv_hostname,maxPlayers:Number(values.sv_maxclients),botFill:Number(values.g_bot_defaultFill??0),map:args[offset+1]};
    if(typeof configuration.name!=="string"||!configuration.name.length||configuration.name.length>100||/[\x00-\x1f\x7f]/.test(configuration.name)||!/^\d+$/.test(values.sv_maxclients||"")||!Number.isInteger(configuration.maxPlayers)||configuration.maxPlayers<2||configuration.maxPlayers>64||!/^\d+$/.test(values.g_bot_defaultFill??"0")||configuration.botFill<0||configuration.botFill>32||! /^[A-Za-z0-9_-]{1,64}$/.test(configuration.map))throw new Error("Invalid Unvanquished typed setting");
    return {profile:"unvanquished-bwrap-v1",resourceLimits,identityProfile,identityRuntime:{gameSlug,port:startupPort,config:JSON.stringify(configuration)},binary:"/usr/bin/prlimit",args:[],cwd:"/",env:{PATH:"/usr/bin:/usr/games",LANG:"C.UTF-8"}};
  }
  if(gameSlug==="factorio") {
    const directory=path.join(home,"factorio-servers",`pb-${id}`);
    const expected=["--config",path.join(directory,"config.ini"),"--start-server",path.join(directory,"saves","save.zip"),"--server-settings",path.join(directory,"server-settings.json"),"--port",String(startupPort),"--bind","0.0.0.0"];
    if(binary!=="/opt/playbound-host/games/factorio/bin/x64/factorio" || identityProfile!=="factorio-unix-v1" || identityMigrationMetadata(id,home)?.identityProfile!==identityProfile || args.join("\0")!==expected.join("\0"))throw new Error("Unexpected Factorio identity contract");
    const configuration={name:serverName||"PlayBound Dedicated",maxPlayers:settings?.maxPlayers??16,port:startupPort};
    if(typeof configuration.name!=="string"||!configuration.name.length||configuration.name.length>64||/[\x00-\x1f\x7f]/.test(configuration.name)||!Number.isInteger(configuration.maxPlayers)||configuration.maxPlayers<2||configuration.maxPlayers>64||!Number.isInteger(startupPort)||startupPort<34197||startupPort>34217)throw new Error("Invalid Factorio typed setting");
    return {profile:"factorio-bwrap-v1",resourceLimits,identityProfile,identityRuntime:{gameSlug,port:startupPort,config:JSON.stringify(configuration)},binary:"/usr/bin/prlimit",args:[],cwd:"/",env:{PATH:"/usr/bin:/usr/games",LANG:"C.UTF-8"}};
  }
  if(gameSlug==="terraria") {
    const expectedWorld=path.join(home,"terraria-servers",`pb-${id}`,"Worlds","world.wld");
    if(binary!=="/opt/playbound-host/games/terraria/1458/Linux/TerrariaServer.bin.x86_64" || identityProfile!=="terraria-unix-v1" || identityMigrationMetadata(id,home)?.identityProfile!==identityProfile || args.length!==11 || args[0]!=="-port" || args[1]!==String(startupPort) || args[2]!=="-maxplayers" || args[4]!=="-world" || args[5]!==expectedWorld || args[6]!=="-autocreate" || args[7]!=="2" || args[8]!=="-worldname" || args[10]!=="-noupnp")throw new Error("Unexpected Terraria identity contract");
    const configuration={name:args[9],maxPlayers:Number(args[3])};
    if(!Number.isInteger(startupPort)||startupPort<7870||startupPort>7890||!configuration.name.length||configuration.name.length>48||/[\x00-\x1f\x7f]/.test(configuration.name)||!Number.isInteger(configuration.maxPlayers)||configuration.maxPlayers<2||configuration.maxPlayers>64)throw new Error("Invalid Terraria typed setting");
    return {profile:"terraria-bwrap-v1",resourceLimits,identityProfile,identityRuntime:{gameSlug,port:startupPort,config:JSON.stringify(configuration)},binary:"/usr/bin/prlimit",args:[],cwd:"/",env:{PATH:"/usr/bin:/usr/games",LANG:"C.UTF-8"}};
  }
  if(gameSlug==="hypersomnia") {
    const expected=["--appimage-extract-and-run","--no-update-on-launch","--dedicated-server","--server-port",String(startupPort),"--appdata-dir",path.join(home,"hypersomnia",`pb-${id}`)];
    if(binary!=="/opt/playbound-host/games/hypersomnia/Hypersomnia-Headless.AppImage" || identityProfile!=="hypersomnia-unix-v1" || identityMigrationMetadata(id,home)?.identityProfile!==identityProfile || args.join("\0")!==expected.join("\0"))throw new Error("Unexpected Hypersomnia identity contract");
    const configuration={name:String(serverName||"PlayBound Party").replace(/[\x00-\x1f\x7f]+/g," ").trim().slice(0,40),maxPlayers:settings?.maxPlayers??16};
    if(!Number.isInteger(startupPort)||startupPort<8412||startupPort>8432||!configuration.name.length||!Number.isInteger(configuration.maxPlayers)||configuration.maxPlayers<2||configuration.maxPlayers>64)throw new Error("Invalid Hypersomnia typed setting");
    return {profile:"hypersomnia-bwrap-v1",resourceLimits,identityProfile,identityRuntime:{gameSlug,port:startupPort,config:JSON.stringify(configuration)},binary:"/usr/bin/prlimit",args:[],cwd:"/",env:{PATH:"/usr/bin:/usr/games",LANG:"C.UTF-8"}};
  }
  if(gameSlug==="warzone-2100") {
    const expected=["--datadir=/opt/playbound-host/games/warzone-2100/runtime/data",`--configdir=${path.join(home,"warzone-2100-servers",`pb-${id}`)}`,`--autohost=pb-${id.slice(-16)}.json`,`--gameport=${startupPort}`,"--startplayers=1","--headless","--nosound"];
    if(binary!=="/opt/playbound-host/games/warzone-2100/runtime/warzone2100" || identityProfile!=="warzone-2100-unix-v1" || identityMigrationMetadata(id,home)?.identityProfile!==identityProfile || args.join("\0")!==expected.join("\0"))throw new Error("Unexpected Warzone identity contract");
    const configuration={name:String(serverName||"PlayBound.club Party").slice(0,40),map:settings?.map??"Sk-Mountain",maxPlayers:Math.min(settings?.maxPlayers??8,8),techLevel:settings?.techLevel??1,bases:settings?.bases??2,powerLevel:settings?.powerLevel??1,alliances:settings?.alliances??0,scavengers:settings?.scavengers??0,openSpectatorSlots:settings?.openSpectatorSlots??4};
    if(!Number.isInteger(startupPort)||startupPort<2100||startupPort>2120||!configuration.name.length||/[\x00-\x1f\x7f]/.test(configuration.name)||!/^[A-Za-z0-9_-]{1,80}$/.test(configuration.map))throw new Error("Invalid Warzone text setting");
    for(const [key,low,high] of [["maxPlayers",2,8],["techLevel",1,3],["bases",0,2],["powerLevel",0,2],["alliances",0,2],["scavengers",0,2],["openSpectatorSlots",0,10]])if(!Number.isInteger(configuration[key])||configuration[key]<low||configuration[key]>high)throw new Error("Invalid Warzone number");
    return {profile:"warzone-2100-bwrap-v1",resourceLimits,identityProfile,identityRuntime:{gameSlug,port:startupPort,config:JSON.stringify(configuration)},binary:"/usr/bin/prlimit",args:[],cwd:"/",env:{PATH:"/usr/bin:/usr/games",LANG:"C.UTF-8"}};
  }
  if (gameSlug === "freeciv") {
    const expectedRoot=path.join(home,"freeciv-servers",`pb-${id}`);
    if (binary!=="/opt/playbound-host/games/freeciv/runtime/bin/freeciv-server" || identityProfile!=="freeciv-unix-v1" || identityMigrationMetadata(id,home)?.identityProfile!==identityProfile || args.length!==6 || args[0]!=="-p" || args[1]!==String(startupPort) || args[2]!=="--read" || args[3]!==path.join(expectedRoot,`pb-${id}.serv`) || args[4]!=="--saves" || args[5]!==path.join(expectedRoot,"saves")) throw new Error("Unexpected Freeciv identity contract");
    const maxPlayers=Number(settings?.maxPlayers??16);
    if(!Number.isInteger(startupPort)||startupPort<5556||startupPort>5576||!Number.isInteger(maxPlayers)||maxPlayers<2||maxPlayers>64)throw new Error("Invalid Freeciv typed setting");
    return {profile:"freeciv-bwrap-v1",resourceLimits,identityProfile,identityRuntime:{gameSlug,port:startupPort,config:JSON.stringify({maxPlayers})},binary:"/usr/bin/prlimit",args:[],cwd:"/",env:{PATH:"/usr/bin:/usr/games",LANG:"C.UTF-8"}};
  }
  if (gameSlug === "freedoom") {
    if(binary!=="/opt/playbound-host/games/freedoom/zandronum-server"||identityProfile!=="freedoom-unix-v1"||identityMigrationMetadata(id,home)?.identityProfile!==identityProfile||args[0]!=="-host")throw new Error("Unexpected isolated Zandronum contract");
    const values={};for(let i=1;i<args.length;i+=2){const key=args[i],value=args[i+1];if(typeof value!=="string"||Object.hasOwn(values,key))throw new Error("Unexpected Zandronum argument");values[key]=value;}
    const modes=["deathmatch","teamplay","ctf","duel","lastmanstanding"],allowed=new Set(["-port","-iwad","-skill","+map","+sv_hostname","+sv_maxplayers","+sv_maxclients","+fraglimit","+timelimit",...modes.map(x=>"+"+x)]);
    const selected=modes.filter(x=>values["+"+x]!==undefined);
    if(Object.keys(values).some(x=>!allowed.has(x))||values['-port']!==String(startupPort)||values['-iwad']!=="/opt/playbound-host/games/freedoom/freedoom2.wad"||selected.length>1||selected.some(x=>values['+'+x]!=="1"))throw new Error("Unsupported isolated Doom edition or setting");
    const configuration={name:values['+sv_hostname'],maxPlayers:Math.min(Number(values['+sv_maxplayers']??12),Number(values['+sv_maxclients']??12)),map:values['+map'],mode:selected[0]??"coop",skill:Number(values['-skill']??3),fragLimit:Number(values['+fraglimit']??0),timeLimit:Number(values['+timelimit']??0)};
    if(!Number.isInteger(startupPort)||startupPort<10666||startupPort>10686||typeof configuration.name!=="string"||!configuration.name.length||configuration.name.length>100||/[\x00-\x1f\x7f"\\;]/.test(configuration.name)||!/^MAP(?:0[1-9]|[12][0-9]|3[0-2])$/.test(configuration.map||"")||!Number.isInteger(configuration.maxPlayers)||configuration.maxPlayers<2||configuration.maxPlayers>64||!Number.isInteger(configuration.skill)||configuration.skill<1||configuration.skill>5||[configuration.fragLimit,configuration.timeLimit].some(x=>!Number.isInteger(x)||x<0||x>100000))throw new Error("Invalid Zandronum typed setting");
    return {profile:"freedoom-bwrap-v1",resourceLimits,identityProfile,identityRuntime:{gameSlug,port:startupPort,config:JSON.stringify(configuration)},binary:"/usr/bin/prlimit",args:[],cwd:"/",env:{PATH:"/usr/bin:/usr/games",LANG:"C.UTF-8"}};
  }
  if (gameSlug === "medal-of-honor-allied-assault") {
    if (binary!=="/opt/playbound-host/games/openmohaa/omohaaded" || identityProfile!=="medal-of-honor-allied-assault-unix-v1" || identityMigrationMetadata(id,home)?.identityProfile!==identityProfile || args.at(-2)!=="+map") throw new Error("Unexpected OpenMoHAA identity contract");
    const values={};for(let i=0;i<args.length-2;i+=3){const [marker,key,value]=args.slice(i,i+3);if(marker!=="+set"||typeof value!=="string"||Object.hasOwn(values,key))throw new Error("Unexpected OpenMoHAA setting");values[key]=value;}
    const allowed=new Set(["fs_homepath","net_port","sv_hostname","sv_gamespy","sv_maxclients","g_gametype","sv_maxbots","sv_minPlayers"]);
    const maxPlayers=Number(values.sv_maxclients),bots=Number(values.sv_minPlayers??0),map=args.at(-1);
    if(Object.keys(values).some(x=>!allowed.has(x))||values.net_port!==String(startupPort)||values.fs_homepath!=="/var/lib/playbound-host/openmohaa/pb-"+id.slice(-8)||values.sv_gamespy!=="0"||values.g_gametype!=="1"||!Number.isInteger(startupPort)||startupPort<12203||startupPort>12222||!Number.isInteger(maxPlayers)||maxPlayers<2||maxPlayers>64||!Number.isInteger(bots)||bots<0||bots>maxPlayers||(values.sv_maxbots!==undefined&&Number(values.sv_maxbots)!==bots)||typeof values.sv_hostname!=="string"||!values.sv_hostname.length||values.sv_hostname.length>48||/[\x00-\x1f\x7f"\\;]/.test(values.sv_hostname)||!/^dm\/mohdm[1-7]$/.test(map))throw new Error("Invalid OpenMoHAA typed settings");
    return {profile:"medal-of-honor-allied-assault-bwrap-v1",resourceLimits,identityProfile,identityRuntime:{gameSlug,port:startupPort,config:JSON.stringify({name:values.sv_hostname,maxPlayers,bots,map})},binary:"/usr/bin/prlimit",args:[],cwd:"/",env:{PATH:"/usr/bin:/usr/games",LANG:"C.UTF-8"}};
  }
  if (gameSlug === "wolfenstein-enemy-territory") {
    if (binary!=="/opt/playbound-host/games/wolfenstein-enemy-territory/etlded.x86_64" || identityProfile!=="wolfenstein-enemy-territory-unix-v1" || identityMigrationMetadata(id,home)?.identityProfile!==identityProfile) throw new Error("Unexpected ET Legacy identity contract");
    const values={};
    if(args.at(-4)!=="+exec"||args.at(-3)!=="et-playbound.cfg"||args.at(-2)!=="+map"||args.at(-1)!=="oasis")throw new Error("Unexpected ET startup map");
    for(let i=0;i<args.length-4;i+=3){const [marker,key,value]=args.slice(i,i+3);if(marker!=="+set"||typeof value!=="string"||Object.hasOwn(values,key))throw new Error("Unexpected ET setting");values[key]=value;}
    const allowed=new Set(["fs_basepath","fs_homepath","dedicated","net_port","sv_hostname","sv_master1","sv_pure","omnibot_enable","rconpassword","sv_maxclients"]);
    if(Object.keys(values).some(x=>!allowed.has(x))||values.net_port!==String(startupPort)||values.dedicated!=="2"||values.sv_pure!=="0"||values.omnibot_enable!=="0"||values.fs_homepath!=="/var/lib/playbound-host/et/"+id.slice(-16)||values.fs_basepath!=="/opt/playbound-host/games/wolfenstein-enemy-territory"||!/^[A-Za-z0-9_-]{24,64}$/.test(values.rconpassword||""))throw new Error("ET isolated startup requires bounded native settings and no Omni-bot");
    const maxPlayers=Number(values.sv_maxclients);
    if(!Number.isInteger(startupPort)||startupPort<27950||startupPort>27959||!Number.isInteger(maxPlayers)||maxPlayers<2||maxPlayers>64||typeof values.sv_hostname!=="string"||!values.sv_hostname.length||values.sv_hostname.length>100||/[\x00-\x1f\x7f"\\;]/.test(values.sv_hostname))throw new Error("Invalid ET typed settings");
    return {profile:"wolfenstein-enemy-territory-bwrap-v1",resourceLimits,identityProfile,identityRuntime:{gameSlug,port:startupPort,config:JSON.stringify({name:values.sv_hostname,maxPlayers,rconPassword:values.rconpassword})},binary:"/usr/bin/prlimit",args:[],cwd:"/",env:{PATH:"/usr/bin:/usr/games",LANG:"C.UTF-8"}};
  }
  if (gameSlug === "xonotic") {
    if (binary!=="/opt/playbound-host/games/xonotic/xonotic-linux64-dedicated" || identityProfile!=="xonotic-unix-v1" || identityMigrationMetadata(id,home)?.identityProfile!==identityProfile) throw new Error("Unexpected Xonotic identity contract");
    const values={};
    for(let i=0;i<args.length;){
      const marker=args[i++],key=marker==="+set"?args[i++]:marker?.slice(1),value=args[i++];
      if (!marker?.startsWith("+") || !key || typeof value!=="string" || Object.hasOwn(values,key)) throw new Error("Unexpected Xonotic startup settings");
      values[key]=value;
    }
    const allowed=new Set(["port","hostname","sv_public","rcon_secure","rcon_password","maxplayers","gametype","fraglimit_override","timelimit_override","bot_join_empty","minplayers","map"]);
    if(Object.keys(values).some(key=>!allowed.has(key)) || values.port!==String(startupPort) || values.rcon_secure!=="0" || !/^[A-Za-z0-9_-]{24,64}$/.test(values.rcon_password||"") || !["0","1"].includes(values.sv_public)) throw new Error("Unexpected Xonotic startup contract");
    const configuration={name:values.hostname,maxPlayers:Number(values.maxplayers),map:values.map,gameType:values.gametype,rconPassword:values.rcon_password,bots:Number(values.minplayers??0),fragLimit:Number(values.fraglimit_override??-1),timeLimit:Number(values.timelimit_override??-1)};
    if(!Number.isInteger(startupPort)||startupPort<26000||startupPort>26020||typeof configuration.name!=="string"||!configuration.name.length||configuration.name.length>100||/[\x00-\x1f\x7f"\\;]/.test(configuration.name)||!/^[A-Za-z0-9_-]{1,64}$/.test(configuration.map||"")||!["dm","tdm","ctf","ca","duel","lms","kh","dom","as","race","cts","nb","ft","ka","inv"].includes(configuration.gameType)||!Number.isInteger(configuration.maxPlayers)||configuration.maxPlayers<2||configuration.maxPlayers>64||!Number.isInteger(configuration.bots)||configuration.bots<0||configuration.bots>configuration.maxPlayers||[configuration.fragLimit,configuration.timeLimit].some(x=>!Number.isInteger(x)||x < -1 || x>100000)) throw new Error("Invalid Xonotic typed settings");
    return {profile:"xonotic-bwrap-v1",resourceLimits,identityProfile,identityRuntime:{gameSlug,port:startupPort,config:JSON.stringify(configuration)},binary:"/usr/bin/prlimit",args:[],cwd:"/",env:{PATH:"/usr/bin:/usr/games",LANG:"C.UTF-8"}};
  }
  if (gameSlug === "assaultcube") {
    const port=startupPort,name=serverName,maxPlayers=settings?.maxPlayers ?? 12;
    if (binary!=="/opt/playbound-host/games/assaultcube/bin_unix/linux_64_server" || identityProfile!=="assaultcube-unix-v1" || identityMigrationMetadata(id,home)?.identityProfile!==identityProfile || !Number.isInteger(port) || port<28763 || port>28781 || port%2!==1 || typeof name!=="string" || !name.length || name.length>40 || /[\x00-\x1f\x7f]/.test(name) || !Number.isInteger(maxPlayers) || maxPlayers<2 || maxPlayers>64) throw new Error("Invalid AssaultCube identity contract");
    return {profile:"assaultcube-bwrap-v1",resourceLimits,identityProfile,identityRuntime:{gameSlug,port,config:JSON.stringify({name,maxPlayers})},binary:"/usr/bin/prlimit",args:[],cwd:"/",env:{PATH:"/usr/bin:/usr/games",LANG:"C.UTF-8"}};
  }
  if (gameSlug === "hurry-curry") {
    if (binary!=="/opt/playbound-host/games/hurry-curry/hurrycurry-server" || identityProfile!=="hurry-curry-unix-v1" || identityMigrationMetadata(id,home)?.identityProfile!==identityProfile) throw new Error("Unexpected Hurry Curry identity contract");
    const port=startupPort,name=serverName,maxPlayers=settings?.maxPlayers ?? 12;
    if (!Number.isInteger(port) || port<27032 || port>27052 || typeof name!=="string" || !name.length || name.length>40 || /[\x00-\x1f\x7f]/.test(name) || !Number.isInteger(maxPlayers) || maxPlayers<2 || maxPlayers>64) throw new Error("Invalid Hurry Curry typed settings");
    return {profile:"hurry-curry-bwrap-v1",resourceLimits,identityProfile,identityRuntime:{gameSlug,port,config:JSON.stringify({name,maxPlayers})},binary:"/usr/bin/prlimit",args:[],cwd:"/",env:{PATH:"/usr/bin:/usr/games",LANG:"C.UTF-8"}};
  }
  if (gameSlug === "mindustry") {
    if (binary!=="/usr/bin/java" || args.length!==2 || args[0]!=="-jar" || args[1]!=="/opt/playbound-host/games/mindustry/server-release.jar" || identityProfile!=="mindustry-unix-v1" || identityMigrationMetadata(id,home)?.identityProfile!==identityProfile) throw new Error("Unexpected Mindustry identity contract");
    const port=startupPort,name=serverName,maxPlayers=settings?.maxPlayers ?? 12;
    if (!Number.isInteger(port) || port<6567 || port>6587 || typeof name!=="string" || !/^[A-Za-z0-9 ._'-]{1,80}$/.test(name) || !Number.isInteger(maxPlayers) || maxPlayers<2 || maxPlayers>64) throw new Error("Invalid Mindustry typed settings");
    return {profile:"mindustry-bwrap-v1",resourceLimits,identityProfile,identityRuntime:{gameSlug,port,config:JSON.stringify({name,maxPlayers})},binary:"/usr/bin/prlimit",args:[],cwd:"/",env:{PATH:"/usr/bin:/usr/games",LANG:"C.UTF-8"}};
  }
  if (gameSlug === "flightgear") {
    const port=Number(args[1]);
    if (binary!=="/opt/playbound-host/games/flightgear/fgms" || args.length!==7 || args[0]!=="-p" || !withinPort(args[1],5000,5010) || port%2 || args.slice(2).join("\0")!==["-a",String(port+1),"-b","0","-d"].join("\0") || identityProfile!=="flightgear-unix-v1" || identityMigrationMetadata(id,home)?.identityProfile!==identityProfile) throw new Error("Unexpected FlightGear identity contract");
    return {profile:"flightgear-bwrap-v1",resourceLimits,identityProfile,identityRuntime:{gameSlug,port,config:"{}"},binary:"/usr/bin/prlimit",args:[],cwd:"/",env:{PATH:"/usr/bin:/usr/games",LANG:"C.UTF-8"}};
  }
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
