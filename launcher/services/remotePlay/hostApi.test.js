/**
 * PlayBound Remote host API — message routing against fake sockets and a
 * fake pairing service (no real WebSocket connection, no real launch
 * orchestration).
 */

"use strict";

const assert = require("assert");
const { createMessageHandler } = require("./hostApi");

function fakeSocket() {
  const sent = [];
  return {
    sent,
    send(text) {
      sent.push(JSON.parse(text));
    },
    close() {},
  };
}

async function main() {
  /* ── "pair": approved ─────────────────────────────────────────────────── */

  {
    const connections = new Map();
    const pairingService = {
      requestPairing: async () => true,
      isTrusted: () => false,
    };
    const handle = createMessageHandler({
      pairingService,
      onSessionRequest: async () => ({ ok: false }),
      connectionsByDevice: connections,
    });

    const socket = fakeSocket();
    const ctx = {};
    handle(socket, ctx, JSON.stringify({ type: "pair", deviceId: "client1", name: "Laptop" }));
    // requestPairing resolves asynchronously — flush microtasks.
    await Promise.resolve();
    await Promise.resolve();

    assert.strictEqual(socket.sent.length, 1);
    assert.deepStrictEqual(socket.sent[0], { type: "pair-result", allowed: true });
    assert.strictEqual(ctx.deviceId, "client1", "the connection context must remember which device paired on it");
    assert.strictEqual(connections.get("client1"), socket, "a paired connection must be tracked for later notifySessionEnded");
  }

  /* ── "session-request" from an untrusted device is refused, never launched ── */

  {
    let launchCalled = false;
    const pairingService = { requestPairing: async () => true, isTrusted: () => false };
    const handle = createMessageHandler({
      pairingService,
      onSessionRequest: async () => {
        launchCalled = true;
        return { ok: true };
      },
      connectionsByDevice: new Map(),
    });

    const socket = fakeSocket();
    handle(socket, {}, JSON.stringify({ type: "session-request", deviceId: "stranger", gameSlug: "dune-legacy" }));
    await Promise.resolve();
    await Promise.resolve();

    assert.strictEqual(launchCalled, false, "an untrusted device must never reach launch orchestration");
    assert.deepStrictEqual(socket.sent[0], { type: "error", reason: "not-trusted" });
  }

  /* ── "session-request" from a trusted device launches and replies ready ── */

  {
    const pairingService = { requestPairing: async () => true, isTrusted: (id) => id === "client1" };
    let receivedRequest = null;
    const handle = createMessageHandler({
      pairingService,
      onSessionRequest: async (req) => {
        receivedRequest = req;
        return { ok: true, sessionId: "s1", host: "192.168.1.50", port: 47989, appName: "Dune Legacy" };
      },
      connectionsByDevice: new Map(),
    });

    const socket = fakeSocket();
    handle(
      socket,
      { deviceId: "client1" },
      JSON.stringify({ type: "session-request", gameSlug: "dune-legacy", editionSlug: "official" })
    );
    await Promise.resolve();
    await Promise.resolve();

    assert.deepStrictEqual(receivedRequest, {
      clientDeviceId: "client1",
      gameSlug: "dune-legacy",
      editionSlug: "official",
    });
    assert.deepStrictEqual(socket.sent[0], {
      type: "session-ready",
      sessionId: "s1",
      host: "192.168.1.50",
      port: 47989,
      appName: "Dune Legacy",
    });
  }

  /* ── A launch failure (game not installed, host busy, ...) is translated, not thrown ── */

  {
    const pairingService = { requestPairing: async () => true, isTrusted: () => true };
    const handle = createMessageHandler({
      pairingService,
      onSessionRequest: async () => ({ ok: false, reason: "host-busy" }),
      connectionsByDevice: new Map(),
    });

    const socket = fakeSocket();
    handle(socket, { deviceId: "client1" }, JSON.stringify({ type: "session-request", gameSlug: "dune-legacy" }));
    await Promise.resolve();
    await Promise.resolve();

    assert.deepStrictEqual(socket.sent[0], { type: "error", reason: "host-busy" });
  }

  /* ── Malformed / unknown messages are ignored, not crashed on ────────────── */

  {
    const handle = createMessageHandler({
      pairingService: { requestPairing: async () => true, isTrusted: () => true },
      onSessionRequest: async () => ({ ok: true }),
      connectionsByDevice: new Map(),
    });
    const socket = fakeSocket();
    assert.doesNotThrow(() => handle(socket, {}, "not json"));
    assert.doesNotThrow(() => handle(socket, {}, JSON.stringify({ no: "type field" })));
    assert.doesNotThrow(() => handle(socket, {}, JSON.stringify({ type: "unknown-type" })));
    assert.strictEqual(socket.sent.length, 0);
  }

  console.log("remote play host api ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
