/**
 * Launcher-side recipes for party leaders who host over PlayBound's overlay.
 *
 * Keep these separate from the VPS recipes: this launches the player's normal
 * client as a listen server, while platform/game-host/recipes.js launches a
 * dedicated server binary.
 */

const net = require("net");

const SELF_HOST_PORTS = Object.freeze({
  openra: 1234,
  openttd: 3979,
  luanti: 30000,
  mindustry: 6567,
  ysoccer: 54555,
  "goldeneye-source": 27045,
  hedgewars: 46631,
  "warzone-2100": 2100,
  freeciv: 5556,
  bzflag: 5154,
  supertuxkart: 2759,
  xonotic: 26000,
  openarena: 27960,
  unvanquished: 27990,
  keeperfx: 5500,
  "marathon-2": 4226,
  "aleph-one": 4247,
  triplea: 3303,
  "battle-for-wesnoth": 15000,
  freedoom: 10666,
  "0-ad": 20595,
});

function selfHostPort(slug) {
  return SELF_HOST_PORTS[String(slug || "")] || null;
}

function selfHostLaunchArgs(slug, host, port = selfHostPort(slug)) {
  if (!selfHostPort(slug)) return null;
  if (net.isIP(String(host || "")) !== 4) return null;
  const numericPort = Number(port);
  if (!Number.isInteger(numericPort) || numericPort < 1024 || numericPort > 65535) return null;

  // Most games expose hosting through their own multiplayer menu. An empty
  // recipe means "launch normally and guide the leader there"; it is still a
  // supported self-host path, not an unknown game.
  if (slug !== "goldeneye-source") return [];

  // -port is the listen-server port. -ip binds Source to the NetBird adapter so
  // party traffic cannot accidentally expose the room on another interface.
  // maxplayers must be applied before the map starts.
  return [
    "-console",
    "-ip",
    String(host),
    "-port",
    String(numericPort),
    "+maxplayers",
    "16",
    "+sv_lan",
    "0",
    "+map",
    "ge_facility",
  ];
}

function selfHostIsAutomatic(slug) {
  return slug === "goldeneye-source";
}

module.exports = { SELF_HOST_PORTS, selfHostIsAutomatic, selfHostLaunchArgs, selfHostPort };
