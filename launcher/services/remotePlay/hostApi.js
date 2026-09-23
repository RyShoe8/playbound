/**
 * PlayBound Remote — the host's local API a paired client connects to
 * directly by its discovered LAN address (see `discovery.js`). No round
 * trip through playbound.club — matches the plan's LAN-only V1 boundary.
 *
 * Reuses couch mode's hand-rolled WebSocket server (`couch/wsServer.js`)
 * rather than adding a `ws` dependency for a second protocol.
 *
 * Wire protocol (line-delimited JSON over one WS connection per client):
 *   client -> host  { type: "pair", deviceId, name }
 *   host   -> client { type: "pair-result", allowed }
 *   client -> host  { type: "session-request", deviceId, gameSlug, editionSlug? }
 *   host   -> client { type: "session-ready", sessionId, host, port, appName }
 *          | { type: "error", reason }
 *   host   -> client { type: "session-ended", reason }   (unprompted, on game exit)
 */

"use strict";

const { createPlainWebSocketServer } = require("../couch/wsServer");

/**
 * @param {object} deps
 * @param {import("./pairing").createPairingService extends (...args: any) => infer R ? R : never} deps.pairingService
 * @param {(req: { clientDeviceId: string, gameSlug: string, editionSlug: string|null }) => Promise<{ ok: boolean, reason?: string, sessionId?: string, host?: string, port?: number, appName?: string }>} deps.onSessionRequest
 *   The actual launch orchestration — apply edition/mods/control profile,
 *   launch the game, start the Sunshine app entry. Injected so this module
 *   stays testable without any of that machinery.
 */
/**
 * The actual message router, factored out from the transport so it can be
 * unit-tested against a fake socket — no real TCP connection needed.
 * @param {object} deps
 * @param {ReturnType<typeof import("./pairing").createPairingService>} deps.pairingService
 * @param {(req: object) => Promise<object>} deps.onSessionRequest
 * @param {Map<string, object>} deps.connectionsByDevice
 */
function createMessageHandler({ pairingService, onSessionRequest, connectionsByDevice }) {
  return function handleMessage(socket, ctx, text) {
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object" || typeof msg.type !== "string") return;

    if (msg.type === "pair") {
      const deviceId = String(msg.deviceId || "");
      const name = String(msg.name || "Unknown device");
      if (!deviceId) return;
      ctx.deviceId = deviceId;
      connectionsByDevice.set(deviceId, socket);
      void pairingService.requestPairing({ deviceId, name }).then((allowed) => {
        socket.send(JSON.stringify({ type: "pair-result", allowed }));
      });
      return;
    }

    if (msg.type === "session-request") {
      const deviceId = String(msg.deviceId || ctx.deviceId || "");
      if (!deviceId || !pairingService.isTrusted(deviceId)) {
        socket.send(JSON.stringify({ type: "error", reason: "not-trusted" }));
        return;
      }
      connectionsByDevice.set(deviceId, socket);
      void onSessionRequest({
        clientDeviceId: deviceId,
        gameSlug: String(msg.gameSlug || ""),
        editionSlug: msg.editionSlug ? String(msg.editionSlug) : null,
      }).then((result) => {
        if (result.ok) {
          socket.send(
            JSON.stringify({
              type: "session-ready",
              sessionId: result.sessionId,
              host: result.host,
              port: result.port,
              appName: result.appName,
              pin: result.pin,
            })
          );
        } else {
          socket.send(JSON.stringify({ type: "error", reason: result.reason || "unknown" }));
        }
      });
      return;
    }
  };
}

function createHostApiServer({ pairingService, onSessionRequest }) {
  /** @type {Map<string, { send: (s: string) => void, close: () => void }>} clientDeviceId -> live connection */
  const connectionsByDevice = new Map();
  const handleMessage = createMessageHandler({ pairingService, onSessionRequest, connectionsByDevice });
  let wsServer = null;
  let boundPort = null;

  async function start(port = 0) {
    if (wsServer) return boundPort;
    wsServer = createPlainWebSocketServer((socket, text) => {
      const ctx = socket.remoteCtx || (socket.remoteCtx = { deviceId: null });
      handleMessage(socket, ctx, text);
    });
    boundPort = await wsServer.listen(port);
    return boundPort;
  }

  async function stop() {
    if (!wsServer) return;
    await wsServer.close();
    wsServer = null;
    boundPort = null;
    connectionsByDevice.clear();
  }

  function getPort() {
    return boundPort;
  }

  function isListening() {
    return Boolean(wsServer && boundPort);
  }

  /** Called from the host's existing game-exit hook (sendGameExited) — tells the streaming client the session ended, so it closes Moonlight without the player touching anything. */
  function notifySessionEnded(clientDeviceId, reason = "player_exit") {
    const socket = connectionsByDevice.get(clientDeviceId);
    if (!socket) return false;
    socket.send(JSON.stringify({ type: "session-ended", reason }));
    return true;
  }

  return { start, stop, getPort, isListening, notifySessionEnded };
}

module.exports = { createHostApiServer, createMessageHandler };
