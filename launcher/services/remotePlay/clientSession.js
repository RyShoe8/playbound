/**
 * PlayBound Remote — Client Session Coordinator.
 *
 * Connects to a host's `hostApi` WebSocket server directly over the local network.
 * Handles:
 * 1. Automatic device pairing request if the client is not yet trusted by the host.
 * 2. Launch session request ({ type: "session-request", gameSlug, editionSlug }).
 * 3. Starting the vendored Moonlight client process once the host reports "session-ready".
 * 4. Listening for unprompted "session-ended" notifications when the game exits on the host,
 *    closing Moonlight and returning to the PlayBound UI cleanly.
 */

"use strict";

const DEFAULT_CONNECT_TIMEOUT_MS = 15000;
const WebSocket = require("ws");

/**
 * Translates hostApi / Moonlight failure codes into clear, human-friendly messages.
 * @param {string} reason
 * @returns {string}
 */
function translateError(reason) {
  switch (reason) {
    case "not-trusted":
      return "Pairing was denied or timed out on the host PC.";
    case "game-not-installed":
      return "This game is not installed on the host PC.";
    case "host-busy":
      return "The host PC is currently running another game.";
    case "host-component-missing":
      return "The host PC is missing the Remote Play host component.";
    case "connection-failed":
      return "Could not connect to the host PC on your local network. On a trusted home network, set Windows to Private and allow PlayBound through the host PC's firewall.";
    case "timeout":
      return "Connection to the host PC timed out.";
    default:
      return reason || "An unknown Remote Play error occurred.";
  }
}

/**
 * @param {object} deps
 * @param {ReturnType<typeof import("./moonlightClient").createMoonlightClient>} deps.moonlightClient
 * @param {(url: string) => WebSocket} [deps.createWebSocket] injected for testing
 */
function createClientSessionCoordinator(deps) {
  const moonlightClient = deps.moonlightClient;
  const createWebSocket =
    deps.createWebSocket ||
    ((url) => new WebSocket(url));

  let ws = null;
  let activeSession = null;
  let statusListeners = new Set();

  function notifyStatus(status, details = {}) {
    for (const listener of statusListeners) {
      try {
        listener(status, details);
      } catch {
        /* ignore listener errors */
      }
    }
  }

  function onStatusChange(listener) {
    statusListeners.add(listener);
    return () => statusListeners.delete(listener);
  }

  function getActiveSession() {
    return activeSession;
  }

  /**
   * Disconnects and ends any active streaming session cleanly.
   */
  let stopping = false;
  function stopSession() {
    if (stopping) return;
    stopping = true;
    try {
      if (moonlightClient && moonlightClient.isStreaming()) {
        moonlightClient.stopStream();
      }
      const currentWs = ws;
      ws = null;
      if (currentWs) {
        try {
          currentWs.close();
        } catch {
          /* ignore */
        }
      }
      if (activeSession) {
        activeSession = null;
        notifyStatus("ended");
      }
    } finally {
      stopping = false;
    }
  }

  /**
   * Starts a remote play session with the target host.
   *
   * @param {object} opts
   * @param {string} opts.hostAddress host IP or hostname
   * @param {number} opts.hostPort hostApi port
   * @param {string} opts.clientDeviceId
   * @param {string} opts.clientDeviceName
   * @param {string} opts.gameSlug
   * @param {string} [opts.editionSlug]
   * @param {string} [opts.resolution] default "1920x1080"
   * @param {number} [opts.fps] default 60
   * @param {number} [opts.timeoutMs]
   * @returns {Promise<{ ok: boolean, sessionId?: string, error?: string }>}
   */
  function startSession({
    hostAddress,
    hostPort,
    clientDeviceId,
    clientDeviceName,
    gameSlug,
    editionSlug = null,
    resolution = "1920x1080",
    fps = 60,
    timeoutMs = DEFAULT_CONNECT_TIMEOUT_MS,
  }) {
    if (activeSession) {
      return Promise.resolve({ ok: false, error: "A remote play session is already active." });
    }

    notifyStatus("connecting", { hostAddress, gameSlug });

    return new Promise((resolve) => {
      let resolved = false;
      const url = `ws://${hostAddress}:${hostPort}`;
      let socket = null;

      const finish = (result) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutTimer);
        if (!result.ok) {
          stopSession();
          notifyStatus("error", { error: result.error });
        }
        resolve(result);
      };

      const timeoutTimer = setTimeout(() => {
        finish({ ok: false, error: translateError("timeout") });
      }, timeoutMs);

      try {
        socket = createWebSocket(url);
      } catch (err) {
        finish({ ok: false, error: translateError("connection-failed") });
        return;
      }

      ws = socket;

      function send(msg) {
        try {
          socket.send(JSON.stringify(msg));
        } catch {
          finish({ ok: false, error: translateError("connection-failed") });
        }
      }

      function requestLaunch() {
        notifyStatus("starting-game", { hostAddress, gameSlug });
        send({
          type: "session-request",
          deviceId: clientDeviceId,
          gameSlug,
          editionSlug,
        });
      }

      socket.onopen = () => {
        notifyStatus("authenticating", { hostAddress });
        // Attempt pairing first in case host hasn't paired this device yet.
        send({
          type: "pair",
          deviceId: clientDeviceId,
          name: clientDeviceName,
        });
      };

      socket.onerror = () => {
        finish({ ok: false, error: translateError("connection-failed") });
      };

      socket.onclose = () => {
        if (!resolved) {
          finish({ ok: false, error: translateError("connection-failed") });
        } else if (activeSession) {
          stopSession();
        }
      };

      socket.onmessage = (event) => {
        let msg;
        try {
          msg = typeof event.data === "string" ? JSON.parse(event.data) : JSON.parse(event.data.toString("utf8"));
        } catch {
          return;
        }

        if (!msg || typeof msg !== "object") return;

        if (msg.type === "pair-result") {
          if (!msg.allowed) {
            finish({ ok: false, error: translateError("not-trusted") });
            return;
          }
          requestLaunch();
          return;
        }

        if (msg.type === "error") {
          finish({ ok: false, error: translateError(msg.reason) });
          return;
        }

        if (msg.type === "session-ready") {
          const streamHost = msg.host || hostAddress;
          const appName = msg.appName || gameSlug;

          notifyStatus("streaming", {
            sessionId: msg.sessionId,
            host: streamHost,
            port: msg.port,
            appName,
          });

          const streamResult = moonlightClient.startStream({
            host: streamHost,
            appName,
            resolution,
            fps,
            onExit: () => {
              if (activeSession) {
                stopSession();
              }
            },
          });

          if (!streamResult.ok) {
            finish({ ok: false, error: streamResult.reason || "Failed to start streaming client." });
            return;
          }

          activeSession = {
            sessionId: msg.sessionId,
            hostAddress: streamHost,
            hostPort,
            gameSlug,
            editionSlug,
            startedAt: Date.now(),
          };

          finish({ ok: true, sessionId: msg.sessionId });
          return;
        }

        if (msg.type === "session-ended") {
          // Unprompted notification from the host when the game process exited.
          stopSession();
        }
      };
    });
  }

  return {
    startSession,
    stopSession,
    getActiveSession,
    onStatusChange,
    translateError,
  };
}

module.exports = {
  createClientSessionCoordinator,
  translateError,
};
