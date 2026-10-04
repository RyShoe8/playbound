"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { applyOpenBorFullscreen, OPENBOR_CFG_VERSION } = require("./openborCfg");

function cfg({ fullscreen = 0, stretch = 0 } = {}) {
  const buf = Buffer.alloc(348, 0);
  buf.writeUInt32LE(OPENBOR_CFG_VERSION, 0);
  buf.writeInt32LE(fullscreen, 320);
  buf.writeInt32LE(stretch, 308);
  return buf;
}

test("first run turns on fullscreen on the primary monitor", () => {
  const next = applyOpenBorFullscreen(cfg(), { firstRun: true });
  assert.equal(next.readInt32LE(320), 1);
  assert.equal(next.readInt32LE(308), 0);
});

test("in-game fullscreen's multi-monitor stretch is repaired", () => {
  const next = applyOpenBorFullscreen(cfg({ fullscreen: 1, stretch: 2 }));
  assert.equal(next.readInt32LE(308), 0);
  assert.equal(next.readInt32LE(320), 1);
});

test("windowed by choice stays windowed after the first run", () => {
  assert.equal(applyOpenBorFullscreen(cfg({ fullscreen: 0, stretch: 2 })), null);
});

test("an already-correct file is left alone", () => {
  assert.equal(applyOpenBorFullscreen(cfg({ fullscreen: 1, stretch: 0 })), null);
});

const { bindUnboundP1, XMEN_DUALSENSE_P1_KEYS } = require("./openborCfg");

function xmenCfg(p1) {
  const buf = Buffer.alloc(352, 0);
  buf.writeUInt32LE(0x00033748, 0);
  for (let i = 0; i < 12; i += 1) buf.writeInt32LE(p1[i], 0x34 + i * 4);
  return buf;
}

test("X-Men: an entirely unbound P1 gets the play-tested pad layout", () => {
  const next = bindUnboundP1(xmenCfg(Array(12).fill(-999)), XMEN_DUALSENSE_P1_KEYS);
  for (let i = 0; i < 12; i += 1) assert.equal(next.readInt32LE(0x34 + i * 4), XMEN_DUALSENSE_P1_KEYS[i]);
});

test("X-Men: any existing binding is the player's and is left alone", () => {
  const p1 = Array(12).fill(-999);
  p1[0] = 273;
  assert.equal(bindUnboundP1(xmenCfg(p1), XMEN_DUALSENSE_P1_KEYS), null);
});

test("X-Men: fullscreen uses the 352-byte format's own offset", () => {
  const next = applyOpenBorFullscreen(xmenCfg(Array(12).fill(-999)), { firstRun: true });
  assert.equal(next.readInt32LE(352 - 28), 1);
});
