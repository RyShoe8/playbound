/**
 * Couch Mode host input service.
 * - Creates cloud session + publishes LAN WS endpoints
 * - Accepts WebSocket input fallback from phones
 * - Applies packets to VirtualControllerProvider
 * WebRTC DataChannels are answered in the renderer and forwarded via IPC.
 */

"use strict";

const os = require("os");
const { parseInputPacketV1, emptyPadState, COUCH_MAX_PLAYERS } = require("./protocol");
const { createProvider } = require("./VirtualControllerProvider");
const { createMetrics } = require("./metrics");
const { createPlainWebSocketServer } = require("./wsServer");
const { ensureVigem } = require("./ensureVigem");

/**
 * @param {object} deps
 * @param {() => string} deps.getApiBase
 * @param {(channel: string, payload: object) => void} [deps.broadcast]
 */
function createHostService(deps) {
  const getApiBase = deps.getApiBase;
  const broadcast = deps.broadcast || (() => {});

  let provider = null;
  /** @type {Map<number, object>} slot -> handle */
  const handles = new Map();
  const metrics = createMetrics();

  let session = null; // { sessionId, joinCode, hostToken, joinUrl, ... }
  let wsServer = null;
  let wsPort = 0;
  let wsToken = "";
  let heartbeatTimer = null;
  let pollTimer = null;

  /** controllerId -> { playerSlot, sessionToken, transport } */
  const clients = new Map();

  function lanAddresses() {
    const nets = os.networkInterfaces();
    const out = [];
    for (const list of Object.values(nets || {})) {
      for (const n of list || []) {
        if (n.family === "IPv4" && !n.internal) out.push(n.address);
      }
    }
    return out;
  }

  async function ensureProvider() {
    if (!provider) provider = createProvider();
    return provider.probe();
  }

  async function ensureSlot(slot) {
    if (handles.has(slot)) return handles.get(slot);
    if (!provider) provider = createProvider();
    try {
      const handle = await provider.createController(slot);
      handles.set(slot, handle);
      return handle;
    } catch (err) {
      console.warn("[couch] virtual controller create failed:", err?.message || err);
      // Soft handle so transport/debug still work without ViGEm.
      const soft = {
        slot,
        remove() {
          handles.delete(slot);
        },
        applyState() {},
      };
      handles.set(slot, soft);
      return soft;
    }
  }

  function releaseSlot(slot) {
    const h = handles.get(slot);
    if (h) {
      try {
        h.applyState(emptyPadState(slot));
      } catch {
        /* ignore */
      }
      try {
        h.remove();
      } catch {
        /* ignore */
      }
      handles.delete(slot);
    }
  }

  /**
   * Apply an input packet from any transport.
   */
  async function applyInput(packet, meta = {}) {
    const parsed = parseInputPacketV1(packet);
    if (!parsed) return false;
    const handle = await ensureSlot(parsed.p);
    const tHost = Date.now();
    handle.applyState(parsed);
    if (meta.controllerId) {
      const captureToHostMs =
        typeof packet.t === "number" ? Math.max(0, performanceNowFallback() - packet.t) : null;
      // packet.t is performance.now on phone — not comparable across devices.
      // Use host receive pacing instead for debug; optional RTT from ping.
      metrics.recordPacket(meta.controllerId, {
        transport: meta.transport || "unknown",
        seq: parsed.seq,
        captureToHostMs: typeof meta.rttMs === "number" ? meta.rttMs : undefined,
      });
      void tHost;
      void captureToHostMs;
    }
    return true;
  }

  function performanceNowFallback() {
    return Date.now();
  }

  function handleControlMessage(msg, ctx) {
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "auth") {
      if (msg.wsToken !== wsToken) {
        ctx.close?.();
        return;
      }
      clients.set(msg.controllerId, {
        playerSlot: msg.playerSlot,
        sessionToken: msg.sessionToken,
        transport: "websocket",
      });
      metrics.setTransport(msg.controllerId, "websocket");
      ctx.send?.(JSON.stringify({ type: "welcome", playerSlot: msg.playerSlot }));
      emitState();
      return;
    }
    if (msg.type === "hello") {
      clients.set(msg.controllerId, {
        playerSlot: msg.playerSlot,
        sessionToken: msg.sessionToken,
        transport: ctx.transport || "websocket",
      });
      metrics.setTransport(msg.controllerId, ctx.transport || "websocket");
      ctx.send?.(
        JSON.stringify({
          type: "welcome",
          playerSlot: msg.playerSlot,
          sessionToken: msg.sessionToken,
        })
      );
      emitState();
      return;
    }
    if (msg.type === "ping") {
      ctx.send?.(JSON.stringify({ type: "pong", t: msg.t }));
      return;
    }
  }

  async function startWsServer() {
    if (wsServer) return { port: wsPort, token: wsToken };
    wsToken = require("crypto").randomBytes(16).toString("hex");
    wsServer = createPlainWebSocketServer((socket, text) => {
      let msg;
      try {
        msg = JSON.parse(text);
      } catch {
        return;
      }
      const ctx = {
        transport: "websocket",
        send: (s) => socket.send(s),
        close: () => socket.close(),
      };
      if (msg && msg.type) {
        handleControlMessage(msg, ctx);
        return;
      }
      if (msg && msg.v === 1) {
        const controllerId = [...clients.entries()].find(
          ([, c]) => c.playerSlot === msg.p
        )?.[0];
        void applyInput(msg, { controllerId, transport: "websocket" });
      }
    });
    wsPort = await wsServer.listen(0);
    return { port: wsPort, token: wsToken };
  }

  async function publishEndpoints() {
    if (!session) return;
    const { port, token } = await startWsServer();
    const urls = lanAddresses().map((ip) => `ws://${ip}:${port}`);
    // Also include localhost for same-machine testing
    urls.push(`ws://127.0.0.1:${port}`);
    const res = await fetch(`${getApiBase()}/api/couch/sessions/${session.sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hostToken: session.hostToken,
        hostEndpoints: {
          wsUrls: urls,
          wsToken: token,
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
          ],
        },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to publish couch endpoints: ${res.status} ${text}`);
    }
  }

  async function createSession(opts = {}) {
    await stopSession();

    const notify = (message) => {
      broadcast("couch-status", { message: String(message || "") });
    };

    const ensured = await ensureVigem(notify);
    if (!ensured.ok) {
      throw new Error(
        ensured.reason ||
          "Could not enable controllers. Try Start Couch Mode again and allow the Windows prompt."
      );
    }

    // Fresh provider after possible driver install.
    provider = createProvider();
    const probe = await provider.probe();

    notify("Starting Couch Mode…");
    const res = await fetch(`${getApiBase()}/api/couch/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hostLabel: opts.hostLabel || "PlayBound",
        maxPlayers: opts.maxPlayers || COUCH_MAX_PLAYERS,
        autoApprove: opts.autoApprove !== false,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to create couch session");

    session = {
      sessionId: data.sessionId,
      joinCode: data.joinCode,
      hostToken: data.hostToken,
      joinUrl: data.joinUrl,
      joinPath: data.joinPath,
      snapshot: data.snapshot,
      driverOk: probe.ok,
      driverReason: probe.ok
        ? null
        : probe.reason ||
          "Controllers are still setting up. Try Start Couch Mode again.",
      driverInstalledNow: Boolean(ensured.installed),
    };

    await publishEndpoints();

    heartbeatTimer = setInterval(() => {
      if (!session) return;
      fetch(`${getApiBase()}/api/couch/sessions/${session.sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostToken: session.hostToken }),
      }).catch(() => {});
    }, 20_000);

    pollTimer = setInterval(() => {
      void refreshSnapshot();
    }, 2000);

    emitState();
    broadcast("couch-status", { message: "" });
    return getState();
  }

  async function refreshSnapshot() {
    if (!session) return null;
    try {
      const res = await fetch(
        `${getApiBase()}/api/couch/sessions/${session.sessionId}?hostToken=${encodeURIComponent(session.hostToken)}`
      );
      if (!res.ok) return null;
      session.snapshot = await res.json();
      emitState();
      return session.snapshot;
    } catch {
      return null;
    }
  }

  async function controllerAction(action, controllerId, playerSlot) {
    if (!session) throw new Error("No active couch session");
    const res = await fetch(
      `${getApiBase()}/api/couch/sessions/${session.sessionId}/controllers`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostToken: session.hostToken,
          action,
          controllerId,
          playerSlot,
        }),
      }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Controller action failed");
    session.snapshot = data.snapshot || session.snapshot;
    if (action === "kick" || action === "reject") {
      const slot = [...handles.keys()].find((s) => {
        /* best-effort: release if we know mapping */
        return true;
      });
      void slot;
    }
    emitState();
    return getState();
  }

  async function stopSession() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (pollTimer) clearInterval(pollTimer);
    heartbeatTimer = null;
    pollTimer = null;

    if (session) {
      try {
        await fetch(`${getApiBase()}/api/couch/sessions/${session.sessionId}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hostToken: session.hostToken }),
        });
      } catch {
        /* ignore */
      }
    }
    session = null;
    clients.clear();
    metrics.clear();

    for (const slot of [...handles.keys()]) releaseSlot(slot);

    if (wsServer) {
      try {
        await wsServer.close();
      } catch {
        /* ignore */
      }
      wsServer = null;
    }
    wsPort = 0;
    wsToken = "";

    if (provider) {
      try {
        provider.dispose();
      } catch {
        /* ignore */
      }
      provider = null;
    }
    emitState();
  }

  /**
   * Called from renderer when WebRTC delivers a packet or control message.
   */
  async function onRendererMessage(payload) {
    if (!payload) return { ok: false };
    if (payload.type === "input" && payload.packet) {
      await applyInput(payload.packet, {
        controllerId: payload.controllerId,
        transport: "webrtc",
        rttMs: payload.rttMs,
      });
      return { ok: true };
    }
    if (payload.type === "control" && payload.message) {
      handleControlMessage(payload.message, {
        transport: "webrtc",
        send: (s) => {
          broadcast("couch-peer-send", {
            controllerId: payload.controllerId,
            data: s,
          });
        },
      });
      metrics.setTransport(payload.controllerId, "webrtc");
      return { ok: true };
    }
    if (payload.type === "transport") {
      metrics.setTransport(payload.controllerId, payload.transport || "webrtc");
      return { ok: true };
    }
    return { ok: false };
  }

  function getState() {
    return {
      active: Boolean(session),
      session,
      metrics: metrics.snapshot(),
      slots: [...handles.keys()],
      clients: [...clients.entries()].map(([controllerId, c]) => ({
        controllerId,
        ...c,
      })),
    };
  }

  function emitState() {
    broadcast("couch-state", getState());
  }

  async function probeDriver() {
    return ensureVigem(() => {});
  }

  return {
    createSession,
    stopSession,
    refreshSnapshot,
    controllerAction,
    onRendererMessage,
    getState,
    probeDriver,
    applyInput,
  };
}

module.exports = { createHostService };
