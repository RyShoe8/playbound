import { test } from "node:test";
import assert from "node:assert/strict";

test("Controls keeps sending held-stick frames and releases input when the pad disconnects", async () => {
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const oldWindow = globalThis.window;
  const oldSetTimeout = globalThis.setTimeout;
  const oldClearTimeout = globalThis.clearTimeout;
  const frames = [];
  let nextTick;
  let connected = true;
  const pad = {
    connected: true,
    buttons: Array.from({ length: 18 }, () => ({ pressed: false, value: 0 })),
    axes: [0, 0, 0.6, 0],
  };
  try {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { getGamepads: () => connected ? [pad] : [] },
    });
    globalThis.window = { playbound: { gamepadBridgeSendFrame: (frame) => frames.push(frame) } };
    globalThis.setTimeout = (callback) => { nextTick = callback; return 1; };
    globalThis.clearTimeout = () => {};
    const { enablePlayBoundControlsBridge, disablePlayBoundControlsBridge } =
      await import(`./gamepadBridge.js?held-stick=${Date.now()}`);
    enablePlayBoundControlsBridge();
    assert.equal(frames.length, 1);
    nextTick();
    assert.equal(frames.length, 2, "an unchanged deflected stick must continue moving the mouse");
    connected = false;
    nextTick();
    assert.equal(frames.length, 3);
    assert.equal(frames[2].buttons, 0);
    assert.equal(frames[2].rx, 0);
    disablePlayBoundControlsBridge();
  } finally {
    if (oldNavigator) Object.defineProperty(globalThis, "navigator", oldNavigator);
    else delete globalThis.navigator;
    globalThis.window = oldWindow;
    globalThis.setTimeout = oldSetTimeout;
    globalThis.clearTimeout = oldClearTimeout;
  }
});

test("a neutral pad still sends a release frame when it disconnects", async () => {
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const oldWindow = globalThis.window;
  const oldSetTimeout = globalThis.setTimeout;
  const oldClearTimeout = globalThis.clearTimeout;
  const frames = [];
  let nextTick;
  let connected = true;
  const pad = {
    connected: true,
    buttons: Array.from({ length: 18 }, () => ({ pressed: false, value: 0 })),
    axes: [0, 0, 0, 0],
  };
  try {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { getGamepads: () => connected ? [pad] : [] },
    });
    globalThis.window = { playbound: {
      startGamepadBridge: async () => ({ ok: true }),
      stopGamepadBridge: async () => {},
      gamepadBridgeSendFrame: (frame) => frames.push(frame),
    } };
    globalThis.setTimeout = (callback) => { nextTick = callback; return 1; };
    globalThis.clearTimeout = () => {};
    const { enableGamepadBridge, disableGamepadBridge } =
      await import(`./gamepadBridge.js?neutral-pad=${Date.now()}`);
    assert.equal(await enableGamepadBridge(), true);
    assert.equal(frames.length, 1, "a new virtual pad needs an initial neutral frame");
    connected = false;
    nextTick();
    assert.equal(frames.length, 2, "disconnect must release the virtual pad");
    assert.equal(frames[1].buttons, 0);
    await disableGamepadBridge();
  } finally {
    if (oldNavigator) Object.defineProperty(globalThis, "navigator", oldNavigator);
    else delete globalThis.navigator;
    globalThis.window = oldWindow;
    globalThis.setTimeout = oldSetTimeout;
    globalThis.clearTimeout = oldClearTimeout;
  }
});
