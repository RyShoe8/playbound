/**
 * Map keyboard / mouse to Xbox-layout pad state for Couch join.
 * Remotes "play with keys/mouse"; the host still sees a normal virtual pad per slot.
 */

import { BUTTON } from "@/lib/couch/protocol";

export type PadAxes = {
  buttons: number;
  lx: number;
  ly: number;
  rx: number;
  ry: number;
  lt: number;
  rt: number;
};

const EMPTY: PadAxes = { buttons: 0, lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0 };

/** Face / shoulder / menu bindings. */
const KEY_BITS: Record<string, number> = {
  KeyZ: BUTTON.A,
  KeyJ: BUTTON.A,
  Space: BUTTON.A,
  KeyX: BUTTON.B,
  KeyK: BUTTON.B,
  ShiftLeft: BUTTON.B,
  ShiftRight: BUTTON.B,
  KeyC: BUTTON.X,
  KeyL: BUTTON.X,
  KeyV: BUTTON.Y,
  KeyU: BUTTON.Y,
  KeyQ: BUTTON.LB,
  KeyE: BUTTON.RB,
  Enter: BUTTON.START,
  Backspace: BUTTON.BACK,
};

const MOVE_KEYS = {
  up: new Set(["KeyW", "ArrowUp"]),
  down: new Set(["KeyS", "ArrowDown"]),
  left: new Set(["KeyA", "ArrowLeft"]),
  right: new Set(["KeyD", "ArrowRight"]),
} as const;

export function emptyPadAxes(): PadAxes {
  return { ...EMPTY };
}

export function applyKeyboardMouseEvent(
  state: PadAxes,
  heldMove: { up: boolean; down: boolean; left: boolean; right: boolean },
  ev: { type: "keydown" | "keyup" | "mousedown" | "mouseup"; code?: string; button?: number }
): PadAxes {
  const next = { ...state };

  if (ev.type === "keydown" || ev.type === "keyup") {
    const code = ev.code || "";
    const down = ev.type === "keydown";
    if (MOVE_KEYS.up.has(code)) heldMove.up = down;
    else if (MOVE_KEYS.down.has(code)) heldMove.down = down;
    else if (MOVE_KEYS.left.has(code)) heldMove.left = down;
    else if (MOVE_KEYS.right.has(code)) heldMove.right = down;
    else if (KEY_BITS[code] != null) {
      const bit = KEY_BITS[code];
      if (down) next.buttons |= bit;
      else next.buttons &= ~bit;
    }
  }

  if (ev.type === "mousedown" || ev.type === "mouseup") {
    const down = ev.type === "mousedown";
    const bit = ev.button === 2 ? BUTTON.B : ev.button === 0 ? BUTTON.A : 0;
    if (bit) {
      if (down) next.buttons |= bit;
      else next.buttons &= ~bit;
    }
  }

  let lx = 0;
  let ly = 0;
  let buttons = next.buttons;
  buttons &= ~(BUTTON.DPAD_UP | BUTTON.DPAD_DOWN | BUTTON.DPAD_LEFT | BUTTON.DPAD_RIGHT);
  if (heldMove.up) {
    ly -= 1;
    buttons |= BUTTON.DPAD_UP;
  }
  if (heldMove.down) {
    ly += 1;
    buttons |= BUTTON.DPAD_DOWN;
  }
  if (heldMove.left) {
    lx -= 1;
    buttons |= BUTTON.DPAD_LEFT;
  }
  if (heldMove.right) {
    lx += 1;
    buttons |= BUTTON.DPAD_RIGHT;
  }
  next.buttons = buttons;
  next.lx = lx;
  next.ly = ly;
  return next;
}

export const KEYBOARD_MOUSE_HELP =
  "WASD / arrows move · Z/J/Space attack · X/K/Shift · C/L · V/U · Q/E shoulders · Enter start · click = A / right-click = B";
