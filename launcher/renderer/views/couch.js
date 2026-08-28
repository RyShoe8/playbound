/**
 * Couch Mode host UI + WebRTC answerer.
 * Phones send offers via cloud signaling; we answer and forward input to main.
 * The host bridge can run in the background (Play → phone controller) without
 * opening this view.
 */

import { escapeHtml, setStatus, views, api } from "../shared.js";
import { CADENCE } from "../cadence.js";

let wired = false;
let signalSince = 0;
let pollTimer = null;
/** @type {Map<string, RTCPeerConnection>} */
const peers = new Map();
/** @type {Map<string, RTCDataChannel>} */
const channels = new Map();
let lastState = null;

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
  void (async () => {
    const state = await pb().couchState();
    lastState = state;
    if (state?.active) startSignalPoll();
    else stopSignalPoll();
  })();
}

/** Start a phone-controller session without painting the Couch page. */
export async function startCouchSessionQuiet() {
  ensureWired();
  const existing = await pb().couchState();
  if (existing?.active) {
    lastState = existing;
    startSignalPoll();
    return existing;
  }
  const res = await pb().couchStart({ hostLabel: "PlayBound" });
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
    lastState = state;
    if (state?.active) startSignalPoll();
    else stopSignalPoll();
    if (couchViewVisible()) paint(state);
  });

  pb().onCouchStatus?.((payload) => {
    const msg = payload?.message;
    if (msg) setStatus(msg);
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
}

function stopSignalPoll() {
  if (pollTimer) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
  emptySignalPolls = 0;
  signalPollMs = SIGNAL_ACTIVE_MS;
}

async function pollSignals() {
  const session = lastState?.session;
  if (!session) return;
  const res = await pb().couchSignalPoll(signalSince);
  const messages = res?.messages || [];

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
    signalSince = Math.max(signalSince, m.timestamp || 0);
    let payload;
    try {
      payload = JSON.parse(m.payload);
    } catch {
      continue;
    }
    if (payload.kind === "offer" && payload.from && payload.sdp) {
      await answerOffer(payload.from, payload.sdp, session);
    }
    if (payload.kind === "ice" && payload.from && payload.candidate) {
      const pc = peers.get(payload.from);
      if (pc) {
        try {
          await pc.addIceCandidate(payload.candidate);
        } catch {
          /* ignore */
        }
      }
    }
  }
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

  const iceServers = session?.snapshot?.hostEndpoints?.iceServers || [
    { urls: "stun:stun.l.google.com:19302" },
  ];
  pc = new RTCPeerConnection({ iceServers });
  peers.set(controllerId, pc);

  pc.ondatachannel = (ev) => {
    const dc = ev.channel;
    channels.set(controllerId, dc);
    dc.onopen = () => {
      void pb().couchRendererMessage({
        type: "transport",
        controllerId,
        transport: "webrtc",
      });
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
    if (!ev.candidate) return;
    void pb().couchSignalPost({
      recipientRole: "controller",
      senderPeerId: "host",
      payload: JSON.stringify({
        kind: "ice",
        candidate: ev.candidate,
        to: controllerId,
      }),
    });
  };

  await pc.setRemoteDescription(remoteSdp);
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
          Turn a phone into a gamepad for this PC — solo or with friends.
          For single-player, you can also pick <strong>Use phone as controller</strong> when you hit Play on a controller-supported game.
          No PlayBound account on the phone. Display (TV/HDMI) stays separate; this is input only.
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
          <button type="button" class="btn-secondary" id="couch-copy-btn">Copy link</button>
          <button type="button" class="btn-secondary" id="couch-stop-btn">End session</button>
        </div>
      </div>
      ${driverWarn}
      <div class="couch-grid">
        <div class="couch-qr-panel">
          <img class="couch-qr" src="${qrSrc}" alt="Scan to join" width="220" height="220" />
          <p class="couch-url">${escapeHtml(joinUrl)}</p>
          <p class="couch-hint">Scan to join · playbound.club/controller/${escapeHtml(s.joinCode)}</p>
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
    await pb().clipboardWrite(joinUrl);
    setStatus("Join link copied");
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
  setStatus("Phone controllers live — scan the QR code");
}

async function stopSession() {
  stopSignalPoll();
  for (const pc of peers.values()) {
    try {
      pc.close();
    } catch {
      /* ignore */
    }
  }
  peers.clear();
  channels.clear();
  signalSince = 0;
  await pb().couchStop();
  await refresh();
  setStatus("Couch Mode ended");
}

async function action(name, controllerId, playerSlot) {
  const res = await pb().couchControllerAction(name, controllerId, playerSlot);
  if (!res?.ok) setStatus(res?.error || "Action failed");
  else {
    lastState = res.state;
    paint(res.state);
  }
}
