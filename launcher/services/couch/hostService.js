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
 * @param {(slot: number, state: object) => void} [deps.onSlotFrame] Fired
 *   with every successfully-bound input frame, for every slot, before it is
 *   applied to that slot's ViGEm handle. This module stays agnostic about
 *   what a caller does with it — main.js uses it to also feed PlayBound
 *   Controls' Input Engine for slot 0 during a solo phone session, but
 *   hostService.js has no opinion about that.
 */
function createHostService(deps) {
  const getApiBase = deps.getApiBase;
  const broadcast = deps.broadcast || (() => {});
  const onSlotFrame = typeof deps.onSlotFrame === "function" ? deps.onSlotFrame : null;

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
  let metricsTimer = null;

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

  function getProvider() {
    if (!provider) {
      provider = createProvider();
      provider.setExitHandler?.(() => {
        // The sidecar lost its virtual pads. Recreate each slot on its next
        // input packet instead of continuing to write through stale handles.
        handles.clear();
      });
    }
    return provider;
  }

  async function ensureProvider() {
    return getProvider().probe();
  }

  const pendingSlots = new Map();
  let refreshSnapshotPending = false;

  async function ensureSlot(slot) {
    if (handles.has(slot)) return handles.get(slot);
    if (pendingSlots.has(slot)) return pendingSlots.get(slot);
    const p = (async () => {
      getProvider();
      try {
        const handle = await provider.createController(slot);
        handles.set(slot, handle);
        console.log(`[couch] ViGEm virtual controller created for slot ${slot}`);
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
      } finally {
        pendingSlots.delete(slot);
      }
    })();
    pendingSlots.set(slot, p);
    return p;
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
   * Hot path is sync when the ViGEm slot is already warm (hello / prewarm).
   */
  function applyInput(packet, meta = {}) {
    const parsed = parseInputPacketV1(packet);
    if (!parsed) return false;
    const boundSlot = Number.isInteger(meta.playerSlot) ? meta.playerSlot : null;
    if (boundSlot == null) return false;
    const bound = bindInputToSlot(parsed, boundSlot);
    if (!bound) return false;
    if (onSlotFrame) {
      try {
        onSlotFrame(bound.p, bound);
      } catch (err) {
        // A hook failure must not break the actual couch input path.
      }
    }
    const existing = handles.get(bound.p);
    if (existing) {
      existing.applyState(bound);
      if (meta.controllerId) {
        metrics.recordPacket(meta.controllerId, {
          transport: meta.transport || "unknown",
          seq: bound.seq,
          captureToHostMs: typeof meta.rttMs === "number" ? meta.rttMs : undefined,
        });
      }
      return true;
    }
    // First packet before hello finished warming — create async, don't block IPC.
    void ensureSlot(bound.p).then((handle) => {
      handle.applyState(bound);
      if (meta.controllerId) {
        metrics.recordPacket(meta.controllerId, {
          transport: meta.transport || "unknown",
          seq: bound.seq,
          captureToHostMs: typeof meta.rttMs === "number" ? meta.rttMs : undefined,
        });
      }
    });
    return true;
  }

  /** Renderer → main input path (ipcMain.on). No promise / no reply. */
  function applyInputFast(payload) {
    if (!payload || payload.type !== "input" || !payload.packet) return;
    let client = clients.get(payload.controllerId);
    if (!client) {
      const row = approvedControllers().find((c) => c.controllerId === payload.controllerId);
      if (row && row.status === "approved" && Number.isInteger(row.playerSlot)) {
        client = {
          playerSlot: row.playerSlot,
          sessionToken: payload.packet.sessionToken || "",
          transport: "webrtc",
        };
        clients.set(payload.controllerId, client);
        void ensureSlot(row.playerSlot);
      }
    }
    if (!client) {
      if (!refreshSnapshotPending) {
        refreshSnapshotPending = true;
        void refreshSnapshot()
          .then((snap) => {
            const list = snap?.controllers || approvedControllers();
            const r = list.find((c) => c.controllerId === payload.controllerId);
            if (r && r.status === "approved" && Number.isInteger(r.playerSlot)) {
              const cl = {
                playerSlot: r.playerSlot,
                sessionToken: payload.packet.sessionToken || "",
                transport: "webrtc",
              };
              clients.set(payload.controllerId, cl);
              void ensureSlot(r.playerSlot);
            }
          })
          .finally(() => {
            refreshSnapshotPending = false;
          });
      }
      return;
    }
    applyInput(payload.packet, {
      controllerId: payload.controllerId,
      playerSlot: client.playerSlot,
      transport: "webrtc",
      rttMs: payload.rttMs,
    });
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
        console.warn("[couch] controller auth failed:", msg.controllerId, result.reason);
        ctx.close?.();
        return;
      }
      console.log(
        "[couch] controller authenticated:",
        result.controllerId,
        "slot:",
        result.playerSlot,
        "transport:",
        ctx.transport || "websocket"
      );
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
      // Warm ViGEm before the first pad frames so applyInput stays sync.
      if (Number.isInteger(result.playerSlot)) {
        void ensureSlot(result.playerSlot);
      }
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
    const probe = await getProvider().probe();

    // When the host physical pad owns OpenBOR P1, remotes start at ViGEm slot 1.
    const reserveHostSlot = Boolean(opts.reserveHostSlot);
    const prewarmSlot = reserveHostSlot ? 1 : 0;
    try {
      await ensureSlot(prewarmSlot);
    } catch (err) {
      console.warn(`[couch] prewarm slot ${prewarmSlot} failed:`, err?.message || err);
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
        reserveHostSlot,
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
      reserveHostSlot,
      // Set only by a caller that minted this session purely to plumb one
      // phone's controller for single-player (see startCouchSessionQuiet's
      // one solo call site) — never by the real couch-party UI flow. Lets
      // main.js tell "one phone, no party" apart from "a real party" so
      // PlayBound Controls can activate for the former without ever
      // running during actual multiplayer couch co-op.
      solo: Boolean(opts.solo),
      // Set only by PlayBound Remote Play (main.js's remote-play-request
      // handling) — never by the real couch-party UI flow or the solo
      // phone-controller path above. Lets main.js end this specific
      // session on game exit without changing exit behavior for a real
      // party or a solo phone-controller session, both of which stay open
      // after exit exactly as they do today.
      remotePlay: Boolean(opts.remotePlay),
      streamingMetricsEnabled: Boolean(data.streamingMetricsEnabled),
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
      })
        .then(async (r) => {
          if (!r.ok) return;
          const snap = await r.json().catch(() => null);
          if (snap && typeof snap.streamingMetricsEnabled === "boolean") {
            session.streamingMetricsEnabled = snap.streamingMetricsEnabled;
          }
        })
        .catch(() => {});
    }, 20_000);

    pollTimer = setInterval(() => {
      void refreshSnapshot();
    }, 2000);

    metricsTimer = setInterval(() => {
      void uploadMetricsIfEnabled();
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
      const snap = await res.json();
      session.snapshot = snap;
      if (typeof snap.streamingMetricsEnabled === "boolean") {
        session.streamingMetricsEnabled = snap.streamingMetricsEnabled;
      }
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

  async function uploadMetricsIfEnabled() {
    if (!session?.streamingMetricsEnabled || !session.hostToken) return;
    const snap = metrics.snapshot();
    const byId = new Map(snap.map((m) => [m.controllerId, m]));
    const controllers = [...clients.entries()].map(([controllerId, c]) => {
      const m = byId.get(controllerId) || {};
      return {
        controllerId,
        playerSlot: c.playerSlot,
        status: "approved",
        transport: c.transport || m.transport || "unknown",
        pingMs: m.pingMs ?? null,
        jitterMs: m.jitterMs ?? null,
        hz: m.hz ?? 0,
        packets: m.packets ?? 0,
        packetLoss: m.packetLoss ?? 0,
      };
    });
    try {
      await fetch(`${getApiBase()}/api/couch/sessions/${session.sessionId}/metrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostToken: session.hostToken,
          controllers,
          collectedAt: new Date().toISOString(),
        }),
      });
    } catch {
      /* ignore */
    }
  }

  async function stopSession() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (pollTimer) clearInterval(pollTimer);
    if (metricsTimer) clearInterval(metricsTimer);
    heartbeatTimer = null;
    pollTimer = null;
    metricsTimer = null;

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
      // Prefer couch-renderer-input (send); keep this for older preload paths.
      applyInputFast(payload);
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
    getProvider();
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
    applyInputFast,
    warmControllerSlot,
  };
}

module.exports = { createHostService };
