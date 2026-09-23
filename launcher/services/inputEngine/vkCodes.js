/**
 * Windows virtual-key codes for the keys a PlayBound Controls profile can
 * bind an action's output to.
 *
 * Names match the single-letter/digit keys directly ("W", "1") and use short
 * PascalCase names for the rest ("Space", "Escape", "LeftShift", ...). Values
 * are Win32's WM_KEYDOWN vkCode constants, so the sidecar's SendInput calls
 * (PlayBound.VigemHost's `key` command) need no further translation — this
 * table is the single source of truth on the JS side; keep it in sync with
 * any vk handling added to Program.cs.
 */

"use strict";

const VK = {};
for (let c = 65; c <= 90; c++) VK[String.fromCharCode(c)] = c; // A-Z
for (let d = 0; d <= 9; d++) VK[String(d)] = 0x30 + d; // 0-9

Object.assign(VK, {
  Space: 0x20,
  Escape: 0x1b,
  Enter: 0x0d,
  Tab: 0x09,
  Backspace: 0x08,
  LeftShift: 0xa0,
  RightShift: 0xa1,
  LeftCtrl: 0xa2,
  RightCtrl: 0xa3,
  LeftAlt: 0xa4,
  RightAlt: 0xa5,
  ArrowUp: 0x26,
  ArrowDown: 0x28,
  ArrowLeft: 0x25,
  ArrowRight: 0x27,
  PageUp: 0x21,
  PageDown: 0x22,
  Grave: 0xc0, // VK_OEM_3 — the `~` key, e.g. Star Wars Galaxies' interact bind.
  F1: 0x70,
  F2: 0x71,
  F3: 0x72,
  F4: 0x73,
  F5: 0x74,
  F6: 0x75,
  F7: 0x76,
  F8: 0x77,
  F9: 0x78,
  F10: 0x79,
  F11: 0x7a,
  F12: 0x7b,
});

module.exports = { VK };
