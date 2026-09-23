/**
 * Unit tests for clientSession.js
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createClientSessionCoordinator, translateError } = require("./clientSession");

function createMockSocket() {
  const sent = [];
  const socket = {
    sent,
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
    send(data) {
      sent.push(JSON.parse(data));
    },
    close() {
      if (socket.onclose) socket.onclose();
    },
    // Test helper to simulate server message
    simulateServerMessage(msg) {
      if (socket.onmessage) socket.onmessage({ data: JSON.stringify(msg) });
    },
  };
  return socket;
}

function createMockMoonlightClient() {
  let streaming = false;
  let lastOptions = null;
  return {
    isStreaming: () => streaming,
    startStream: (opts) => {
      streaming = true;
      lastOptions = opts;
      return { ok: true };
    },
    stopStream: () => {
      streaming = false;
    },
    getLastOptions: () => lastOptions,
  };
}

test("error translation handles known codes and fallback", () => {
  assert.equal(translateError("not-trusted"), "Pairing was denied or timed out on the host PC.");
  assert.equal(translateError("game-not-installed"), "This game is not installed on the host PC.");
  assert.equal(translateError("custom-error"), "custom-error");
});

test("client session coordinator runs happy-path pair and launch flow", async () => {
  let mockSocket;
  const moonlight = createMockMoonlightClient();
  const coordinator = createClientSessionCoordinator({
    moonlightClient: moonlight,
    createWebSocket: () => {
      mockSocket = createMockSocket();
      return mockSocket;
    },
  });

  const statuses = [];
  coordinator.onStatusChange((status) => statuses.push(status));

  const startPromise = coordinator.startSession({
    hostAddress: "192.168.1.50",
    hostPort: 47998,
    clientDeviceId: "client-dev-123",
    clientDeviceName: "Ryan's Laptop",
    gameSlug: "openra",
    editionSlug: "ra",
    resolution: "1920x1080",
    fps: 60,
  });

  // Socket opens
  mockSocket.onopen();
  assert.deepEqual(mockSocket.sent[0], {
    type: "pair",
    deviceId: "client-dev-123",
    name: "Ryan's Laptop",
  });

  // Host approves pairing
  mockSocket.simulateServerMessage({ type: "pair-result", allowed: true });
  assert.deepEqual(mockSocket.sent[1], {
    type: "session-request",
    deviceId: "client-dev-123",
    gameSlug: "openra",
    editionSlug: "ra",
  });

  // Host signals session ready
  mockSocket.simulateServerMessage({
    type: "session-ready",
    sessionId: "sess-999",
    host: "192.168.1.50",
    port: 47989,
    appName: "openra",
  });

  const result = await startPromise;
  assert.equal(result.ok, true);
  assert.equal(result.sessionId, "sess-999");
  assert.equal(moonlight.isStreaming(), true);
  assert.equal(moonlight.getLastOptions().appName, "openra");
  assert.equal(moonlight.getLastOptions().host, "192.168.1.50");

  assert.deepEqual(statuses, ["connecting", "authenticating", "starting-game", "streaming"]);
  assert.equal(coordinator.getActiveSession()?.sessionId, "sess-999");

  // Host ends session on game exit
  mockSocket.simulateServerMessage({ type: "session-ended", reason: "player_exit" });
  assert.equal(moonlight.isStreaming(), false);
  assert.equal(coordinator.getActiveSession(), null);
  assert.equal(statuses[statuses.length - 1], "ended");
});

test("client session coordinator handles pairing rejection", async () => {
  let mockSocket;
  const moonlight = createMockMoonlightClient();
  const coordinator = createClientSessionCoordinator({
    moonlightClient: moonlight,
    createWebSocket: () => {
      mockSocket = createMockSocket();
      return mockSocket;
    },
  });

  const startPromise = coordinator.startSession({
    hostAddress: "192.168.1.50",
    hostPort: 47998,
    clientDeviceId: "client-dev-123",
    clientDeviceName: "Ryan's Laptop",
    gameSlug: "openra",
  });

  mockSocket.onopen();
  mockSocket.simulateServerMessage({ type: "pair-result", allowed: false });

  const result = await startPromise;
  assert.equal(result.ok, false);
  assert.match(result.error, /denied/);
  assert.equal(moonlight.isStreaming(), false);
});

test("client session coordinator handles host errors like game-not-installed", async () => {
  let mockSocket;
  const moonlight = createMockMoonlightClient();
  const coordinator = createClientSessionCoordinator({
    moonlightClient: moonlight,
    createWebSocket: () => {
      mockSocket = createMockSocket();
      return mockSocket;
    },
  });

  const startPromise = coordinator.startSession({
    hostAddress: "192.168.1.50",
    hostPort: 47998,
    clientDeviceId: "client-dev-123",
    clientDeviceName: "Ryan's Laptop",
    gameSlug: "uninstalled-game",
  });

  mockSocket.onopen();
  mockSocket.simulateServerMessage({ type: "pair-result", allowed: true });
  mockSocket.simulateServerMessage({ type: "error", reason: "game-not-installed" });

  const result = await startPromise;
  assert.equal(result.ok, false);
  assert.match(result.error, /not installed/);
  assert.equal(moonlight.isStreaming(), false);
});

test("manual stopSession tears down Moonlight and resets state", async () => {
  let mockSocket;
  const moonlight = createMockMoonlightClient();
  const coordinator = createClientSessionCoordinator({
    moonlightClient: moonlight,
    createWebSocket: () => {
      mockSocket = createMockSocket();
      return mockSocket;
    },
  });

  const startPromise = coordinator.startSession({
    hostAddress: "192.168.1.50",
    hostPort: 47998,
    clientDeviceId: "client-dev-123",
    clientDeviceName: "Ryan's Laptop",
    gameSlug: "openra",
  });

  mockSocket.onopen();
  mockSocket.simulateServerMessage({ type: "pair-result", allowed: true });
  mockSocket.simulateServerMessage({
    type: "session-ready",
    sessionId: "sess-1",
    host: "192.168.1.50",
  });
  await startPromise;

  assert.equal(moonlight.isStreaming(), true);
  coordinator.stopSession();
  assert.equal(moonlight.isStreaming(), false);
  assert.equal(coordinator.getActiveSession(), null);
});

test("moonlight process unexpected exit triggers session cleanup", async () => {
  let mockSocket;
  let onExitCallback = null;
  const moonlight = {
    _streaming: false,
    isStreaming: () => moonlight._streaming,
    startStream: (opts) => {
      moonlight._streaming = true;
      onExitCallback = opts.onExit;
      return { ok: true };
    },
    stopStream: () => {
      moonlight._streaming = false;
    },
  };

  const coordinator = createClientSessionCoordinator({
    moonlightClient: moonlight,
    createWebSocket: () => {
      mockSocket = createMockSocket();
      return mockSocket;
    },
  });

  const statuses = [];
  coordinator.onStatusChange((s) => statuses.push(s));

  const startPromise = coordinator.startSession({
    hostAddress: "192.168.1.50",
    hostPort: 47998,
    clientDeviceId: "client-dev-123",
    clientDeviceName: "Ryan's Laptop",
    gameSlug: "openra",
  });

  mockSocket.onopen();
  mockSocket.simulateServerMessage({ type: "pair-result", allowed: true });
  mockSocket.simulateServerMessage({
    type: "session-ready",
    sessionId: "sess-1",
    host: "192.168.1.50",
  });
  await startPromise;

  assert.equal(moonlight.isStreaming(), true);
  // User or crash closes Moonlight process directly
  onExitCallback();
  assert.equal(coordinator.getActiveSession(), null);
  assert.equal(statuses[statuses.length - 1], "ended");
});

