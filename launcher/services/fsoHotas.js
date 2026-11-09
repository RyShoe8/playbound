"use strict";

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { execFile } = require("child_process");
const FSO_ACTION_ORDER = require("./fsoActionOrder");

function findFsoExecutable(installDir) {
  const binRoot = path.join(installDir, "kn_portable", "Library", "bin");
  if (!fs.existsSync(binRoot)) return null;
  const visit = (dir, depth) => {
    if (depth > 5) return null;
    let names;
    try { names = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
    const binary = names.find((entry) => entry.isFile() && /^fs2_open_.*\.exe$/i.test(entry.name) && !/FASTDBG/i.test(entry.name));
    if (binary) return path.join(dir, binary.name);
    for (const entry of names) {
      if (!entry.isDirectory()) continue;
      const found = visit(path.join(dir, entry.name), depth + 1);
      if (found) return found;
    }
    return null;
  };
  return visit(binRoot, 0);
}

function parseFsoJoysticks(stdout) {
  const raw = String(stdout || "");
  const start = raw.indexOf("{");
  if (start < 0) return [];
  let flags;
  try { flags = JSON.parse(raw.slice(start)); } catch { return []; }
  const items = Array.isArray(flags.joysticks) ? flags.joysticks : [];
  return items.filter((device) =>
    Number.isInteger(device.id) && device.id >= 0 &&
    /^[0-9a-f]{32}$/i.test(String(device.guid || ""))
  ).map((device) => ({
    id: device.id,
    guid: String(device.guid).toUpperCase(),
    name: String(device.name || `Input device ${device.id}`).slice(0, 100),
  }));
}

function queryFsoJoysticks(exe) {
  return new Promise((resolve, reject) => {
    execFile(exe, ["-get_flags", "json_v1"], {
      cwd: path.dirname(exe),
      env: { ...process.env, FSO_KEEP_STDOUT: "1" },
      timeout: 20_000,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    }, (error, stdout) => {
      // FSO 26.0.1 exits 1 after successfully printing JSON flags. Treat the
      // payload as the result; reject only when the process produced no JSON.
      if (String(stdout || "").includes('"joysticks"')) return resolve(parseFsoJoysticks(stdout));
      if (error) return reject(error);
      resolve([]);
    });
  });
}

function withFsoJoysticks(original, devices) {
  const newline = original.includes("\r\n") ? "\r\n" : "\n";
  const lines = String(original || "").split(/\r?\n/);
  let start = lines.findIndex((line) => /^\[Default\]\s*$/i.test(line));
  if (start < 0) {
    lines.push("[Default]");
    start = lines.length - 1;
  }
  let end = lines.findIndex((line, index) => index > start && /^\[.+\]\s*$/.test(line));
  if (end < 0) end = lines.length;
  const section = lines.slice(start + 1, end).filter((line) => !/^Joy[0-3](?:ID|GUID)\s*=/i.test(line));
  const assignments = devices.slice(0, 4).flatMap((device, index) => [
    `Joy${index}ID=${device.id}`,
    `Joy${index}GUID=${device.guid}`,
  ]);
  lines.splice(start + 1, end - start - 1, ...section, ...assignments);
  return lines.join(newline);
}

function fsoSettingsPath(installDir, appData) {
  const portable = path.join(installDir, "kn_portable", "HardLightProductions", "FreeSpaceOpen", "fs2_open.ini");
  if (fs.existsSync(portable)) return portable;
  return path.join(appData, "HardLightProductions", "FreeSpaceOpen", "fs2_open.ini");
}

async function saveFsoJoysticks(settingsPath, devices) {
  const original = await fsp.readFile(settingsPath, "utf8").catch((error) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  const next = withFsoJoysticks(original, devices);
  await fsp.mkdir(path.dirname(settingsPath), { recursive: true });
  const temp = `${settingsPath}.playbound-${process.pid}.tmp`;
  await fsp.writeFile(temp, next, "utf8");
  try { await fsp.rename(temp, settingsPath); }
  catch (error) { await fsp.rm(temp, { force: true }); throw error; }
}

const HOTAS4_PRESET = "PlayBound TFlight HOTAS 4";
const HOTAS4_MARKER = "; PlayBound HOTAS 4 throttle preset";
// Physical labels captured with the player's HOTAS 4 and FSO's own SDL2.
const HOTAS4_BUTTONS = [
  ["R1 / Trigger", 0, "FIRE_PRIMARY", "Primary fire", "Primary"],
  ["L1", 1, "FIRE_SECONDARY", "Secondary fire"],
  ["R3", 2, "CUSTOM_CONTROL_1", "Targeting computer"],
  ["L3", 3, "TARGET_NEXT_CLOSEST_HOSTILE", "Nearest hostile"],
  ["Square", 4, "CYCLE_PRIMARY_WEAPON_SEQUENCE", "Primary firing rate"],
  ["Cross", 5, "CUSTOM_CONTROL_5", "Stationary targeting"],
  ["Circle", 6, "CUSTOM_CONTROL_3", "S-foils"],
  ["Triangle", 7, "SHIELD_EQUALIZE", "Equalize shields"],
  ["R2", 8, "CYCLE_SECONDARY", "Cycle secondary weapon"],
  ["L2", 9, "CYCLE_NEXT_PRIMARY", "Cycle primary weapon"],
  ["Share", 10, "TARGET_SHIP_IN_RETICLE", "Target under reticle"],
  ["Options", 11, "TOGGLE_GLIDING", "Active pause"],
];

/*
 * The hat, as FSO reads it on the HOTAS 4: up 128, down 130, and left/right
 * the other way round from FSO's defaults (131 left, 129 right), which looked
 * left when the player pushed right. Hats live in the Secondary column.
 */
const HOTAS4_HATS = [
  ["Hat up", 128, "PADLOCK_UP", "Look up"],
  ["Hat down", 130, "PADLOCK_DOWN", "Look down"],
  ["Hat left", 129, "PADLOCK_LEFT", "Look left"],
  ["Hat right", 131, "PADLOCK_RIGHT", "Look right"],
];

/*
 * Pilot-file axis slots and FSO's axis numbering. A pilot stores axes as five
 * slots — heading, pitch, bank, absolute throttle, relative throttle — each
 * naming an axis by number: X 0, Y 1, Z 2, RX 3, RY 4, RZ 5.
 */
const HOTAS4_PILOT_AXES = [0, 1, 5, 2, -1];

/** SDL joystick GUIDs embed the USB vendor and product: 044f:b67c is the T.Flight HOTAS 4. */
function guidVendorProduct(guid) {
  // SDL GUID: bus(4) crc(4) vendor(4, little-endian) 0000 product(4, LE) 0000 …
  const hex = String(guid || "").trim();
  if (!/^[0-9a-f]{32}$/i.test(hex)) return null;
  const le = (at) => (hex.slice(at + 2, at + 4) + hex.slice(at, at + 2)).toLowerCase();
  return `${le(8)}:${le(16)}`;
}

function isHotas4Guid(guid) {
  return guidVendorProduct(guid) === "044f:b67c";
}

function withHotas4Preset(table, slot) {
  if (!Number.isInteger(slot) || slot < 0 || slot > 3) throw new Error("Invalid joystick slot");
  const start = table.indexOf(HOTAS4_MARKER);
  if (start >= 0) {
    const end = table.indexOf("#End", start);
    if (end < 0) throw new Error("Incomplete PlayBound control preset");
    table = table.slice(0, start) + table.slice(end + 4);
  }
  // Override clones the game's defaults; Preset starts with ALL controls empty.
  // Measured with the game's SDL2 on HOTAS 4 (044f:b67c). RX is a fixed
  // maximum on this device, NOT the twist. Inheriting FSO's RX bank default
  // would therefore command a continuous roll even with the stick centered.
  const axes = [
    ["JOY_HEADING_AXIS", "X_AXIS"],
    ["JOY_PITCH_AXIS", "Y_AXIS"],
    ["JOY_BANK_AXIS", "RZ_AXIS"],
    ["JOY_ABS_THROTTLE_AXIS", "Z_AXIS"],
  ].map(([action, axis]) => `$Bind: ${action}\n$Primary:\n$Controller: CID_JOY${slot}\n$Flags: CCF_AXIS\n$Input: ${axis}\n$Secondary:\n` +
    (action === "JOY_BANK_AXIS" ? `$Controller: CID_JOY${slot}\n$Flags: CCF_AXIS\n$Input: U_AXIS` : "$Controller: CID_NONE")
  ).join("\n");
  const buttons = HOTAS4_BUTTONS.map(([, button, action, , column = "Secondary"]) =>
    `$Bind: ${action}\n$${column}:\n$Controller: CID_JOY${slot}\n$Flags: NONE\n$Input: ${button}`
  ).join("\n");
  const hats = HOTAS4_HATS.map(([, button, action]) =>
    `$Bind: ${action}\n$Secondary:\n$Controller: CID_JOY${slot}\n$Flags: NONE\n$Input: ${button}`
  ).join("\n");
  // The game's old button 2 assignment would otherwise fire alongside R3.
  const clearConflict = "$Bind: TARGET_CLOSEST_SHIP_ATTACKING_SELF\n$Secondary:\n$Controller: CID_NONE";
  return table.trimEnd() + `\n\n${HOTAS4_MARKER}\n#ControlConfigOverride\n$Name: ${HOTAS4_PRESET}\n${axes}\n${buttons}\n${hats}\n${clearConflict}\n#End\n`;
}

/**
 * Put the HOTAS 4 bindings into a pilot's own control arrays.
 *
 * FSO keeps a pilot's live bindings in the pilot file — one joystick button
 * per action, in IoActionId order, plus five axis slots. The "preset" field
 * beside them is only a label, so renaming it (what this used to do) changed
 * nothing in game. Keyboard keys are left exactly as they were; any other
 * action on one of these buttons is cleared so nothing fires twice.
 */
function applyHotas4ToPilot(pilot) {
  const controls = pilot?.sections?.controls;
  if (!controls || !Array.isArray(controls.controls) || !Array.isArray(controls.axes)) return false;
  const wanted = new Map([...HOTAS4_BUTTONS, ...HOTAS4_HATS].map(([, button, action]) => [action, button]));
  const taken = new Set(wanted.values());
  controls.controls.forEach((binding, index) => {
    const button = wanted.get(FSO_ACTION_ORDER[index]);
    if (button !== undefined) binding.joystick = button;
    else if (taken.has(binding.joystick)) binding.joystick = -1;
  });
  HOTAS4_PILOT_AXES.forEach((axis, slot) => {
    if (controls.axes[slot]) controls.axes[slot].axis_map = axis;
  });
  controls.preset = HOTAS4_PRESET;
  return true;
}

async function writeBackedUp(file, original, next) {
  if (original === next) return;
  try { await fsp.writeFile(`${file}.playbound-hotas4.bak`, original, { flag: "wx" }); }
  catch (error) { if (error.code !== "EEXIST") throw error; }
  const temp = `${file}.playbound-${process.pid}.tmp`;
  await fsp.writeFile(temp, next, "utf8");
  try { await fsp.rename(temp, file); }
  catch (error) { await fsp.rm(temp, { force: true }); throw error; }
}

async function configureFotgHotas4(installDir, settingsPath, devices, { force = true } = {}) {
  const slot = devices.findIndex((d) => /^T[.]?Flight Hotas 4$/i.test(d.name));
  if (slot < 0) return { throttleConfigured: false };
  // The inherited hat bindings address Joy0. Do not silently apply a partial
  // preset to a different slot while claiming its view controls are configured.
  if (slot !== 0) throw new Error("Select T.Flight HOTAS 4 as the first flight device to apply its preset");
  const library = path.join(installDir, "kn_portable", "Library", "FotG_R");
  const releases = await fsp.readdir(library, { withFileTypes: true });
  let written = 0;
  for (const release of releases) {
    if (!release.isDirectory()) continue;
    // 1.0.x shipped the table inside an FG_Core folder; 1.1.x (which Knossos
    // updates installs to on its own) keeps it at the release root. Patch
    // whichever this release has.
    for (const sub of [["FG_Core"], []]) {
      const table = path.join(library, release.name, ...sub, "data", "tables", "Controlconfigdefaults.tbl");
      let original;
      try { original = await fsp.readFile(table, "utf8"); }
      catch (error) { if (error.code === "ENOENT") continue; throw error; }
      await writeBackedUp(table, original, withHotas4Preset(original, slot));
      written++;
    }
  }
  if (!written) throw new Error("Fate of the Galaxy control defaults were not found");
  const players = path.join(path.dirname(settingsPath), "data", "players");
  const files = await fsp.readdir(players).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  let activated = 0;
  for (const name of files.filter((name) => name.endsWith(".json"))) {
    const file = path.join(players, name);
    const original = await fsp.readFile(file, "utf8");
    const pilot = JSON.parse(original);
    const controls = pilot.sections?.controls;
    // Clicking "Configure flight devices" applies to every pilot. The automatic
    // run at launch leaves a pilot the player has moved to their own preset alone.
    if (!controls || (!force && !["default", HOTAS4_PRESET].includes(controls.preset))) continue;
    if (!applyHotas4ToPilot(pilot)) continue;
    await writeBackedUp(file, original, JSON.stringify(pilot, null, 2) + "\n");
    activated++;
  }
  return { throttleConfigured: true, preset: HOTAS4_PRESET, activated };
}

/**
 * Run before Fate of the Galaxy launches. When FSO's Joy0 is a HOTAS 4, make
 * sure the preset and pilot bindings are in place, so the player never has to
 * open a menu. Idempotent: an already-configured install is left untouched.
 */
async function autoApplyFotgDevicePresets(installDir, settingsPath) {
  const ini = await fsp.readFile(settingsPath, "utf8").catch(() => "");
  const guid = ini.match(/^Joy0GUID\s*=\s*([0-9a-f]{32})\s*$/im)?.[1];
  if (!guid || !isHotas4Guid(guid)) return { applied: false };
  const result = await configureFotgHotas4(installDir, settingsPath, [{ name: "T.Flight Hotas 4", guid }], { force: false });
  return { applied: true, ...result };
}

module.exports = {
  findFsoExecutable, parseFsoJoysticks, queryFsoJoysticks, withFsoJoysticks, fsoSettingsPath, saveFsoJoysticks,
  withHotas4Preset, configureFotgHotas4, applyHotas4ToPilot, autoApplyFotgDevicePresets, isHotas4Guid,
  HOTAS4_BUTTONS, HOTAS4_HATS, HOTAS4_PRESET,
};
