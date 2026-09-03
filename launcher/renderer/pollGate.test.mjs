/**
 * The launcher lives in the tray, so most of its polling happened with nobody
 * looking. These lock in the narrow rule: skip only when the window is hidden
 * or the machine is idle AND nothing is actually happening — a member who
 * stops polling during a live party misses their leader launching the game,
 * which is far worse than the traffic it would save.
 *
 * Run: node renderer/pollGate.test.mjs
 */

import assert from "node:assert/strict";
import { test } from "node:test";

// pollGate reads `document.hidden`; there is no DOM here, so supply one.
globalThis.document = { hidden: false };
const { pollSuspended, setSystemIdle, isSystemIdle } = await import("./pollGate.js");

function reset() {
  globalThis.document.hidden = false;
  setSystemIdle(false);
}

test("a visible, attended launcher always polls", () => {
  reset();
  assert.equal(pollSuspended(), false);
  assert.equal(pollSuspended({ liveParty: false, playing: false }), false);
});

test("a hidden window with nothing happening stops asking", () => {
  reset();
  globalThis.document.hidden = true;
  assert.equal(pollSuspended(), true);
});

test("an idle machine stops asking even with the window on screen", () => {
  reset();
  setSystemIdle(true);
  assert.equal(isSystemIdle(), true);
  assert.equal(pollSuspended(), true);
});

test("a live party keeps polling however hidden or idle the launcher is", () => {
  // The regression this guards: a minimised member missing the launch.
  reset();
  globalThis.document.hidden = true;
  setSystemIdle(true);
  assert.equal(pollSuspended({ liveParty: true }), false);
});

test("a running game keeps polling too", () => {
  reset();
  globalThis.document.hidden = true;
  setSystemIdle(true);
  assert.equal(pollSuspended({ playing: true }), false);
});

test("coming back off idle resumes polling", () => {
  reset();
  setSystemIdle(true);
  assert.equal(pollSuspended(), true);
  setSystemIdle(false);
  assert.equal(pollSuspended(), false);
});
