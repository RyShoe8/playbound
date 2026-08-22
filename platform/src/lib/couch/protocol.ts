/**
 * Couch Mode protocol types and constants (JSON v1).
 * Keep in sync with docs/couch-input-protocol.md and launcher/services/couch/protocol.js.
 */

export const COUCH_PROTOCOL_VERSION = 1;
export const COUCH_MAX_PLAYERS = 4;

/** @typedef {'legacy-virtual-pad' | 'native-structured-input'} CouchInputMode */
/** @typedef {'host' | 'controller' | 'display'} CouchSessionRole */

export const COUCH_INPUT_MODES = /** @type {const} */ ([
  "legacy-virtual-pad",
  "native-structured-input",
]);

export const COUCH_ROLES = /** @type {const} */ (["host", "controller", "display"]);

export const INPUT_PROFILE_IDS = /** @type {const} */ ([
  "standard-gamepad",
  "touch-gamepad",
  "racing-wheel",
  "golf-swing",
  "tilt-steering",
  "party-buttons",
  "twin-stick",
  "pointer",
]);

export const SHIPPED_INPUT_PROFILES = /** @type {const} */ ([
  "standard-gamepad",
  "touch-gamepad",
]);

/** Xbox-layout button bitmasks for JSON v1 `buttons` field. */
export const BUTTON = /** @type {const} */ ({
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
});

/**
 * @typedef {object} CouchInputPacketV1
 * @property {1} v
 * @property {number} seq
 * @property {number} t
 * @property {number} p
 * @property {number} buttons
 * @property {number} lx
 * @property {number} ly
 * @property {number} rx
 * @property {number} ry
 * @property {number} lt
 * @property {number} rt
 */

/**
 * @param {unknown} raw
 * @returns {CouchInputPacketV1 | null}
 */
export function parseInputPacketV1(raw) {
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  if (o.v !== 1) return null;
  const seq = Number(o.seq);
  const t = Number(o.t);
  const p = Number(o.p);
  if (!Number.isFinite(seq) || !Number.isFinite(t) || !Number.isFinite(p)) return null;
  if (p < 0 || p >= COUCH_MAX_PLAYERS) return null;
  return {
    v: 1,
    seq,
    t,
    p,
    buttons: Number(o.buttons) >>> 0,
    lx: clampAxis(Number(o.lx) || 0),
    ly: clampAxis(Number(o.ly) || 0),
    rx: clampAxis(Number(o.rx) || 0),
    ry: clampAxis(Number(o.ry) || 0),
    lt: clampTrigger(Number(o.lt) || 0),
    rt: clampTrigger(Number(o.rt) || 0),
  };
}

function clampAxis(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(-1, Math.min(1, n));
}

function clampTrigger(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Empty released pad state for a slot.
 * @param {number} p
 * @returns {CouchInputPacketV1}
 */
export function emptyPadState(p) {
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
