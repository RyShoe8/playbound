"use strict";
const path = require("node:path");

function localSettingsEngine(hostLaunch) {
  const binary = path.basename(String(hostLaunch?.binaryHint || "").replace(/\\/g, "/")).toLowerCase();
  if (/^(openra|openhv)\.server(?:\.exe)?$/.test(binary)) return "openra";
  if (/^(teeworlds_srv|ddnet-server)(?:\.exe)?$/.test(binary)) return "teeworlds";
  if (/^bzfs(?:\.exe)?$/.test(binary)) return "bzflag";
  if (/tes3mp/.test(binary) || /tes3mp/.test(String(hostLaunch?.configFile || ""))) return "tes3mp";
  if (/^(openarena-server|oa_ded|oa_ded\.x86_64|etlded|omohaaded)(?:\.exe)?$/.test(binary)) return "quake3";
  if (/^xonotic.*dedicated(?:\.exe)?$/.test(binary)) return "darkplaces";
  return null;
}

function safeValue(value) {
  const text = typeof value === "boolean" ? value ? "1" : "0" : String(value);
  if ((typeof value === "number" && !Number.isFinite(value)) || !/^[A-Za-z0-9 ._:/@#()[\]+-]*$/.test(text) || text.length > 256) {
    throw new Error("Invalid local server setting value");
  }
  return text;
}

function mapName(value) {
  const text = safeValue(value);
  if (!/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(text)) throw new Error("Invalid local starting map");
  return text;
}

function safeName(value) {
  const name = String(value || "PlayBound Server");
  if (/[\x00-\x1f\x7f]/.test(name) || name.length > 160) throw new Error("Invalid local server name");
  return name;
}

/** No shell, config download, or cloud-provided console command is evaluated. */
function buildLocalSettingsArgs({ hostLaunch, args, settings = {}, serverName }) {
  const engine = localSettingsEngine(hostLaunch);
  if (!engine) return null; // Keep unassessed engines on their existing path.
  const entries = Object.entries(settings);
  if (engine === "tes3mp") {
    const allowed = new Set([...(hostLaunch.configKeys || []), ...(hostLaunch.scriptConfigKeys || [])]);
    if (entries.some(([key]) => !allowed.has(key))) throw new Error("This TES3MP setting has no declared config delivery");
    return args; // Config-file settings must not be appended as +set arguments.
  }
  if (engine === "openra") {
    const allowed = new Set(["Server.EnableSingleplayer", "Server.LockBots"]);
    const chosen = entries.map(([key, value]) => {
      if (!allowed.has(key) || typeof value !== "boolean") throw new Error("Unsupported local OpenRA setting");
      return `${key}=${value ? "True" : "False"}`;
    });
    return [...args, ...(serverName ? [`Server.Name=${safeName(serverName)}`] : []), ...chosen];
  }
  if (engine === "teeworlds") {
    const allowed = new Set(["sv_map", "sv_gametype", "sv_max_clients", "sv_scorelimit", "sv_timelimit", "sv_spectator_slots"]);
    const chosen = entries.map(([key, value]) => {
      if (!allowed.has(key)) throw new Error("Unsupported local Teeworlds setting");
      return `${key} ${key === "sv_map" ? mapName(value) : safeValue(value)}`;
    });
    // spawn() already preserves each array element as one argument. Literal
    // surrounding shell quotes turn the whole command into its name.
    const normalized = args.map((arg) => {
      const unquoted = arg.startsWith('"') && arg.endsWith('"') ? arg.slice(1, -1) : arg;
      if (unquoted.startsWith("sv_name ")) return `sv_name ${JSON.stringify(safeName(serverName || unquoted.slice(8)))}`;
      return unquoted;
    });
    return [...normalized, ...chosen];
  }
  if (engine === "bzflag") {
    let result = [...args];
    for (const [key, value] of entries) {
      const flag = key === "maxPlayers" ? "-mp" : key === "superFlags" ? "+s" : null;
      if (!flag || !Number.isInteger(value) || value < (key === "maxPlayers" ? 2 : 0) || value > (key === "maxPlayers" ? 200 : 100)) {
        throw new Error("Unsupported local BZFlag setting");
      }
      for (let index = result.length - 2; index >= 0; index--) if (result[index] === flag) result.splice(index, 2);
      result.push(flag, String(value));
    }
    return result;
  }
  const result = [...args];
  let map;
  for (const [key, value] of entries) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error("Invalid local cvar name");
    if (key === "map") { map = mapName(value); continue; }
    if (engine === "darkplaces" && key === "gametype") {
      if (!["dm", "tdm", "ctf", "ca", "ft", "lms", "duel"].includes(value)) throw new Error("Unsupported Xonotic game mode");
      result.push("+gametype", value);
    } else if (engine === "darkplaces") result.push(`+${key}`, safeValue(value));
    else result.push("+set", key, safeValue(value));
  }
  // Load the map after latched mode/rule settings have been applied.
  if (map) result.push("+map", map);
  return result;
}

module.exports = { localSettingsEngine, buildLocalSettingsArgs };
