import assert from "node:assert/strict";
import { test } from "node:test";

test("concurrent peers share one display capture and shutdown invalidates pending capture", async () => {
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const oldDocument = globalThis.document;
  const oldWindow = globalThis.window;
  const oldMediaStream = globalThis.MediaStream;
  const pending = [];
  let requests = 0;
  let stopped = 0;
  const track = () => ({
    readyState: "live",
    stop: () => { stopped++; },
    addEventListener: () => {},
    applyConstraints: async () => {},
    getSettings: () => ({ width: 1920, height: 1080 }),
  });
  const rawStream = () => {
    const video = track();
    return {
      active: true,
      getVideoTracks: () => [video],
      getAudioTracks: () => [],
      getTracks: () => [video],
    };
  };
  try {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { mediaDevices: { getDisplayMedia: () => {
        requests++;
        return new Promise((resolve) => pending.push(resolve));
      } } },
    });
    globalThis.window = { setInterval: () => 1, clearInterval: () => {} };
    globalThis.document = { createElement: (tag) => tag === "video"
      ? { muted: false, playsInline: false, srcObject: null, play: async () => {} }
      : { width: 0, height: 0, getContext: () => ({ drawImage: () => {} }), captureStream: () => ({ getVideoTracks: () => [track()] }) } };
    globalThis.MediaStream = class {
      constructor(tracks) { this.tracks = tracks; }
      getVideoTracks() { return this.tracks.filter((t) => t); }
    };

    const { ensureHostDisplayStream, stopHostDisplayStream } =
      await import(`./hostDisplayStream.js?single-flight=${Date.now()}`);
    const first = ensureHostDisplayStream();
    const second = ensureHostDisplayStream();
    assert.equal(requests, 1);
    pending.shift()(rawStream());
    const [a, b] = await Promise.all([first, second]);
    assert.equal(a, b);
    assert.equal(requests, 1);

    stopHostDisplayStream();
    const late = ensureHostDisplayStream();
    const lateWaiter = ensureHostDisplayStream();
    assert.equal(requests, 2);
    stopHostDisplayStream();
    pending.shift()(rawStream());
    assert.equal(await late, null);
    assert.equal(await lateWaiter, null);
    assert.equal(requests, 2, "shutdown must not start a replacement capture");
    assert.ok(stopped > 0, "late capture tracks must be stopped");
  } finally {
    if (oldNavigator) Object.defineProperty(globalThis, "navigator", oldNavigator);
    else delete globalThis.navigator;
    globalThis.document = oldDocument;
    globalThis.window = oldWindow;
    globalThis.MediaStream = oldMediaStream;
  }
});
