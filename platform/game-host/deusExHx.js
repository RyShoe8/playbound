/** Per-room HX files for the Windows console server running under Wine. */
import fs from "node:fs";
import path from "node:path";

const GAMES_ROOT = process.env.GAME_HOST_GAMES_DIR || "/opt/playbound-host/games";
const HOST_HOME = process.env.HOME || "/var/lib/playbound-host";
export const HX_BASE = path.join(GAMES_ROOT, "deus-ex");

function roomId(ctx) {
  const id = String(ctx.communityServerId || ctx.partyId || "");
  if (!/^[a-zA-Z0-9_-]{1,48}$/.test(id)) throw new Error("HX room requires a valid party or community server ID");
  return id;
}

export function hxRoomDir(ctx) {
  return path.join(HOST_HOME, "deus-ex", `room-${roomId(ctx)}`);
}

export function hxReady(base = HX_BASE) {
  for (const relative of [
    "run-server",
    "System/HCC.exe",
    "System/HX.u",
    "System/DeusEx.u",
    "System/HXDefault.ini",
    "Maps/01_NYC_UNATCOIsland.dx",
  ]) {
    if (!fs.existsSync(path.join(base, relative))) return false;
  }
  return true;
}

function setIniValue(source, section, key, value) {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  let inSection = false;
  let foundSection = false;
  let foundKey = false;
  const sectionName = `[${section}]`.toLowerCase();
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line.startsWith("[") && line.endsWith("]")) {
      if (inSection && !foundKey) { lines.splice(i, 0, `${key}=${value}`); foundKey = true; }
      inSection = line.toLowerCase() === sectionName;
      if (inSection) foundSection = true;
    } else if (inSection && line.toLowerCase().startsWith(`${key.toLowerCase()}=`)) {
      lines[i] = `${key}=${value}`;
      foundKey = true;
    }
  }
  if (!foundSection) lines.push(`[${section}]`, `${key}=${value}`);
  else if (!foundKey) lines.push(`${key}=${value}`);
  return lines.join("\r\n");
}

export function buildHxIni(template, port, maxPlayers = 8) {
  let ini = setIniValue(template, "URL", "Port", port);
  ini = setIniValue(ini, "Engine.GameInfo", "MaxPlayers", Math.min(8, Math.max(2, Number(maxPlayers) || 8)));
  // Every player installs their own retail game and HX edition; never serve
  // proprietary packages from the VPS to a client missing local files.
  ini = setIniValue(ini, "IpDrv.TcpNetDriver", "AllowDownloads", "False");
  return setIniValue(ini, "HX.HXUdpServerUplink", "DoUplink", "False");
}

export function prepareHxRoom(port, ctx, base = HX_BASE, home = HOST_HOME) {
  if (!hxReady(base)) throw new Error("HX needs a provisioned Deus Ex GOTY install, HX files, and Wine wrapper on the VPS");
  const id = roomId(ctx);
  const room = path.join(home, "deus-ex", `room-${id}`);
  fs.mkdirSync(room, { recursive: true });
  if (fs.realpathSync(room) !== path.resolve(room)) throw new Error("HX room directory requires review");
  // System and Save are mutable. Only installed game assets may be shared.
  const system = path.join(room, "System");
  if (!fs.existsSync(system)) fs.cpSync(path.join(base, "System"), system, { recursive: true });
  if (fs.lstatSync(system).isSymbolicLink() || fs.realpathSync(system) !== path.resolve(system)) throw new Error("HX private System directory requires review");
  const saves = path.join(room, "Save"), sharedSaves = path.join(base, "Save");
  let legacySaveLink = false;
  try {
    const info = fs.lstatSync(saves);
    if (info.isSymbolicLink()) {
      if (!fs.existsSync(saves) || !fs.existsSync(sharedSaves) || fs.realpathSync(saves) !== fs.realpathSync(sharedSaves)) throw new Error("HX custom save link requires review");
      legacySaveLink = true;
    } else if (!info.isDirectory()) throw new Error("HX Save must be a private directory");
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (legacySaveLink) {
    throw new Error("HX legacy shared saves need a stopped-server private copy before restarting; original saves were retained");
  } else if (!fs.existsSync(saves)) fs.mkdirSync(saves,{mode:0o700});
  for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
    if (entry.name === "System" || entry.name === "Save" || entry.name === "run-server") continue;
    const source = path.join(base, entry.name);
    const target = path.join(room, entry.name);
    if (!fs.existsSync(target)) fs.symlinkSync(source, target, entry.isDirectory() ? "dir" : "file");
  }
  const config = path.join(system, "HX.ini");
  let source = path.join(base, "System", "HXDefault.ini");
  try {
    const info=fs.lstatSync(config);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 1024 * 1024) throw new Error("HX private configuration requires review");
    source = config;
  } catch(error) { if(error.code!=="ENOENT") throw error; }
  // Keep private rules across restarts. Only managed port/slots and the two
  // download/uplink safety settings are reapplied to an existing configuration.
  const ini = buildHxIni(fs.readFileSync(source, "utf8"), port, ctx.maxPlayers);
  fs.writeFileSync(config, ini, "utf8");
  return room;
}
