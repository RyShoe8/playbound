"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getGameControls,
  resolveQuitHint,
  resolveControlsForGame,
} = require("./gameControls");

test("resolves curated controls for known games", () => {
  const tmnt = getGameControls("tmnt-rescue-palooza");
  assert.ok(tmnt, "TMNT controls must exist");
  assert.ok(Array.isArray(tmnt.schemes), "TMNT must have schemes");
  assert.equal(tmnt.schemes.some((s) => s.scheme === "keyboard"), true);
  assert.equal(tmnt.schemes.some((s) => s.scheme === "controller"), true);

  const xmen = getGameControls("x-men-arcade-remake");
  assert.ok(xmen, "X-Men controls must exist");

  const morrowind = getGameControls("morrowind");
  assert.ok(morrowind, "Morrowind controls must exist");
});

test("resolveQuitHint provides 'leave the game' phrasing", () => {
  const tmntQuit = resolveQuitHint("tmnt-rescue-palooza");
  assert.match(tmntQuit, /leave the game/i);
  assert.doesNotMatch(tmntQuit, /leave the match/i);

  const genericQuit = resolveQuitHint("unknown-custom-game");
  assert.match(genericQuit, /leave the game/i);
  assert.doesNotMatch(genericQuit, /leave the match/i);
});

test("falls back cleanly to standard controls for unknown titles", () => {
  const fallback = resolveControlsForGame("some-unlisted-game");
  assert.ok(fallback);
  assert.ok(Array.isArray(fallback.schemes));
  assert.equal(fallback.schemes.length >= 2, true);
  const kb = fallback.schemes.find((s) => s.scheme === "keyboard");
  assert.ok(kb && kb.bindings.length > 0);
  assert.ok(kb.bindings.some((b) => b.action.includes("Move")));
});
