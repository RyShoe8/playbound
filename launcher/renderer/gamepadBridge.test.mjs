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
