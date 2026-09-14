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
 * OpenBOR uses JOY_MAX_INPUTS = 64 per port, so port N button B is
 *   JOY_LIST_FIRST + N * 64 + B
 */

const OPENBOR_CFG_VERSION = 0x00033747;
const P1_KEYS_OFFSET = 0x34;
const KEYS_PER_PLAYER = 12;
const BYTES_PER_PLAYER = KEYS_PER_PLAYER * 4;
const JOY_LIST_FIRST = 600;
const JOY_MAX_INPUTS = 64;

/**
 * DualSense / PS-class pads on this 2014 OpenBOR build (SDL joystick 0).
 * Button indices are JOY_LIST_FIRST + SDL button number.
 */
const DUALSENSE_P1_KEYS = [
  628, 630, 631, 629, // up down left right (axes/hat)
  602, 600, // attack=btn2, attack2=btn0
  122, 120, // attack3=Z, attack4=X
  603, 601, // jump=btn3, special=btn1
  610, 614, // start=btn10, screenshot=btn14
];

/**
 * Xbox pads on the same engine — button indices differ from DualSense.
 */
const XBOX_P1_KEYS = [
  628, 630, 631, 629,
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
    (family !== "xbox" && p1HasBrokenDualSenseSpecial(buf));
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

module.exports = {
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
  playersShareJoyPort,
  applyOpenBorP1Keys,
};
