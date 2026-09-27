/** Per-room HX files for the Windows console server running under Wine. */
import fs from "node:fs";
import path from "node:path";

const GAMES_ROOT = process.env.GAME_HOST_GAMES_DIR || "/opt/playbound-host/games";
const HOST_HOME = process.env.HOME || "/var/lib/playbound-host";
export const HX_BASE = path.join(GAMES_ROOT, "deus-ex");

export function hxRoomDir(ctx) {
  const raw = String(ctx.communityServerId || ctx.partyId || "");
  const id = raw.replace(/[^a-zA-Z0-9_-]/g, "").slice(-48);
  if (!id) throw new Error("HX room requires a party or community server ID");
  return path.join(HOST_HOME, "deus-ex", `room-${id}`);
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
  const id = String(ctx.communityServerId || ctx.partyId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(-48);
  if (!id) throw new Error("HX room requires a party or community server ID");
  const room = path.join(home, "deus-ex", `room-${id}`);
  fs.mkdirSync(room, { recursive: true });
  // System contains mutable INIs and logs. Share the much larger game assets
  // as read-only symlinks so rooms cannot overwrite one another's settings.
  const system = path.join(room, "System");
  if (!fs.existsSync(system)) fs.cpSync(path.join(base, "System"), system, { recursive: true });
  for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
    if (entry.name === "System" || entry.name === "run-server") continue;
    const source = path.join(base, entry.name);
    const target = path.join(room, entry.name);
    if (!fs.existsSync(target)) fs.symlinkSync(source, target, entry.isDirectory() ? "dir" : "file");
  }
  const ini = buildHxIni(fs.readFileSync(path.join(base, "System", "HXDefault.ini"), "utf8"), port, ctx.maxPlayers);
  fs.writeFileSync(path.join(system, "HX.ini"), ini, "utf8");
  return room;
}
