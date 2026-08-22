/**
 * Couch Mode protocol (JSON v1) — keep aligned with
 * docs/couch-input-protocol.md and platform/src/lib/couch/protocol.ts.
 */

"use strict";

const COUCH_PROTOCOL_VERSION = 1;
const COUCH_MAX_PLAYERS = 4;

const BUTTON = {
  A: 1 << 0,
  B: 1 << 1,
  X: 1 << 2,
  Y: 1 << 3,
  LB: 1 << 4,
  RB: 1 << 5,
  BACK: 1 << 6,
  START: 1 << 7,
  LS: 1 << 8,
  RS: 1 << 9,
  DPAD_UP: 1 << 10,
  DPAD_DOWN: 1 << 11,
  DPAD_LEFT: 1 << 12,
  DPAD_RIGHT: 1 << 13,
  GUIDE: 1 << 14,
};

const SHIPPED_INPUT_PROFILES = ["standard-gamepad", "touch-gamepad"];

function clampAxis(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(-1, Math.min(1, n));
}

function clampTrigger(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function parseInputPacketV1(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.v !== 1) return null;
  const seq = Number(raw.seq);
  const t = Number(raw.t);
  const p = Number(raw.p);
  if (!Number.isFinite(seq) || !Number.isFinite(t) || !Number.isFinite(p)) return null;
  if (p < 0 || p >= COUCH_MAX_PLAYERS) return null;
  return {
    v: 1,
    seq,
    t,
    p,
    buttons: Number(raw.buttons) >>> 0,
    lx: clampAxis(Number(raw.lx) || 0),
    ly: clampAxis(Number(raw.ly) || 0),
    rx: clampAxis(Number(raw.rx) || 0),
    ry: clampAxis(Number(raw.ry) || 0),
    lt: clampTrigger(Number(raw.lt) || 0),
    rt: clampTrigger(Number(raw.rt) || 0),
  };
}

function emptyPadState(p) {
  return {
    v: 1,
    seq: 0,
    t: Date.now(),
    p,
    buttons: 0,
    lx: 0,
    ly: 0,
    rx: 0,
    ry: 0,
    lt: 0,
    rt: 0,
  };
}

module.exports = {
  COUCH_PROTOCOL_VERSION,
  COUCH_MAX_PLAYERS,
  BUTTON,
  SHIPPED_INPUT_PROFILES,
  parseInputPacketV1,
  emptyPadState,
};
