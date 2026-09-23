/**
 * The two physical/output vocabularies a ControlProfile binds between,
 * mirrored from their launcher-side source of truth so the admin editor can
 * validate against real values instead of accepting any string.
 *
 * Keep these in sync by hand — the same tradeoff `couch/protocol.js`'s
 * `BUTTON` bitmask already makes, duplicated across three files rather than
 * shared, because the platform and launcher are separate packages with no
 * shared build step between them.
 */

/** Physical buttons plus the launcher Input Engine's directional and trigger thresholds. */
export const PHYSICAL_BUTTON_NAMES = [
  "A",
  "B",
  "X",
  "Y",
  "LB",
  "RB",
  "BACK",
  "START",
  "LS",
  "RS",
  "DPAD_UP",
  "DPAD_DOWN",
  "DPAD_LEFT",
  "DPAD_RIGHT",
  "GUIDE",
  "LEFT_UP",
  "LEFT_DOWN",
  "LEFT_LEFT",
  "LEFT_RIGHT",
  "LT",
  "RT",
] as const;

/** Mirrors launcher/services/inputEngine/vkCodes.js's VK table keys. */
export const VK_NAMES = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""),
  ..."0123456789".split(""),
  "Space",
  "Escape",
  "Enter",
  "Tab",
  "Backspace",
  "LeftShift",
  "RightShift",
  "LeftCtrl",
  "RightCtrl",
  "LeftAlt",
  "RightAlt",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "PageUp",
  "PageDown",
  "F1",
  "F2",
  "F3",
  "F4",
  "F5",
  "F6",
  "F7",
  "F8",
  "F9",
  "F10",
  "F11",
  "F12",
] as const;

export const MOUSE_BUTTON_NAMES = ["left", "right", "middle"] as const;

export type PhysicalButtonName = (typeof PHYSICAL_BUTTON_NAMES)[number];
export type VkName = (typeof VK_NAMES)[number];
export type MouseButtonName = (typeof MOUSE_BUTTON_NAMES)[number];
