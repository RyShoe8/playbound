"use strict";

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { execFile } = require("child_process");
const FSO_ACTION_ORDER = require("./fsoActionOrder");
const flightDevices = require("./flightDevices");

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

/*
 * Fate of the Galaxy's actions for each flight role (see flightDevices.js).
 * This is the whole game-specific part: a device profile says which physical
 * button plays each role, this says what the role does in this game. Column is
 * where FSO keeps it; Primary for fire so the keyboard key stays Secondary-free.
 */
const FOTG_ROLE_ACTIONS = [
  ["fire", "FIRE_PRIMARY", "Primary fire", "Primary"],
  ["altFire", "FIRE_SECONDARY", "Secondary fire"],
  ["aux1", "CUSTOM_CONTROL_1", "Targeting computer"],
  ["targetNearest", "TARGET_NEXT_CLOSEST_HOSTILE", "Nearest hostile"],
  ["aux2", "CYCLE_PRIMARY_WEAPON_SEQUENCE", "Primary firing rate"],
  ["aux3", "CUSTOM_CONTROL_5", "Stationary targeting"],
  ["aux4", "CUSTOM_CONTROL_3", "S-foils"],
  ["extra1", "SHIELD_EQUALIZE", "Equalize shields"],
  ["cycleSecondary", "CYCLE_SECONDARY", "Cycle secondary weapon"],
  ["cyclePrimary", "CYCLE_NEXT_PRIMARY", "Cycle primary weapon"],
  ["targetReticle", "TARGET_SHIP_IN_RETICLE", "Target under reticle"],
  ["pause", "TOGGLE_GLIDING", "Active pause"],
];
const HAT_ACTIONS = [["up", "PADLOCK_UP"], ["down", "PADLOCK_DOWN"], ["left", "PADLOCK_LEFT"], ["right", "PADLOCK_RIGHT"]];
// FSO's stock layout puts this on button 2; with a role there it would fire twice.
const CLEARED_ACTIONS = ["TARGET_CLOSEST_SHIP_ATTACKING_SELF"];

const PRESET_MARKER = "; PlayBound flight preset";
const LEGACY_MARKERS = ["; PlayBound HOTAS 4 throttle preset", PRESET_MARKER];
const HOTAS4 = flightDevices.profileForVidPid("044f:b67c");
// Kept for the HOTAS 4: pilots already carry this name, and the launch check
// treats a pilot on PlayBound's own preset as safe to refresh.
const HOTAS4_PRESET = "PlayBound TFlight HOTAS 4";

function presetNameFor(profile) {
  if (profile.id === HOTAS4.id) return HOTAS4_PRESET;
  return `PlayBound ${profile.label}`.slice(0, 60);
}

/** Every PlayBound preset name, so a refresh recognises its own work under any device. */
function isPlayBoundPreset(name) {
  return name === HOTAS4_PRESET || /^PlayBound /.test(String(name || ""));
}

/**
 * What a device profile binds in FSO: buttons, hat and axes, all by FSO name.
 * Pure, so the table writer, the pilot writer and the tests share one answer.
 */
function fsoBindingsFor(profile) {
  const buttons = [];
  for (const [role, action, label, column = "Secondary"] of FOTG_ROLE_ACTIONS) {
    const button = flightDevices.buttonForRole(profile, role);
    if (button !== null) buttons.push({ role, action, label, column, button });
  }
  const hats = HAT_ACTIONS.map(([physical, action]) => ({
    action,
    // FSO reads hat pushes as buttons 128 + SDL direction (up, right, down, left).
    button: 128 + flightDevices.hatIndexFor(profile, physical),
  }));
  const a = profile.axes || {};
  const axes = {
    heading: Number.isInteger(a.stickX) ? a.stickX : -1,
    pitch: Number.isInteger(a.stickY) ? a.stickY : -1,
    bank: Number.isInteger(a.twist) ? a.twist : -1,
    bankAlt: Number.isInteger(a.rocker) ? a.rocker : -1,
    throttle: Number.isInteger(a.throttle) ? a.throttle : -1,
  };
  return { buttons, hats, axes, preset: presetNameFor(profile) };
}

/** Kept for callers and tests that list the HOTAS 4 buttons: [label, button, action, description, column]. */
const HOTAS4_BUTTONS = fsoBindingsFor(HOTAS4).buttons.map((b) => {
  const physical = Object.entries(HOTAS4.buttons).find(([, index]) => index === b.button)?.[0];
  return [physical, b.button, b.action, b.label, ...(b.column === "Primary" ? ["Primary"] : [])];
});
const HOTAS4_HATS = fsoBindingsFor(HOTAS4).hats.map((h) => [h.action, h.button, h.action]);

/** Device profile for an FSO joystick, from its SDL GUID or, failing that, its name. */
function profileForFsoDevice(device) {
  const measured = flightDevices.profileForVidPid(flightDevices.vidPidFromSdlGuid(device?.guid));
  if (measured) return measured;
  if (/^T[.]?Flight Hotas 4$/i.test(String(device?.name || ""))) return HOTAS4;
  return null;
}

function withFlightPreset(table, slot, profile) {
  if (!Number.isInteger(slot) || slot < 0 || slot > 3) throw new Error("Invalid joystick slot");
  for (const marker of LEGACY_MARKERS) {
    const start = table.indexOf(marker);
    if (start < 0) continue;
    const end = table.indexOf("#End", start);
    if (end < 0) throw new Error("Incomplete PlayBound control preset");
    table = table.slice(0, start) + table.slice(end + 4);
  }
  const { buttons, hats, axes, preset } = fsoBindingsFor(profile);
  const joy = `CID_JOY${slot}`;
  const axisBind = (action, index, alt = -1) =>
    `$Bind: ${action}\n$Primary:\n` +
    (index >= 0 ? `$Controller: ${joy}\n$Flags: CCF_AXIS\n$Input: ${flightDevices.AXIS_NAMES[index]}` : "$Controller: CID_NONE") +
    "\n$Secondary:\n" +
    (alt >= 0 ? `$Controller: ${joy}\n$Flags: CCF_AXIS\n$Input: ${flightDevices.AXIS_NAMES[alt]}` : "$Controller: CID_NONE");
  // Override clones the game's defaults; a preset of PlayBound's own would start
  // with every control empty and lose the keyboard.
  const lines = [
    axisBind("JOY_HEADING_AXIS", axes.heading),
    axisBind("JOY_PITCH_AXIS", axes.pitch),
    axisBind("JOY_BANK_AXIS", axes.bank, axes.bankAlt),
    axisBind("JOY_ABS_THROTTLE_AXIS", axes.throttle),
    ...buttons.map((b) => `$Bind: ${b.action}\n$${b.column}:\n$Controller: ${joy}\n$Flags: NONE\n$Input: ${b.button}`),
    ...hats.map((h) => `$Bind: ${h.action}\n$Secondary:\n$Controller: ${joy}\n$Flags: NONE\n$Input: ${h.button}`),
    ...CLEARED_ACTIONS.map((action) => `$Bind: ${action}\n$Secondary:\n$Controller: CID_NONE`),
  ];
  return table.trimEnd() + `\n\n${PRESET_MARKER} (${profile.id})\n#ControlConfigOverride\n$Name: ${preset}\n${lines.join("\n")}\n#End\n`;
}

function withHotas4Preset(table, slot) {
  return withFlightPreset(table, slot, HOTAS4);
}

/**
 * Put a device's bindings into a pilot's own control arrays.
 *
 * FSO keeps a pilot's live bindings in the pilot file — one joystick button
 * per action, in IoActionId order, plus five axis slots (heading, pitch, bank,
 * absolute throttle, relative throttle). The "preset" field beside them is
 * only a label, so renaming it changed nothing in game. Keyboard keys are left
 * exactly as they were; any other action on one of these buttons is cleared so
 * nothing fires twice.
 */
function applyFlightProfileToPilot(pilot, profile) {
  const controls = pilot?.sections?.controls;
  if (!controls || !Array.isArray(controls.controls) || !Array.isArray(controls.axes)) return false;
  const { buttons, hats, axes, preset } = fsoBindingsFor(profile);
  const wanted = new Map([...buttons, ...hats].map((b) => [b.action, b.button]));
  for (const action of CLEARED_ACTIONS) wanted.set(action, -1);
  const taken = new Set([...buttons, ...hats].map((b) => b.button));
  controls.controls.forEach((binding, index) => {
    const button = wanted.get(FSO_ACTION_ORDER[index]);
    if (button !== undefined) binding.joystick = button;
    else if (taken.has(binding.joystick)) binding.joystick = -1;
  });
  [axes.heading, axes.pitch, axes.bank, axes.throttle, -1].forEach((axis, slot) => {
    if (controls.axes[slot]) controls.axes[slot].axis_map = axis;
  });
  controls.preset = preset;
  return true;
}

/*
 * A campaign save (.csg) is a 16-byte header then sections of
 * [u16 id][u32 size][body]. Section 0x0004 holds only the controls preset
 * name, null-terminated, and FSO re-applies that preset by name whenever the
 * campaign loads — after the pilot file. So bindings written only into the
 * pilot were replaced by the player's old preset on the next launch. Nothing
 * in the file points at absolute offsets, so the section can be resized.
 */
const CSG_HEADER_BYTES = 16;
const CSG_CONTROLS_PRESET = 0x0004;

function readCsgSections(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < CSG_HEADER_BYTES || buffer.toString("latin1", 0, 4) !== "CSG_") return null;
  const sections = [];
  let offset = CSG_HEADER_BYTES;
  while (offset < buffer.length) {
    if (offset + 6 > buffer.length) return null;
    const id = buffer.readUInt16LE(offset);
    const size = buffer.readUInt32LE(offset + 2);
    if (offset + 6 + size > buffer.length) return null;
    sections.push({ id, body: buffer.subarray(offset + 6, offset + 6 + size) });
    offset += 6 + size;
  }
  return sections;
}

/** The campaign save's preset name, or null if the file is not a readable csg. */
function csgControlsPreset(buffer) {
  const section = readCsgSections(buffer)?.find((s) => s.id === CSG_CONTROLS_PRESET);
  return section ? section.body.toString("utf8").replace(/\0+$/, "") : null;
}

/** The save with its controls preset renamed, or null when it cannot be parsed or has no such section. */
function withCsgControlsPreset(buffer, name) {
  const sections = readCsgSections(buffer);
  if (!sections || !sections.some((s) => s.id === CSG_CONTROLS_PRESET)) return null;
  const parts = [buffer.subarray(0, CSG_HEADER_BYTES)];
  for (const { id, body } of sections) {
    const next = id === CSG_CONTROLS_PRESET ? Buffer.from(`${name}\0`, "utf8") : body;
    const header = Buffer.alloc(6);
    header.writeUInt16LE(id, 0);
    header.writeUInt32LE(next.length, 2);
    parts.push(header, next);
  }
  return Buffer.concat(parts);
}

function applyHotas4ToPilot(pilot) {
  return applyFlightProfileToPilot(pilot, HOTAS4);
}

function isHotas4Guid(guid) {
  return flightDevices.vidPidFromSdlGuid(guid) === HOTAS4.vidPid;
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

/**
 * Bind Fate of the Galaxy to the flight device in FSO's first joystick slot.
 *
 * The device's measured profile is used when there is one; otherwise, when the
 * player has explicitly chosen flight-stick play, the generic flight-stick
 * layout, so an unmeasured stick still gets throttle, roll and fire. FSO's
 * pilot format stores one joystick per binding, so the stick must be Joy0.
 */
async function configureFotgHotas4(installDir, settingsPath, devices, { force = true, allowGeneric = true } = {}) {
  const first = Array.isArray(devices) ? devices[0] : null;
  if (!first) return { throttleConfigured: false };
  const profile = profileForFsoDevice(first) || (allowGeneric ? flightDevices.GENERIC_FLIGHTSTICK : null);
  if (!profile) return { throttleConfigured: false };
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
      await writeBackedUp(table, original, withFlightPreset(original, 0, profile));
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
    // Choosing flight-stick play applies to every pilot. The automatic run at
    // launch leaves a pilot the player has moved to their own preset alone.
    if (!controls || (!force && controls.preset !== "default" && !isPlayBoundPreset(controls.preset))) continue;
    if (!applyFlightProfileToPilot(pilot, profile)) continue;
    await writeBackedUp(file, original, JSON.stringify(pilot, null, 2) + "\n");
    activated++;
  }
  // Campaign saves name the preset FSO re-applies on load; point them at ours.
  for (const name of files.filter((name) => name.endsWith(".csg"))) {
    const file = path.join(players, name);
    const original = await fsp.readFile(file);
    const current = csgControlsPreset(original);
    if (current === null) continue;
    if (!force && current !== "default" && !isPlayBoundPreset(current)) continue;
    const next = withCsgControlsPreset(original, presetNameFor(profile));
    if (!next || next.equals(original)) continue;
    try { await fsp.writeFile(`${file}.playbound-hotas4.bak`, original, { flag: "wx" }); }
    catch (error) { if (error.code !== "EEXIST") throw error; }
    const temp = `${file}.playbound-${process.pid}.tmp`;
    await fsp.writeFile(temp, next);
    try { await fsp.rename(temp, file); }
    catch (error) { await fsp.rm(temp, { force: true }); throw error; }
  }
  return {
    throttleConfigured: true,
    preset: presetNameFor(profile),
    device: profile.label,
    measured: !profile.generic,
    activated,
  };
}

/**
 * Run before Fate of the Galaxy launches. When FSO's Joy0 is a device with a
 * measured profile, make sure its preset and pilot bindings are in place, so
 * the player never opens a menu. An unmeasured device is left for the explicit
 * flight-stick choice. Idempotent: an already-configured install is unchanged.
 */
async function autoApplyFotgDevicePresets(installDir, settingsPath) {
  const ini = await fsp.readFile(settingsPath, "utf8").catch(() => "");
  const guid = ini.match(/^Joy0GUID\s*=\s*([0-9a-f]{32})\s*$/im)?.[1];
  if (!guid || !profileForFsoDevice({ guid })) return { applied: false };
  const result = await configureFotgHotas4(installDir, settingsPath, [{ guid }], { force: false, allowGeneric: false });
  return { applied: true, ...result };
}

module.exports = {
  findFsoExecutable, parseFsoJoysticks, queryFsoJoysticks, withFsoJoysticks, fsoSettingsPath, saveFsoJoysticks,
  withHotas4Preset, withFlightPreset, fsoBindingsFor, configureFotgHotas4, applyHotas4ToPilot,
  applyFlightProfileToPilot, autoApplyFotgDevicePresets, isHotas4Guid, profileForFsoDevice,
  csgControlsPreset, withCsgControlsPreset,
  FOTG_ROLE_ACTIONS, HOTAS4_BUTTONS, HOTAS4_HATS, HOTAS4_PRESET,
};
