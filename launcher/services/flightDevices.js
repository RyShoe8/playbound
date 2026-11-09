"use strict";

/**
 * Flight devices — sticks, throttles and HOTAS — described once, so every game
 * adapter can bind them without knowing the hardware.
 *
 * Three layers keep "any device × any game" from becoming a table of both:
 *
 *   1. Identity. A device is its USB vendor:product pair, read from whichever
 *      source is at hand: the browser's Gamepad id or SDL's joystick GUID.
 *   2. Device profile. The device's physical layout, measured once — which axis
 *      index is the throttle, which is the twist, how its hat reports, which
 *      axes are broken — and its buttons assigned to *roles* (fire, altFire,
 *      target…). Adding a device is one entry here.
 *   3. Game adapter. Maps roles to the game's own actions (FSO's FIRE_PRIMARY,
 *      say) and writes the game's config. Adding a game is one adapter, and it
 *      works with every device that has a profile.
 *
 * A device with no measured profile gets the generic flight-stick layout, the
 * convention most HID sticks follow, so it works before anyone measures it.
 *
 * Nothing here touches the file system.
 */

/** Physical axis numbering shared by SDL and FreeSpace Open: X 0, Y 1, Z 2, RX 3, RY 4, RZ 5, U 6. */
const AXIS_NAMES = ["X_AXIS", "Y_AXIS", "Z_AXIS", "RX_AXIS", "RY_AXIS", "RZ_AXIS", "U_AXIS", "V_AXIS"];

/** Roles a flight game can bind. A device assigns a physical button to each it has. */
const FLIGHT_ROLES = [
  "fire", "altFire", "targetNearest", "targetReticle", "cyclePrimary", "cycleSecondary",
  "aux1", "aux2", "aux3", "aux4", "pause",
];

/** SDL hat directions in its own order. A profile says which one each physical push reports. */
const HAT_DIRECTIONS = ["up", "right", "down", "left"];

const PROFILES = [
  {
    id: "tflight-hotas-4",
    vidPid: "044f:b67c",
    label: "Thrustmaster T.Flight HOTAS 4",
    deviceType: "hotas",
    /*
     * Measured with the player's HOTAS 4 through FSO 26's SDL2. RX reports a
     * fixed maximum on this device — bind it and the ship rolls on its own —
     * so it is listed as unusable rather than left for a game to pick up.
     */
    axes: { stickX: 0, stickY: 1, throttle: 2, twist: 5, rocker: 6 },
    unusableAxes: [3],
    buttons: {
      "R1 / Trigger": 0, L1: 1, R3: 2, L3: 3, Square: 4, Cross: 5,
      Circle: 6, Triangle: 7, R2: 8, L2: 9, Share: 10, Options: 11,
    },
    roles: {
      fire: "R1 / Trigger", altFire: "L1", aux1: "R3", targetNearest: "L3",
      aux2: "Square", aux3: "Cross", aux4: "Circle", targetReticle: "Share",
      cycleSecondary: "R2", cyclePrimary: "L2", pause: "Options",
      // Triangle is free for a game's own extra (FotG: equalize shields).
      extra1: "Triangle",
    },
    // Pushing the hat right reports SDL "left", and left reports "right".
    hat: { up: "up", right: "left", down: "down", left: "right" },
  },
];

/*
 * The convention most HID flight sticks follow, used when a device has no
 * measured profile: X/Y stick, Z throttle, RZ twist, trigger on button 0.
 */
const GENERIC_FLIGHTSTICK = {
  id: "generic-flightstick",
  vidPid: null,
  label: "Flight stick",
  deviceType: "flightstick",
  generic: true,
  axes: { stickX: 0, stickY: 1, throttle: 2, twist: 5 },
  unusableAxes: [],
  buttons: { "Button 1": 0, "Button 2": 1, "Button 3": 2, "Button 4": 3, "Button 5": 4, "Button 6": 5 },
  roles: { fire: "Button 1", altFire: "Button 2", targetNearest: "Button 3", cyclePrimary: "Button 4", cycleSecondary: "Button 5", targetReticle: "Button 6" },
  hat: { up: "up", right: "right", down: "down", left: "left" },
};

/** "044f:b67c" from Chrome's Gamepad id ("… (Vendor: 044f Product: b67c)") or Firefox's ("044f-b67c-…"). */
function vidPidFromGamepadId(id) {
  const text = String(id || "");
  const chrome = text.match(/vendor:\s*([0-9a-f]{4})\s*product:\s*([0-9a-f]{4})/i);
  if (chrome) return `${chrome[1]}:${chrome[2]}`.toLowerCase();
  const firefox = text.match(/^([0-9a-f]{4})-([0-9a-f]{4})-/i);
  if (firefox) return `${firefox[1]}:${firefox[2]}`.toLowerCase();
  return null;
}

/** "044f:b67c" from an SDL joystick GUID: bus(4) crc(4) vendor(4, LE) 0000 product(4, LE) 0000 … */
function vidPidFromSdlGuid(guid) {
  const hex = String(guid || "").trim();
  if (!/^[0-9a-f]{32}$/i.test(hex)) return null;
  const le = (at) => (hex.slice(at + 2, at + 4) + hex.slice(at, at + 2)).toLowerCase();
  const vid = le(8);
  const pid = le(16);
  if (vid === "0000" && pid === "0000") return null;
  return `${vid}:${pid}`;
}

/*
 * Profiles from outside this file, by priority: a player's own calibration
 * beats a profile shared from the site, which beats one shipped here. The site
 * list is how a newly measured device goes live without a launcher release.
 */
const SOURCE_PRIORITY = { calibration: 3, remote: 2, builtin: 1 };
const registered = new Map(); // vidPid -> { profile, source }

/**
 * A profile from an untrusted source (the site, a calibration file), cleaned
 * up, or null if it does not describe a usable device. Only known fields and
 * sane values survive; a game adapter can rely on whatever comes back.
 */
function normalizeProfile(raw) {
  if (!raw || typeof raw !== "object") return null;
  const vidPid = String(raw.vidPid || "").toLowerCase();
  if (!/^[0-9a-f]{4}:[0-9a-f]{4}$/.test(vidPid)) return null;
  const index = (v, max) => (Number.isInteger(v) && v >= 0 && v < max ? v : undefined);
  const axes = {};
  for (const key of ["stickX", "stickY", "throttle", "twist", "rocker"]) {
    const v = index(raw.axes?.[key], AXIS_NAMES.length);
    if (v !== undefined) axes[key] = v;
  }
  if (axes.stickX === undefined || axes.stickY === undefined) return null;
  const buttons = {};
  for (const [name, v] of Object.entries(raw.buttons || {}).slice(0, 64)) {
    const b = index(v, 128);
    if (b !== undefined && typeof name === "string" && name.length <= 40) buttons[name] = b;
  }
  const roles = {};
  for (const [role, name] of Object.entries(raw.roles || {})) {
    if ((FLIGHT_ROLES.includes(role) || /^extra\d$/.test(role)) && buttons[name] !== undefined) roles[role] = name;
  }
  const hat = {};
  for (const dir of HAT_DIRECTIONS) hat[dir] = HAT_DIRECTIONS.includes(raw.hat?.[dir]) ? raw.hat[dir] : dir;
  if (new Set(Object.values(hat)).size !== HAT_DIRECTIONS.length) return null;
  const used = new Set(Object.values(axes));
  return {
    id: String(raw.id || `device-${vidPid.replace(":", "-")}`).slice(0, 60),
    vidPid,
    label: String(raw.label || "Flight device").slice(0, 60),
    deviceType: ["hotas", "flightstick", "throttle"].includes(raw.deviceType) ? raw.deviceType : "flightstick",
    axes,
    unusableAxes: (Array.isArray(raw.unusableAxes) ? raw.unusableAxes : [])
      .filter((v) => index(v, AXIS_NAMES.length) !== undefined && !used.has(v)),
    buttons,
    roles,
    hat,
  };
}

/** Add profiles from a source. Invalid entries are dropped; returns how many were kept. */
function registerProfiles(list, source) {
  if (!SOURCE_PRIORITY[source]) throw new Error(`Unknown profile source ${source}`);
  let kept = 0;
  for (const raw of Array.isArray(list) ? list : []) {
    const profile = normalizeProfile(raw);
    if (!profile) continue;
    const current = registered.get(profile.vidPid);
    if (current && SOURCE_PRIORITY[current.source] > SOURCE_PRIORITY[source]) continue;
    registered.set(profile.vidPid, { profile, source });
    kept++;
  }
  return kept;
}

function clearRegisteredProfiles(source) {
  for (const [key, entry] of registered) if (!source || entry.source === source) registered.delete(key);
}

/** The measured profile for a device, or null. */
function profileForVidPid(vidPid) {
  if (!vidPid) return null;
  const key = String(vidPid).toLowerCase();
  return registered.get(key)?.profile || PROFILES.find((p) => p.vidPid === key) || null;
}

/** Where a device's profile came from: calibration, remote, builtin, or null. */
function profileSourceFor(vidPid) {
  const key = String(vidPid || "").toLowerCase();
  if (registered.has(key)) return registered.get(key).source;
  return PROFILES.some((p) => p.vidPid === key) ? "builtin" : null;
}

/** The profile to use: measured when known, the generic flight stick otherwise. */
function resolveFlightProfile(vidPid) {
  return profileForVidPid(vidPid) || GENERIC_FLIGHTSTICK;
}

/** Physical button index for a role, or null when the device has none. */
function buttonForRole(profile, role) {
  const name = profile?.roles?.[role];
  if (name === undefined) return null;
  const index = profile.buttons?.[name];
  return Number.isInteger(index) ? index : null;
}

/** SDL hat-direction index (0 up, 1 right, 2 down, 3 left) that a physical push reports. */
function hatIndexFor(profile, physical) {
  const reported = profile?.hat?.[physical] || physical;
  return HAT_DIRECTIONS.indexOf(reported);
}

module.exports = {
  AXIS_NAMES,
  FLIGHT_ROLES,
  HAT_DIRECTIONS,
  PROFILES,
  GENERIC_FLIGHTSTICK,
  vidPidFromGamepadId,
  vidPidFromSdlGuid,
  profileForVidPid,
  profileSourceFor,
  resolveFlightProfile,
  normalizeProfile,
  registerProfiles,
  clearRegisteredProfiles,
  buttonForRole,
  hatIndexFor,
};
