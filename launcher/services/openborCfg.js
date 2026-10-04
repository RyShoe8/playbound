/**
 * OpenBOR binary Saves/*.cfg player joystick bindings.
 *
 * These packs (TMNT Rescue-Palooza, same-era OpenBOR 3.0) ship P1 on the
 * keyboard and P2–P4 on joystick slots. A DualSense is detected, but nothing
 * moves until Options → Control is remapped. The capture below is from a
 * DualSense session on TMNT_RP_1_1_5.cfg (PlayBound install, 2026-09-13).
 *
 * Layout is s_savedata keys[player][12]:
 *   up, down, left, right, attack, attack2, attack3, attack4,
 *   jump, special, start, screenshot
 *
 * Codes ≥ 600 are joystick slots (JOY_LIST_FIRST); below that are keyboard.
 * OpenBOR uses JOY_MAX_INPUTS = 64 per port, so port N input I is
 *   JOY_LIST_FIRST + N * 64 + I
 *
 * Within a port the inputs are buttons, then two per axis (- then +), then
 * four per hat (up, right, down, left), counted from 1 after the buttons:
 *   hat up = buttons + 2 * axes + 1
 * so the d-pad index depends on the pad. Logs/OpenBorLog.txt prints each
 * pad's counts ("5 axes, 10 buttons, 1 hat(s)"). A DualSense reports 15
 * buttons and 6 axes, putting the hat at 28 — which is exactly what the
 * capture below recorded.
 */

const OPENBOR_CFG_VERSION = 0x00033747;
const P1_KEYS_OFFSET = 0x34;
const KEYS_PER_PLAYER = 12;
const BYTES_PER_PLAYER = KEYS_PER_PLAYER * 4;
const JOY_LIST_FIRST = 600;
const JOY_MAX_INPUTS = 64;

/**
 * DualSense / PS-class pads on this 2014 OpenBOR build (SDL joystick 0).
 * Button indices are JOY_LIST_FIRST + SDL button number; past the 15 buttons
 * come the stick axes, so 616–619 are the left stick.
 *
 * Read back from a hand-tuned, play-tested session on 2026-10-04 (left stick
 * to move, every action on the pad). It replaces the first template, which
 * moved on the hat and left attack3/attack4 on the keyboard.
 */
const DUALSENSE_P1_KEYS = [
  618, 619, 616, 617, // up down left right (left stick)
  602, 601, 600, 604, // attack, attack2, attack3, attack4
  603, 605, // jump, special
  610, 614, // start, screenshot
];

/** The first DualSense template, so configs written with it can be upgraded. */
const OLD_DUALSENSE_P1_KEYS = [628, 630, 631, 629, 602, 600, 122, 120, 603, 601, 610, 614];
const OLD_DUALSENSE_HAT = [628, 630, 631, 629];

/**
 * Xbox pads on the same engine, which sees them through DirectInput as
 * 10 buttons, 5 axes and 1 hat (OpenBorLog.txt on a real session), so the
 * hat starts at 10 + 2 * 5 + 1 = 21. This used to reuse the DualSense 628–631,
 * inputs an Xbox pad does not have: every remote-play guest (a virtual
 * Xbox 360 pad) got face buttons and no movement at all.
 */
const XBOX_P1_KEYS = [
  621, 623, 624, 622, // up down left right (hat)
  600, 601, // A, B
  602, 603, // X, Y
  604, 605, // LB, RB
  607, 606, // Start, Back→screenshot
];

function playerKeysOffset(playerIndex) {
  return P1_KEYS_OFFSET + playerIndex * BYTES_PER_PLAYER;
}

function shiftJoyKeysToPort(keys, port) {
  return keys.map((k) => {
    const n = Number(k) | 0;
    if (n < JOY_LIST_FIRST) return n; // keep keyboard bindings
    const button = (n - JOY_LIST_FIRST) % JOY_MAX_INPUTS;
    return JOY_LIST_FIRST + port * JOY_MAX_INPUTS + button;
  });
}

function isOpenBorCfg(buf) {
  return (
    Buffer.isBuffer(buf) &&
    buf.length >= playerKeysOffset(3) + BYTES_PER_PLAYER &&
    buf.readUInt32LE(0) === OPENBOR_CFG_VERSION
  );
}

function readPlayerKeys(buf, playerIndex) {
  const keys = [];
  const base = playerKeysOffset(playerIndex);
  for (let i = 0; i < KEYS_PER_PLAYER; i += 1) {
    keys.push(buf.readInt32LE(base + i * 4));
  }
  return keys;
}

function readP1Keys(buf) {
  return readPlayerKeys(buf, 0);
}

/** True when move/attack still look like keyboard defaults. */
function p1StillKeyboard(buf) {
  if (!isOpenBorCfg(buf)) return false;
  const keys = readP1Keys(buf);
  return keys.slice(0, 4).every((k) => k < JOY_LIST_FIRST);
}

function p1HasBrokenDualSenseSpecial(buf) {
  if (!isOpenBorCfg(buf)) return false;
  const keys = readP1Keys(buf);
  const dirsAreJoy = keys.slice(0, 4).every((k) => k >= JOY_LIST_FIRST);
  return dirsAreJoy && keys[8] === 603 && keys[9] === 102;
}

/**
 * True when an Xbox pad was written with the DualSense hat indices, which is
 * what every install got before XBOX_P1_KEYS was corrected.
 */
function p1HasDualSenseHatOnXbox(buf) {
  if (!isOpenBorCfg(buf)) return false;
  const dirs = readP1Keys(buf).slice(0, 4);
  return dirs.every((k, i) => k === OLD_DUALSENSE_HAT[i]) && readP1Keys(buf)[4] === XBOX_P1_KEYS[4];
}

/** P1 still holds a template PlayBound wrote before DUALSENSE_P1_KEYS was tuned. */
function p1HasOldDualSenseTemplate(buf) {
  if (!isOpenBorCfg(buf)) return false;
  const keys = readP1Keys(buf);
  return keys.every((k, i) => k === OLD_DUALSENSE_P1_KEYS[i]);
}

function joyPortOfKey(code) {
  const n = Number(code) | 0;
  if (n < JOY_LIST_FIRST) return -1;
  return Math.floor((n - JOY_LIST_FIRST) / JOY_MAX_INPUTS);
}

/**
 * True when P1 and P2 movement both sit on the same SDL joystick port —
 * one physical pad (or a bridge mirror of it) then drives both characters.
 */
function playersShareJoyPort(buf) {
  if (!isOpenBorCfg(buf)) return false;
  const p1 = readPlayerKeys(buf, 0);
  const p2 = readPlayerKeys(buf, 1);
  const port1 = joyPortOfKey(p1[0]);
  const port2 = joyPortOfKey(p2[0]);
  return port1 >= 0 && port2 >= 0 && port1 === port2;
}

function keysForProfile(profile) {
  const family = String(profile?.family || "");
  if (family === "xbox") return XBOX_P1_KEYS;
  return DUALSENSE_P1_KEYS;
}

/**
 * Write P1 onto joy port 0 and P2–P4 onto ports 1–3 so one physical pad
 * cannot drive both P1 and P2 after PlayBound remaps P1 off the keyboard.
 * Returns a new Buffer, or null when nothing should change.
 */
function applyOpenBorP1Keys(buf, profile) {
  if (!isOpenBorCfg(buf) || !profile) return null;
  const family = String(profile.family || "");
  const shouldFix =
    p1StillKeyboard(buf) ||
    playersShareJoyPort(buf) ||
    (family !== "xbox" && (p1HasBrokenDualSenseSpecial(buf) || p1HasOldDualSenseTemplate(buf))) ||
    (family === "xbox" && p1HasDualSenseHatOnXbox(buf));
  if (!shouldFix) return null;
  const p1Keys = keysForProfile(profile);
  const next = Buffer.from(buf);
  for (let player = 0; player < 4; player += 1) {
    const keys = shiftJoyKeysToPort(p1Keys, player);
    const base = playerKeysOffset(player);
    for (let i = 0; i < KEYS_PER_PLAYER; i += 1) {
      next.writeInt32LE(keys[i] | 0, base + i * 4);
    }
  }
  return next;
}

/*
 * Display fields near the end of the same s_savedata (offsets for the 348-byte
 * TMNT build, verified by toggling them on a 4K / 150% desktop):
 *   len-28  fullscreen (1 = on)
 *   len-40  stretch mode — in-game fullscreen sets 2, which stretches the
 *           picture across every monitor; 0 keeps it on the primary one
 */
const FULLSCREEN_FROM_END = 28;
const STRETCH_FROM_END = 40;

/**
 * Fullscreen on the primary monitor. `firstRun` turns fullscreen on; after
 * that only the multi-monitor stretch is repaired, so a player who picks
 * windowed in-game keeps it. Returns a new Buffer, or null when nothing changes.
 */
/** Either OpenBOR save format PlayBound ships: 348-byte (TMNT) or 352-byte (X-Men). */
const DISPLAY_CFG_VERSIONS = new Set([OPENBOR_CFG_VERSION, 0x00033748]);
function isOpenBorDisplayCfg(buf) {
  return Buffer.isBuffer(buf) && buf.length >= 0x34 + BYTES_PER_PLAYER && DISPLAY_CFG_VERSIONS.has(buf.readUInt32LE(0));
}

function applyOpenBorFullscreen(buf, { firstRun = false } = {}) {
  if (!isOpenBorDisplayCfg(buf)) return null;
  const fsOff = buf.length - FULLSCREEN_FROM_END;
  const stretchOff = buf.length - STRETCH_FROM_END;
  const next = Buffer.from(buf);
  if (firstRun) next.writeInt32LE(1, fsOff);
  if (next.readInt32LE(fsOff) === 1 && next.readInt32LE(stretchOff) !== 0) next.writeInt32LE(0, stretchOff);
  return next.equals(buf) ? null : next;
}

/** "No key" in OpenBOR's 352-byte format — X-Men ships every P1 action this way. */
const UNBOUND = -999;

/**
 * Bind P1 when the pack shipped it entirely unbound, which left the pad doing
 * nothing until the player found Options -> Control. Any binding at all means
 * the player (or the game) chose one, and it is left alone.
 */
function bindUnboundP1(buf, keys) {
  if (!isOpenBorDisplayCfg(buf) || !Array.isArray(keys) || keys.length !== KEYS_PER_PLAYER) return null;
  for (let i = 0; i < KEYS_PER_PLAYER; i += 1) {
    if (buf.readInt32LE(P1_KEYS_OFFSET + i * 4) !== UNBOUND) return null;
  }
  const next = Buffer.from(buf);
  keys.forEach((k, i) => next.writeInt32LE(k | 0, P1_KEYS_OFFSET + i * 4));
  return next;
}

/** X-Men Arcade Remake, DualSense: play-tested on 2026-10-04 (left stick, every action on the pad). */
const XMEN_DUALSENSE_P1_KEYS = [618, 619, 616, 617, 602, 604, 603, 606, 601, 605, 610, 614];

/*
 * X-Men's display options, play-tested 2026-10-04: sharper scaling and the
 * fullest screen fit the game offers. Offsets in the 352-byte format; the
 * player changed exactly these three fields in Options to get there.
 */
const XMEN_DISPLAY_DEFAULTS = [
  [260, 1],
  [284, 5],
  [288, 7],
];

/** First launch only: the play-tested display options. Returns a new Buffer or null. */
function applyXmenDisplayDefaults(buf) {
  if (!isOpenBorDisplayCfg(buf) || buf.length !== 352) return null;
  const next = Buffer.from(buf);
  for (const [offset, value] of XMEN_DISPLAY_DEFAULTS) next.writeInt32LE(value, offset);
  return next.equals(buf) ? null : next;
}

module.exports = {
  applyOpenBorFullscreen,
  applyXmenDisplayDefaults,
  bindUnboundP1,
  XMEN_DUALSENSE_P1_KEYS,
  OPENBOR_CFG_VERSION,
  P1_KEYS_OFFSET,
  JOY_LIST_FIRST,
  JOY_MAX_INPUTS,
  DUALSENSE_P1_KEYS,
  XBOX_P1_KEYS,
  isOpenBorCfg,
  readP1Keys,
  readPlayerKeys,
  playerKeysOffset,
  shiftJoyKeysToPort,
  joyPortOfKey,
  p1StillKeyboard,
  p1HasBrokenDualSenseSpecial,
  p1HasDualSenseHatOnXbox,
  p1HasOldDualSenseTemplate,
  playersShareJoyPort,
  applyOpenBorP1Keys,
};
