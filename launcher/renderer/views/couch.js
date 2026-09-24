/**
 * Couch Mode host UI + WebRTC answerer.
 * Phones send offers via cloud signaling; we answer and forward input to main.
 * The host bridge can run in the background (Play → phone controller) without
 * opening this view.
 */

import { escapeHtml, setStatus, views, api } from "../shared.js";
import { CADENCE } from "../cadence.js";
import { ensureHostDisplayStream, stopHostDisplayStream, setCropRect, markStreamStale } from "../hostDisplayStream.js";
import { disableGamepadBridge } from "../gamepadBridge.js";

let wired = false;
let signalSince = 0;
let signalPollInFlight = false;
const seenSignalIds = new Set();
let pollTimer = null;
/** @type {Map<string, RTCPeerConnection>} */
const peers = new Map();
/** @type {Map<string, RTCDataChannel>} */
const channels = new Map();
/** @type {Map<string, Array<{ candidate: RTCIceCandidateInit | null, complete: boolean }>>} */
const pendingRemoteIce = new Map();
const reportedOps = new Set();
function reportOps(status, fields) {
  const key = `${lastState?.session?.sessionId || "none"}:${status}:${fields.code || fields.phase}`;
  if (reportedOps.has(key)) return;
  reportedOps.add(key);
  if (reportedOps.size > 200) reportedOps.clear();
  void pb().couchReportOps?.(status, fields)?.catch(() => {});
}
let lastState = null;
let stateRevision = 0;

function pb() {
  return window.playbound;
}

function couchViewVisible() {
  return Boolean(views.couch?.classList.contains("active"));
}

export function renderCouchView() {
  ensureWired();
  const root = views.couch;
  if (!root) return;
  void refresh();
}

api.renderCouchView = renderCouchView;

/** Keep WebRTC answering alive while a session is active (any launcher view). */
export function ensureCouchBackground() {
  ensureWired();
  const revisionBeforeRefresh = stateRevision;
  void (async () => {
    const state = await pb().couchState();
    if (stateRevision !== revisionBeforeRefresh) return;
    lastState = state;
    if (state?.active) startSignalPoll();
    else stopSignalPoll();
  })();
}

/** Start a phone-controller session without painting the Couch page. */
export async function startCouchSessionQuiet(opts = {}) {
  ensureWired();
  // Never leave the DualSense→ViGEm mirror running into Connect — it drives
  // OpenBOR P1 and P2 from the same host stick.
  try {
    await disableGamepadBridge();
  } catch {
    /* ignore */
  }
  const existing = await pb().couchState();
  if (existing?.active) {
    lastState = existing;
    startSignalPoll();
    return existing;
  }
  let reserveHostSlot = opts.reserveHostSlot;
  if (reserveHostSlot == null) {
    try {
      const pads = navigator.getGamepads?.() || [];
      reserveHostSlot = pads.some((p) => p && p.connected);
    } catch {
      reserveHostSlot = false;
    }
  }
  const res = await pb().couchStart({
    hostLabel: opts.hostLabel || "PlayBound",
    maxPlayers: opts.maxPlayers,
    reserveHostSlot: Boolean(reserveHostSlot),
    // Passed through to hostService's session record so PlayBound Controls
    // can tell "one phone, no party" apart from a real couch party — see
    // the one caller of this function that actually sets it.
    solo: Boolean(opts.solo),
  });
  if (!res?.ok) {
    setStatus(res?.error || "Failed to start phone controller", true);
    return null;
  }
  lastState = res.state;
  startSignalPoll();
  return res.state;
}

function ensureWired() {
  if (wired) return;
  wired = true;

  pb().onCouchState?.((state) => {
    stateRevision += 1;
    lastState = state;
    if (state?.active) startSignalPoll();
    else { cleanupPeerState(); reportedOps.clear(); }
    if (couchViewVisible()) paint(state);
  });

  pb().onCouchStatus?.((payload) => {
    const msg = payload?.message;
    if (!msg) return;
    console.log("[couch-status]", msg);
    if (couchViewVisible()) setStatus(msg);
  });

  pb().onCouchPeerSend?.((msg) => {
    const ch = channels.get(msg.controllerId);
    if (ch && ch.readyState === "open") {
      try {
        ch.send(msg.data);
      } catch {
        /* ignore */
      }
    }
  });

  pb().onCouchCropRect?.((rect) => {
    // This push fires exactly once, right when main.js's maximize/Alt+Enter/
    // measure sequence finishes for THIS game launch — the one moment a
    // display-resolution switch (see markStreamStale's docstring) is known
    // to have already had time to happen. A capture that started before
    // this point may be stale; discard it so the next one starts fresh,
    // after the mode switch, not racing it. Deliberately NOT done in
    // applyCropRect's other call site (a newly-connecting peer fetching the
    // already-known rect) — that's just re-syncing state, nothing changed.
    markStreamStale();
    applyCropRect(rect);
    // Usually a no-op: pre-answer capture attempts (couch.js's own retry
    // loop) pick up the now-stale flag on their own before anyone has
    // connected. This only matters for the rarer case where a peer's
    // connection already succeeded (with a possibly-stale, pre-mode-switch
    // capture) before this signal arrived — pushHostDisplayToPeers no-ops
    // when there are no peers yet, per its own guard.
    void pushHostDisplayToPeers();
  });
}

/**
 * Screen capture always grabs the whole monitor (Chromium's per-window
 * capture has a real cropping bug — see setDisplayMediaRequestHandler in
 * main.js), so when a game doesn't fill the monitor itself, main.js works
 * out the game's actual on-screen rectangle and hands it here. `rect` is
 * null when the game already fills the frame (nothing to crop) or hasn't
 * been measured yet.
 *
 * The crop is applied HOST-SIDE, baked into the canvas downscale pipeline
 * (hostDisplayStream.js) before the frame is ever encoded — cheaper for
 * every viewer (bitrate scales with the game's actual size, not the whole
 * monitor) than sending the full frame and cropping it client-side per
 * peer. Nothing is sent to peers here; they just receive an already-correct
 * stream.
 */
function applyCropRect(rect) {
  setCropRect(rect);
}

async function refresh() {
  const state = await pb().couchState();
  lastState = state;
  paint(state);
  if (state?.active) startSignalPoll();
  else stopSignalPoll();
}

/*
 * Signalling is bursty: a flurry of offer/ice while a phone connects, then
 * silence for the rest of the session. Polling flat out at the active rate
 * throughout meant ~120 requests a minute to be told nothing had happened.
 *
 * So: poll fast while messages are arriving, decay to the idle rate after
 * enough consecutive empty replies, and snap straight back the moment
 * anything shows up. The idle rate is the ceiling on how long a SECOND phone
 * waits to be noticed mid-session, which is why it stays low rather than
 * decaying further — see cadence.json.
 */
const SIGNAL_ACTIVE_MS = CADENCE.couchSignalActiveMs;
const SIGNAL_IDLE_MS = CADENCE.couchSignalIdleMs;
const SIGNAL_IDLE_AFTER = CADENCE.couchSignalIdleAfterEmptyPolls;

let emptySignalPolls = 0;
let signalPollMs = SIGNAL_ACTIVE_MS;

function scheduleSignalPoll(intervalMs) {
  if (pollTimer) window.clearInterval(pollTimer);
  signalPollMs = intervalMs;
  pollTimer = window.setInterval(() => {
    void pollSignals();
  }, intervalMs);
}

function startSignalPoll() {
  if (pollTimer) return;
  // A session always starts with a handshake pending, so begin at full rate.
  emptySignalPolls = 0;
  scheduleSignalPoll(SIGNAL_ACTIVE_MS);
  void pollSignals();
}

function stopSignalPoll() {
  if (pollTimer) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
  emptySignalPolls = 0;
  signalPollMs = SIGNAL_ACTIVE_MS;
}

async function addRemoteIceCandidate(pc, candidate, complete) {
  if (complete || candidate === null) {
    try {
      await pc.addIceCandidate(undefined);
    } catch {
      try {
        await pc.addIceCandidate({ candidate: "", sdpMid: "0", sdpMLineIndex: 0 });
      } catch {
        /* ignore */
      }
    }
    return;
  }
  if (!candidate) return;
  try {
    await pc.addIceCandidate(candidate);
  } catch {
    /* ignore trickle races */
  }
}

async function pollSignals() {
  if (signalPollInFlight) return;
  signalPollInFlight = true;
  try {
    const state = await pb().couchState?.().catch(() => null);
    if (state?.active) lastState = state;
    const session = lastState?.session;
    if (!session) return;
    // Concurrent signal posts can reach Mongo out of timestamp order. Replay
    // a short window and dedupe by ID instead of losing a late ICE candidate.
    const res = await pb().couchSignalPoll(Math.max(0, signalSince - 10_000));
    const messages = (res?.messages || []).filter((m) => !seenSignalIds.has(m.id));

    if (messages.length > 0) {
      // Something is happening — go back to full rate for the rest of it.
      emptySignalPolls = 0;
      if (signalPollMs !== SIGNAL_ACTIVE_MS) scheduleSignalPoll(SIGNAL_ACTIVE_MS);
    } else {
      emptySignalPolls += 1;
      if (emptySignalPolls >= SIGNAL_IDLE_AFTER && signalPollMs !== SIGNAL_IDLE_MS) {
        scheduleSignalPoll(SIGNAL_IDLE_MS);
      }
    }

    for (const m of messages) {
      seenSignalIds.add(m.id);
      if (seenSignalIds.size > 2048) {
        const oldest = seenSignalIds.values().next().value;
        if (oldest) seenSignalIds.delete(oldest);
      }
      signalSince = Math.max(signalSince, m.timestamp || 0);
      let payload;
      try {
        payload = JSON.parse(m.payload);
      } catch {
        continue;
      }
      if (payload.kind === "offer" && payload.from && payload.sdp) {
        try {
          await answerOffer(payload.from, payload.sdp, session);
        } catch (err) {
          reportOps("failed", { phase: "answer", code: "WEBRTC_ANSWER_FAILED", message: err?.message });
          throw err;
        }
      }
      if (payload.kind === "answer" && payload.from && payload.sdp) {
        const pc = peers.get(payload.from);
        if (pc && pc.signalingState === "have-local-offer") {
          try {
            await pc.setRemoteDescription(payload.sdp);
          } catch {
            /* ignore */
          }
        }
      }
      if (payload.kind === "ice" && payload.from) {
        const pc = peers.get(payload.from);
        if (pc?.remoteDescription) {
          await addRemoteIceCandidate(pc, payload.candidate, payload.complete);
        } else {
          const pending = pendingRemoteIce.get(payload.from) || [];
          pending.push({ candidate: payload.candidate, complete: Boolean(payload.complete) });
          pendingRemoteIce.set(payload.from, pending);
        }
      }
    }
  } catch (err) {
    console.warn("[couch] signal poll failed:", err?.message || err);
    reportOps("failed", { phase: "signaling", code: "SIGNAL_POLL_FAILED", message: err?.message });
  } finally {
    signalPollInFlight = false;
  }
}

async function attachDisplayTracks(pc) {
  try {
    const display = await ensureHostDisplayStream();
    if (!display) return false;
    const track = display.getVideoTracks()[0];
    // Only skip ended tracks — muted/live-but-pending still renegotiate.
    if (!track || track.readyState === "ended") return false;

    const transceivers = pc.getTransceivers ? pc.getTransceivers() : [];
    let videoTransceiver = transceivers.find(
      (t) =>
        t.receiver?.track?.kind === "video" ||
        t.sender?.track?.kind === "video" ||
        t.mid === "video"
    );
    // Guest offers recvonly video — reuse that transceiver as sendonly.
    if (!videoTransceiver) {
      videoTransceiver = transceivers.find(
        (t) => t.direction === "recvonly" || t.direction === "inactive"
      );
    }

    if (videoTransceiver) {
      try {
        videoTransceiver.direction = "sendonly";
      } catch {
        /* direction may already be sendrecv */
      }
      if (videoTransceiver.sender?.replaceTrack) {
        await videoTransceiver.sender.replaceTrack(track);
      }
    } else {
      const senders = pc.getSenders();
      const already = senders.some((s) => s.track && s.track.id === track.id);
      if (!already) pc.addTrack(track, display);
    }
    applyVideoEncodePrefs(pc);

    // Best-effort, and only when the client actually offered an audio
    // m-line (the full-window "Join online" popup does; a phone used as a
    // local controller deliberately does not — see ControllerClient.tsx).
    // No m-line means no transceiver to fill, and we don't fall back to
    // pc.addTrack() here: that would add a new m-line as the answerer,
    // which requires a fresh round of host-initiated renegotiation this
    // signaling path doesn't support.
    const audioTrack = display.getAudioTracks()[0];
    if (audioTrack && audioTrack.readyState !== "ended") {
      const audioTransceiver = transceivers.find(
        (t) =>
          t.receiver?.track?.kind === "audio" ||
          t.sender?.track?.kind === "audio" ||
          t.mid === "audio"
      );
      if (audioTransceiver) {
        try {
          audioTransceiver.direction = "sendonly";
        } catch {
          /* direction may already be sendrecv */
        }
        if (audioTransceiver.sender?.replaceTrack) {
          await audioTransceiver.sender.replaceTrack(audioTrack);
        }
      }
    }
    return true;
  } catch (err) {
    console.warn("[couch] could not attach display track:", err?.message || err);
    return false;
  }
}

/**
 * Prefer smooth game frames over still-image quality when the pipe is tight.
 * Caps bitrate so remote TURN guests do not stall on unbounded 1080p.
 */
function applyVideoEncodePrefs(pc) {
  if (!pc?.getSenders) return;
  for (const sender of pc.getSenders()) {
    if (!sender.track || sender.track.kind !== "video") continue;
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }
      for (const enc of params.encodings) {
        enc.maxBitrate = 6_000_000;
        enc.maxFramerate = 60;
        delete enc.scaleResolutionDownBy;
      }
      params.degradationPreference = "maintain-framerate";
      void sender.setParameters(params).catch(() => {});
    } catch {
      /* setParameters is best-effort across Chromium builds */
    }
  }
}

/**
 * Re-push host game view onto every live peer (e.g. capture started after Join).
 * Controllers stay on recvonly; we renegotiate so late capture still lands.
 *
 * Always replaceTrack on the existing video transceiver when possible — a bare
 * addTrack after the first answer often skips renegotiation when the track id
 * already matched a dead sender, leaving joiners on "Waiting for host game view".
 */
export async function pushHostDisplayToPeers() {
  const display = await ensureHostDisplayStream();
  if (!display || peers.size === 0) return false;
  let sentAny = false;
  for (const [controllerId, pc] of peers.entries()) {
    try {
      const attached = await attachDisplayTracks(pc);
      if (!attached) continue;
      /*
       * iceRestart: true works around a real Chromium/libwebrtc bug — an
       * answerer that later calls createOffer() to renegotiate (us, here)
       * can hit "Failed to set SSL role for the transport" without it,
       * because the DTLS role Chromium picked while answering doesn't
       * carry over to a plain re-offer. Forcing an ICE restart makes
       * Chromium regenerate the transport's role cleanly instead of trying
       * to reuse the old one. The client already handles a mid-session
       * offer generically (ControllerClient.tsx's payload.kind === "offer"
       * branch), ICE-restarted or not, so this needs no client-side change.
       */
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      await pb().couchSignalPost({
        recipientRole: "controller",
        senderPeerId: "host",
        payload: JSON.stringify({
          kind: "offer",
          sdp: offer,
          to: controllerId,
        }),
      });
      sentAny = true;
    } catch (err) {
      console.warn("[couch] renegotiate display failed:", err?.message || err);
      reportOps("failed", { phase: "renegotiation", code: "DISPLAY_RENEGOTIATION_FAILED", message: err?.message });
    }
  }
  return sentAny;
}

async function answerOffer(controllerId, remoteSdp, session) {
  let pc = peers.get(controllerId);
  if (pc) {
    try {
      pc.close();
    } catch {
      /* ignore */
    }
  }

  // Prefer platform-published ICE (STUN ± TURN from sessionIceServers). Fallback
  // public STUN list must stay aligned with platform/src/lib/realtime/iceServers.ts
  // defaultStunUrls() (non-VPS entries) — do not shrink this to Google-only.
  try {
    await pb().couchRefresh?.();
  } catch {
    /* ignore */
  }
  const fresh = await pb().couchState?.().catch(() => null);
  const snapSession = fresh?.session || session;
  const hostIce = snapSession?.snapshot?.hostEndpoints?.iceServers;
  const iceServers =
    Array.isArray(hostIce) && hostIce.length > 0
      ? hostIce
      : [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun2.l.google.com:19302" },
          { urls: "stun:stun.cloudflare.com:3478" },
          { urls: "stun:global.stun.twilio.com:3478" },
        ];
  pc = new RTCPeerConnection({ iceServers });
  peers.set(controllerId, pc);
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "connected") reportOps("connected", { phase: "webrtc", code: "PEER_CONNECTED", transport: "webrtc", connectionState: "connected" });
    if (pc.connectionState === "failed") reportOps("failed", { phase: "webrtc", code: "PEER_CONNECTION_FAILED", message: "Host peer connection failed", transport: "webrtc", connectionState: "failed", iceState: pc.iceConnectionState });
  };

  pc.ondatachannel = (ev) => {
    const dc = ev.channel;
    channels.set(controllerId, dc);
    dc.onopen = () => {
      void pb().couchRendererMessage({
        type: "transport",
        controllerId,
        transport: "webrtc",
      });
      void pushHostDisplayToPeers();
      // The rect may have been computed (and its one broadcast already sent)
      // before this peer connected at all — fetch the current value directly
      // rather than relying solely on that single push. Applied to the shared
      // canvas pipeline, not per-peer — every viewer shares one capture.
      void pb()
        .couchCropRect?.()
        .then((rect) => applyCropRect(rect))
        .catch(() => {});
    };
    dc.onmessage = (e) => {
      if (typeof e.data !== "string") return;
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg && msg.v === 1) {
        void pb().couchRendererMessage({
          type: "input",
          controllerId,
          packet: msg,
        });
        return;
      }
      if (msg && msg.type) {
        void pb().couchRendererMessage({
          type: "control",
          controllerId,
          message: msg,
        });
        // Reply pong on same channel
        if (msg.type === "ping") {
          try {
            dc.send(JSON.stringify({ type: "pong", t: msg.t }));
          } catch {
            /* ignore */
          }
        }
      }
    };
  };

  pc.onicecandidate = (ev) => {
    void pb().couchSignalPost({
      recipientRole: "controller",
      senderPeerId: "host",
      payload: JSON.stringify(
        ev.candidate
          ? { kind: "ice", candidate: ev.candidate, to: controllerId }
          : { kind: "ice", complete: true, to: controllerId }
      ),
    });
  };

  await pc.setRemoteDescription(remoteSdp);
  for (const ice of pendingRemoteIce.get(controllerId) || []) {
    await addRemoteIceCandidate(pc, ice.candidate, ice.complete);
  }
  pendingRemoteIce.delete(controllerId);

  /*
   * Online multiplayer for local-co-op games: push host application window to the peer so
   * remotes see the game while sending pads. Capture is best-effort.
   *
   * Retry BEFORE the first answer rather than answering immediately and
   * relying solely on the later renegotiated push (pushHostDisplayToPeers'
   * 800ms/3s retries) to fix it up — that renegotiation hits a real
   * Chromium bug ("Failed to set SSL role for the transport") when an
   * answerer tries to re-offer, so a failed first capture used to mean no
   * video, ever. A real couch party's game is already running before
   * anyone joins, so attachDisplayTracks already succeeds on the very first
   * try here and this loop exits immediately — zero behavior change for
   * that case. Remote Play launches the game and the session in the same
   * breath, so the window often isn't up yet when the offer arrives; this
   * gives it up to ~6s to appear before the first answer goes out, so the
   * working track is there from the start instead of depending on the
   * broken retry path.
   */
  let capturedBeforeAnswer = false;
  for (let attempt = 0; attempt < 12; attempt++) {
    capturedBeforeAnswer = await attachDisplayTracks(pc);
    if (capturedBeforeAnswer) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  console.log(
    capturedBeforeAnswer
      ? "[couch] display captured before first answer"
      : "[couch] display NOT captured before first answer — will retry after"
  );
  if (!capturedBeforeAnswer) reportOps("failed", { phase: "capture", code: "DISPLAY_CAPTURE_MISSING", message: "No display track before first answer" });

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await pb().couchSignalPost({
    recipientRole: "controller",
    senderPeerId: "host",
    payload: JSON.stringify({
      kind: "answer",
      sdp: answer,
      to: controllerId,
    }),
  });

  /*
   * Only fall back to the renegotiated push path when the first answer
   * genuinely went out without a track — that path is known-fragile (see
   * pushHostDisplayToPeers' iceRestart comment), so it must not run on
   * every connection "just in case" once capture already succeeded above.
   */
  if (!capturedBeforeAnswer) {
    window.setTimeout(() => {
      void pushHostDisplayToPeers();
    }, 800);
    window.setTimeout(() => {
      void pushHostDisplayToPeers();
    }, 3000);
  }

  startStatsLogging(pc, controllerId);
}

/**
 * Periodic real numbers on what's actually being encoded — resolution,
 * framerate, bitrate, and (most useful) WHY the encoder is limited, if it
 * is. Answers "is this a video problem or an input problem" without
 * guessing from a subjective "feels laggy" report. Stops itself once the
 * connection is no longer live.
 */
function startStatsLogging(pc, controllerId) {
  let lastBytesSent = null;
  let lastTs = null;
  const timer = window.setInterval(async () => {
    if (!pc || ["closed", "failed", "disconnected"].includes(pc.connectionState)) {
      window.clearInterval(timer);
      return;
    }
    try {
      const stats = await pc.getStats();
      stats.forEach((report) => {
        if (report.type !== "outbound-rtp" || report.kind !== "video") return;
        let bitrateKbps = null;
        if (lastBytesSent != null && lastTs != null && report.bytesSent != null) {
          const dtSec = (report.timestamp - lastTs) / 1000;
          if (dtSec > 0) bitrateKbps = Math.round(((report.bytesSent - lastBytesSent) * 8) / dtSec / 1000);
        }
        lastBytesSent = report.bytesSent;
        lastTs = report.timestamp;
        console.log(
          `[couch-stats] ${controllerId} video out: ${report.frameWidth || "?"}x${report.frameHeight || "?"}` +
            ` @${report.framesPerSecond || "?"}fps` +
            ` bitrate=${bitrateKbps != null ? bitrateKbps + "kbps" : "?"}` +
            ` qualityLimitation=${report.qualityLimitationReason || "none"}` +
            ` encodeTimeAvg=${
              report.totalEncodeTime && report.framesEncoded
                ? `${Math.round((report.totalEncodeTime / report.framesEncoded) * 1000)}ms`
                : "?"
            }`
        );
      });
    } catch {
      /* best-effort diagnostic */
    }
  }, 4000);
}

function paint(state) {
  const root = views.couch;
  if (!root) return;

  if (!state?.active || !state.session) {
    root.innerHTML = `
      <div class="couch-hero">
        <p class="couch-eyebrow">PlayBound Couch Mode</p>
        <h1>Phone Controllers</h1>
        <p class="couch-lead">
          Turn phones into pads on this PC for couch co-op — or when someone does not have a
          controller. Scan the QR, or open playbound.club/c and enter the short code. No account
          needed on the phone.
        </p>
        <div class="couch-actions">
          <button type="button" class="btn-primary" id="couch-start-btn">Start phone controllers</button>
        </div>
        <p class="couch-hint">Optional. Controllers are set up automatically the first time. Windows may ask once for permission.</p>
      </div>
    `;
    root.querySelector("#couch-start-btn")?.addEventListener("click", () => void startSession());
    return;
  }

  const s = state.session;
  const snap = s.snapshot || {};
  const controllers = snap.controllers || [];
  const joinUrl = s.joinUrl || "";
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(joinUrl)}`;

  const slots = [];
  for (let i = 0; i < (snap.maxPlayers || 4); i++) {
    const c = controllers.find((x) => x.playerSlot === i);
    slots.push({ slot: i, c });
  }

  const metrics = state.metrics || [];
  const driverWarn =
    s.driverOk === false
      ? `<div class="couch-warn">${escapeHtml(
          s.driverReason ||
            "Controllers are still setting up. End the session and click Start Couch Mode again, then Allow if Windows asks."
        )}</div>`
      : "";

  root.innerHTML = `
    <div class="couch-session">
      <div class="couch-session-head">
        <div>
          <p class="couch-eyebrow">Couch Mode · live</p>
          <h1>Connect Controllers</h1>
          <p class="couch-code">Code <strong>${escapeHtml(s.joinCode)}</strong></p>
        </div>
        <div class="couch-actions">
          <button type="button" class="btn-secondary" id="couch-copy-btn">Copy code</button>
          <button type="button" class="btn-secondary" id="couch-stop-btn">End session</button>
        </div>
      </div>
      ${driverWarn}
      <div class="couch-grid">
        <div class="couch-qr-panel">
          <img class="couch-qr" src="${qrSrc}" alt="Scan to join" width="220" height="220" />
          <p class="couch-url">Code ${escapeHtml(s.joinCode)}</p>
          <p class="couch-hint">Scan QR · or open playbound.club/c and enter the code</p>
        </div>
        <div class="couch-players">
          ${slots
            .map(({ slot, c }) => {
              if (!c) {
                return `<div class="couch-player empty"><div class="couch-player-title">Player ${slot + 1}</div><div class="couch-player-sub">Waiting…</div></div>`;
              }
              const pending = c.status === "pending";
              const m = metrics.find((x) => x.controllerId === c.controllerId);
              const stats = m
                ? `${escapeHtml(m.transport || "?")}${m.pingMs != null ? ` · ${m.pingMs} ms` : ""}${m.hz ? ` · ${m.hz} Hz` : ""}`
                : "";
              return `
                <div class="couch-player ${pending ? "pending" : "ready"}">
                  <div class="couch-player-title">Player ${slot + 1}</div>
                  <div class="couch-player-sub">${escapeHtml(c.deviceLabel || c.label || "Phone")}</div>
                  <div class="couch-player-meta">${pending ? "Pending approval" : "Ready"}${stats ? ` · ${stats}` : ""}</div>
                  <div class="couch-player-actions">
                    ${pending ? `<button type="button" class="btn-primary btn-sm" data-approve="${escapeHtml(c.controllerId)}">Accept</button>` : ""}
                    <button type="button" class="btn-secondary btn-sm" data-kick="${escapeHtml(c.controllerId)}">Kick</button>
                    <select data-reassign="${escapeHtml(c.controllerId)}" aria-label="Reassign player">
                      ${[0, 1, 2, 3]
                        .map(
                          (n) =>
                            `<option value="${n}" ${n === slot ? "selected" : ""}>Player ${n + 1}</option>`
                        )
                        .join("")}
                    </select>
                  </div>
                </div>`;
            })
            .join("")}
        </div>
      </div>
      <details class="couch-debug">
        <summary>Latency debug</summary>
        <pre>${escapeHtml(JSON.stringify(metrics, null, 2))}</pre>
      </details>
    </div>
  `;

  root.querySelector("#couch-stop-btn")?.addEventListener("click", () => void stopSession());
  root.querySelector("#couch-copy-btn")?.addEventListener("click", async () => {
    await pb().clipboardWrite(s.joinCode || "");
    setStatus("Copied code — phones open playbound.club/c and enter it (or scan the QR)");
  });
  root.querySelectorAll("[data-approve]").forEach((btn) => {
    btn.addEventListener("click", () =>
      void action("approve", btn.getAttribute("data-approve"))
    );
  });
  root.querySelectorAll("[data-kick]").forEach((btn) => {
    btn.addEventListener("click", () => void action("kick", btn.getAttribute("data-kick")));
  });
  root.querySelectorAll("[data-reassign]").forEach((sel) => {
    sel.addEventListener("change", () =>
      void action("reassign", sel.getAttribute("data-reassign"), Number(sel.value))
    );
  });
}

async function startSession() {
  setStatus("Setting up controllers…");
  const btn = document.getElementById("couch-start-btn");
  if (btn) btn.disabled = true;
  const state = await startCouchSessionQuiet();
  if (btn) btn.disabled = false;
  if (!state?.active) {
    setStatus("Failed to start phone controllers");
    return;
  }
  paint(state);
  setStatus("Phone controllers live — scan the QR, or open playbound.club/c and enter the code");
}

/**
 * Tear down everything a session leaves behind client-side: the display
 * capture, live peer connections, data channels. Split out from
 * stopSession() (below) so it can also run when a session ends WITHOUT this
 * renderer's own Stop button — e.g. PlayBound Remote Play ending its session
 * from the main process on game exit. Without this, the next session would
 * silently reuse a stale display stream from the one that just ended (see
 * ensureHostDisplayStream's "reusing existing display stream" log) — a
 * screen-capture MediaStream stays "live" long after the game it was
 * capturing has closed.
 */
function cleanupPeerState() {
  stopSignalPoll();
  stopHostDisplayStream();
  for (const pc of peers.values()) {
    try {
      pc.close();
    } catch {
      /* ignore */
    }
  }
  peers.clear();
  channels.clear();
  pendingRemoteIce.clear();
  signalSince = 0;
  seenSignalIds.clear();
}

async function stopSession() {
  cleanupPeerState();
  await pb().couchStop();
  await refresh();
  setStatus("Online session ended");
}

async function action(name, controllerId, playerSlot) {
  const res = await pb().couchControllerAction(name, controllerId, playerSlot);
  if (!res?.ok) setStatus(res?.error || "Action failed");
  else {
    lastState = res.state;
    paint(res.state);
  }
}
