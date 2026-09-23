/**
 * Integration and flow tests for PlayBound Remote V1.
 * Tests hostApi <-> clientSession coordination, pairing, launch orchestration,
 * and game exit teardown.
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createHostApiServer } = require("./hostApi");
const { createPairingService } = require("./pairing");
const { createClientSessionCoordinator } = require("./clientSession");

function createMockSocketPair() {
  const clientListeners = { onopen: null, onmessage: null, onerror: null, onclose: null };
  const serverListeners = { onopen: null, onmessage: null, onerror: null, onclose: null };

  const clientSocket = {
    ...clientListeners,
    send(data) {
      setTimeout(() => {
        if (serverSocket.onmessage) {
          serverSocket.onmessage({ data });
        }
      }, 0);
    },
    close() {
      setTimeout(() => {
        if (clientSocket.onclose) clientSocket.onclose();
        if (serverSocket.onclose) serverSocket.onclose();
      }, 0);
    },
  };

  const serverSocket = {
    ...serverListeners,
    send(data) {
      setTimeout(() => {
        if (clientSocket.onmessage) {
          clientSocket.onmessage({ data });
        }
      }, 0);
    },
    close() {
      setTimeout(() => {
        if (serverSocket.onclose) serverSocket.onclose();
        if (clientSocket.onclose) clientSocket.onclose();
      }, 0);
    },
  };

  return { clientSocket, serverSocket };
}

test("full end-to-end Remote Play pairing, session launch, and exit teardown", async () => {
  let pendingPairingRequest = null;
  const pairingService = createPairingService({
    hostDeviceId: "gaming-pc-host",
    getApiBase: () => "https://example.invalid",
    authedFetch: async () => ({
      ok: true,
      json: async () => ({ trustedDevices: [{ deviceId: "laptop-client", name: "Ryan's Laptop" }] }),
    }),
    onPairingRequest: (req) => {
      pendingPairingRequest = req;
    },
  });

  let hostGameLaunched = false;
  let sunshineStarted = false;
  let sunshineStopped = false;

  const fakeSunshine = {
    start: () => {
      sunshineStarted = true;
      return { ok: true };
    },
    stop: () => {
      sunshineStopped = true;
    },
  };

  const hostApi = createHostApiServer({
    pairingService,
    onSessionRequest: async ({ clientDeviceId, gameSlug, editionSlug }) => {
      if (!pairingService.isTrusted(clientDeviceId)) {
        return { ok: false, reason: "not-trusted" };
      }
      fakeSunshine.start();
      hostGameLaunched = true;
      return {
        ok: true,
        sessionId: "remote-sess-42",
        host: "192.168.1.100",
        port: 47989,
        appName: gameSlug,
      };
    },
  });

  let moonlightStreaming = false;
  let moonlightStreamOpts = null;
  const fakeMoonlight = {
    isStreaming: () => moonlightStreaming,
    startStream: (opts) => {
      moonlightStreaming = true;
      moonlightStreamOpts = opts;
      return { ok: true };
    },
    stopStream: () => {
      moonlightStreaming = false;
    },
  };

  // Wire mock transport connecting hostApi message router to clientSession
  const { clientSocket, serverSocket } = createMockSocketPair();
  const serverCtx = { deviceId: null };

  // When client sends to serverSocket, route through hostApi's message handler:
  serverSocket.onmessage = (event) => {
    // We use hostApi's internal routing for serverSocket
    const msg = event.data;
    // Deliver to hostApi
    hostApiMessageHandler(serverSocket, serverCtx, msg);
  };

  // Extract hostApi's message handler directly
  const { createMessageHandler } = require("./hostApi");
  const connectionsByDevice = new Map();
  const hostApiMessageHandler = createMessageHandler({
    pairingService,
    onSessionRequest: async ({ clientDeviceId, gameSlug, editionSlug }) => {
      if (!pairingService.isTrusted(clientDeviceId)) {
        return { ok: false, reason: "not-trusted" };
      }
      fakeSunshine.start();
      hostGameLaunched = true;
      return {
        ok: true,
        sessionId: "remote-sess-42",
        host: "192.168.1.100",
        port: 47989,
        appName: gameSlug,
      };
    },
    connectionsByDevice,
  });

  const clientCoordinator = createClientSessionCoordinator({
    moonlightClient: fakeMoonlight,
    createWebSocket: () => {
      setTimeout(() => {
        if (clientSocket.onopen) clientSocket.onopen();
      }, 0);
      return clientSocket;
    },
  });

  // Client starts session with host
  const sessionPromise = clientCoordinator.startSession({
    hostAddress: "192.168.1.100",
    hostPort: 47998,
    clientDeviceId: "laptop-client",
    clientDeviceName: "Ryan's Laptop",
    gameSlug: "openra",
    editionSlug: "ra",
  });

  // Wait for client to connect and send pair request
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(pendingPairingRequest);
  assert.equal(pendingPairingRequest.name, "Ryan's Laptop");

  // Host approves pairing
  await pairingService.respondToPairing(pendingPairingRequest.requestId, true);

  // Client receives pair approval, requests session, and host launches game
  const sessionResult = await sessionPromise;
  assert.equal(sessionResult.ok, true);
  assert.equal(sessionResult.sessionId, "remote-sess-42");
  assert.equal(hostGameLaunched, true);
  assert.equal(sunshineStarted, true);
  assert.equal(moonlightStreaming, true);
  assert.equal(moonlightStreamOpts.host, "192.168.1.100");
  assert.equal(moonlightStreamOpts.appName, "openra");

  // Now simulate host game exit: hostApi notifies client
  hostApi.notifySessionEnded("laptop-client", "player_exit");
  // Also connectionsByDevice received the socket:
  const clientConn = connectionsByDevice.get("laptop-client");
  assert.ok(clientConn);
  clientConn.send(JSON.stringify({ type: "session-ended", reason: "player_exit" }));

  await new Promise((r) => setTimeout(r, 20));
  // Client moonlight stream must be cleanly closed and session state cleared
  assert.equal(moonlightStreaming, false);
  assert.equal(clientCoordinator.getActiveSession(), null);
});
