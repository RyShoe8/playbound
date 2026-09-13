/**
 * OpenBOR binary Saves/*.cfg player-1 joystick bindings.
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
 */

const OPENBOR_CFG_VERSION = 0x00033747;
const P1_KEYS_OFFSET = 0x34;
const KEYS_PER_PLAYER = 12;
const JOY_LIST_FIRST = 600;

/**
 * DualSense / PS-class pads on this 2014 OpenBOR build (SDL joystick 0).
 * Button indices are JOY_LIST_FIRST + SDL button number.
 *   attack=2, special=1, jump=3, start=10, screenshot=14
 * attack2 uses button 0; attack3/attack4 stay on keyboard Z/X (in-game remap left them).
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
 * D-pad/hat + face/shoulder mapping from common OpenBOR XInput cfgs; faces
 * use the same JOY_LIST_FIRST base the DualSense capture established.
 */
const XBOX_P1_KEYS = [
  628, 630, 631, 629,
  600, 601, // A, B
  602, 603, // X, Y
  604, 605, // LB, RB
  607, 606, // Start, Back→screenshot
];

function isOpenBorCfg(buf) {
  return Buffer.isBuffer(buf) && buf.length >= P1_KEYS_OFFSET + KEYS_PER_PLAYER * 4 && buf.readUInt32LE(0) === OPENBOR_CFG_VERSION;
}

function readP1Keys(buf) {
  const keys = [];
  for (let i = 0; i < KEYS_PER_PLAYER; i += 1) {
    keys.push(buf.readInt32LE(P1_KEYS_OFFSET + i * 4));
  }
  return keys;
}

/** True when move/attack still look like keyboard defaults. */
function p1StillKeyboard(buf) {
  if (!isOpenBorCfg(buf)) return false;
  const keys = readP1Keys(buf);
  // Default TMNT P1 starts with SDLK-style arrows (~0x111) or letter keys.
  return keys.slice(0, 4).every((k) => k < JOY_LIST_FIRST);
}

/**
 * First PlayBound DualSense template left special on keyboard F (102) while
 * jump was already on joy button 3. Re-write so existing installs pick up the
 * correct special/attack2 mapping without wiping a player's own remap.
 */
function p1HasBrokenDualSenseSpecial(buf) {
  if (!isOpenBorCfg(buf)) return false;
  const keys = readP1Keys(buf);
  const dirsAreJoy = keys.slice(0, 4).every((k) => k >= JOY_LIST_FIRST);
  // jump=603 (btn3), special=102 (F) — the broken shipped template
  return dirsAreJoy && keys[8] === 603 && keys[9] === 102;
}

function keysForProfile(profile) {
  const family = String(profile?.family || "");
  if (family === "xbox") return XBOX_P1_KEYS;
  // DualSense / DualShock / generic PS-class on this build.
  return DUALSENSE_P1_KEYS;
}

/**
 * Write P1 joystick bindings when the cfg is still on keyboard defaults,
 * or when it still has the broken DualSense special=F template.
 * Returns a new Buffer, or null when nothing should change.
 */
function applyOpenBorP1Keys(buf, profile) {
  if (!isOpenBorCfg(buf) || !profile) return null;
  const family = String(profile.family || "");
  const shouldFix =
    p1StillKeyboard(buf) ||
    (family !== "xbox" && p1HasBrokenDualSenseSpecial(buf));
  if (!shouldFix) return null;
  const keys = keysForProfile(profile);
  const next = Buffer.from(buf);
  for (let i = 0; i < KEYS_PER_PLAYER; i += 1) {
    next.writeInt32LE(keys[i] | 0, P1_KEYS_OFFSET + i * 4);
  }
  return next;
}

module.exports = {
  OPENBOR_CFG_VERSION,
  P1_KEYS_OFFSET,
  JOY_LIST_FIRST,
  DUALSENSE_P1_KEYS,
  XBOX_P1_KEYS,
  isOpenBorCfg,
  readP1Keys,
  p1StillKeyboard,
  p1HasBrokenDualSenseSpecial,
  applyOpenBorP1Keys,
};
