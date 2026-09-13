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
const { authenticateCouchClient, bindInputToSlot } = require("./inputAuth");

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
  /** controllerId -> Set of socket/context objects that can be closed on kick */
  const socketsByController = new Map();

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

  function approvedControllers() {
    return session?.snapshot?.controllers || [];
  }

  function rememberSocket(controllerId, ctx) {
    if (!controllerId || !ctx) return;
    let set = socketsByController.get(controllerId);
    if (!set) {
      set = new Set();
      socketsByController.set(controllerId, set);
    }
    set.add(ctx);
  }

  function forgetSocket(controllerId, ctx) {
    const set = socketsByController.get(controllerId);
    if (!set) return;
    set.delete(ctx);
    if (set.size === 0) socketsByController.delete(controllerId);
  }

  function closeControllerTransport(controllerId) {
    const set = socketsByController.get(controllerId);
    if (set) {
      for (const ctx of set) {
        try {
          ctx.close?.();
        } catch {
          /* ignore */
        }
      }
      socketsByController.delete(controllerId);
    }
    const client = clients.get(controllerId);
    if (client && client.playerSlot != null) releaseSlot(client.playerSlot);
    clients.delete(controllerId);
  }

  /**
   * Apply an input packet from any transport.
   * Slot comes from the authenticated binding, never from the packet.
   */
  async function applyInput(packet, meta = {}) {
    const parsed = parseInputPacketV1(packet);
    if (!parsed) return false;
    const boundSlot = Number.isInteger(meta.playerSlot) ? meta.playerSlot : null;
    if (boundSlot == null) return false;
    const bound = bindInputToSlot(parsed, boundSlot);
    if (!bound) return false;
    const handle = await ensureSlot(bound.p);
    handle.applyState(bound);
    if (meta.controllerId) {
      metrics.recordPacket(meta.controllerId, {
        transport: meta.transport || "unknown",
        seq: bound.seq,
        captureToHostMs: typeof meta.rttMs === "number" ? meta.rttMs : undefined,
      });
    }
    return true;
  }

  function performanceNowFallback() {
    return Date.now();
  }

  async function handleControlMessage(msg, ctx) {
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "auth" || msg.type === "hello") {
      const requireWsToken = (ctx.transport || "websocket") === "websocket";
      const attempt = () =>
        authenticateCouchClient(msg, {
          expectedWsToken: wsToken,
          requireWsToken,
          controllers: approvedControllers(),
        });
      let result = attempt();
      if (!result.ok && (result.reason === "not-approved" || result.reason === "no-slot")) {
        await refreshSnapshot();
        result = attempt();
      }
      if (!result.ok) {
        ctx.close?.();
        return;
      }
      if (ctx.auth?.controllerId && ctx.auth.controllerId !== result.controllerId) {
        forgetSocket(ctx.auth.controllerId, ctx);
      }
      ctx.auth = {
        controllerId: result.controllerId,
        playerSlot: result.playerSlot,
        sessionToken: result.sessionToken,
      };
      rememberSocket(result.controllerId, ctx);
      clients.set(result.controllerId, {
        playerSlot: result.playerSlot,
        sessionToken: result.sessionToken,
        transport: ctx.transport || "websocket",
      });
      metrics.setTransport(result.controllerId, ctx.transport || "websocket");
      ctx.send?.(
        JSON.stringify({
          type: "welcome",
          playerSlot: result.playerSlot,
          sessionToken: result.sessionToken,
        })
      );
      emitState();
      return;
    }
    if (!ctx.auth) {
      ctx.close?.();
      return;
    }
    if (msg.type === "ping") {
      ctx.send?.(JSON.stringify({ type: "pong", t: msg.t }));
    }
  }

  async function startWsServer() {
    if (wsServer) return { port: wsPort, token: wsToken };
    wsToken = require("crypto").randomBytes(16).toString("hex");
    wsServer = createPlainWebSocketServer(
      (socket, text) => {
        let msg;
        try {
          msg = JSON.parse(text);
        } catch {
          return;
        }
        const ctx =
          socket.couchCtx ||
          (socket.couchCtx = {
            auth: null,
            transport: "websocket",
            send: (s) => socket.send(s),
            close: () => socket.close(),
          });
        if (msg && msg.type) {
          void handleControlMessage(msg, ctx);
          return;
        }
        if (msg && msg.v === 1) {
          if (!ctx.auth) {
            ctx.close();
            return;
          }
          void applyInput(msg, {
            controllerId: ctx.auth.controllerId,
            playerSlot: ctx.auth.playerSlot,
            transport: "websocket",
          });
        }
      },
      {
        verifyUpgrade(req) {
          try {
            const url = new URL(req.url || "/", "http://localhost");
            const token = url.searchParams.get("token");
            return !token || token === wsToken;
          } catch {
            return false;
          }
        },
      }
    );
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
          "Could not enable controllers. Try again and allow the Windows prompt."
      );
    }

    // Fresh provider after possible driver install.
    provider = createProvider();
    const probe = await provider.probe();

    // Phone-as-controller games (Hurrican, etc.) enumerate pads at startup.
    // Create player-one's virtual XInput device now so in-game setup sees a pad
    // even before the phone connects and sends its first input packet.
    try {
      await ensureSlot(0);
    } catch (err) {
      console.warn("[couch] prewarm slot 0 failed:", err?.message || err);
    }

    const isParty = Boolean(opts?.hostLabel?.includes("Party") || opts?.party);
    notify(isParty ? "Starting online multiplayer…" : "Starting controllers…");
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
          "Controllers are still setting up. Try again in a moment.",
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
      closeControllerTransport(controllerId);
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
    for (const set of socketsByController.values()) {
      for (const ctx of set) {
        try {
          ctx.close?.();
        } catch {
          /* ignore */
        }
      }
    }
    socketsByController.clear();
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
      const client = clients.get(payload.controllerId);
      if (!client) return { ok: false };
      await applyInput(payload.packet, {
        controllerId: payload.controllerId,
        playerSlot: client.playerSlot,
        transport: "webrtc",
        rttMs: payload.rttMs,
      });
      return { ok: true };
    }
    if (payload.type === "control" && payload.message) {
      const ctx = {
        auth: clients.has(payload.controllerId)
          ? {
              controllerId: payload.controllerId,
              playerSlot: clients.get(payload.controllerId).playerSlot,
              sessionToken: clients.get(payload.controllerId).sessionToken,
            }
          : null,
        transport: "webrtc",
        send: (s) => {
          broadcast("couch-peer-send", {
            controllerId: payload.controllerId,
            data: s,
          });
        },
        close: () => {
          broadcast("couch-peer-close", { controllerId: payload.controllerId });
        },
      };
      await handleControlMessage(payload.message, ctx);
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

  /** Exposed for Play — warm a ViGEm slot when couch is already live. */
  async function warmControllerSlot(slot = 0) {
    const ensured = await ensureVigem(() => {});
    if (!ensured.ok) return ensured;
    if (!provider) provider = createProvider();
    await ensureSlot(slot);
    return { ok: true };
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
    warmControllerSlot,
  };
}

module.exports = { createHostService };
