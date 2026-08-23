"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { BUTTON } from "@/lib/couch/protocol";

type JoinState = {
  sessionId: string;
  controllerId: string;
  controllerToken: string;
  sessionToken: string | null;
  playerSlot: number | null;
  status: string;
  hostLabel: string;
  wsUrls: string[];
  wsToken: string | null;
  iceServers: RTCIceServer[];
};

type Transport = "connecting" | "webrtc" | "websocket" | "offline";

const STORAGE_KEY = "playbound.couch.controller";

function loadStored(code: string): Partial<JoinState> | null {
  try {
    const raw = sessionStorage.getItem(`${STORAGE_KEY}.${code}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveStored(code: string, state: JoinState) {
  try {
    sessionStorage.setItem(
      `${STORAGE_KEY}.${code}`,
      JSON.stringify({
        controllerId: state.controllerId,
        controllerToken: state.controllerToken,
        sessionToken: state.sessionToken,
        playerSlot: state.playerSlot,
        sessionId: state.sessionId,
      })
    );
  } catch {
    /* ignore */
  }
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

type PadState = {
  buttons: number;
  lx: number;
  ly: number;
  rx: number;
  ry: number;
  lt: number;
  rt: number;
};

const EMPTY: PadState = { buttons: 0, lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0 };

export function ControllerClient({ code }: { code: string }) {
  const [error, setError] = useState<string | null>(null);
  const [join, setJoin] = useState<JoinState | null>(null);
  const [mode, setMode] = useState<"touch-gamepad" | "standard-gamepad">("touch-gamepad");
  const [transport, setTransport] = useState<Transport>("connecting");
  const [pingMs, setPingMs] = useState<number | null>(null);
  const [hz, setHz] = useState(0);
  const [physicalLabel, setPhysicalLabel] = useState<string | null>(null);

  const padRef = useRef<PadState>({ ...EMPTY });
  const seqRef = useRef(0);
  const sendFnRef = useRef<(obj: unknown) => void>(() => {});
  const lastSentRef = useRef(0);
  const framesRef = useRef(0);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const playerLabel = useMemo(() => {
    if (join?.playerSlot == null) return "…";
    return `Player ${join.playerSlot + 1}`;
  }, [join?.playerSlot]);

  const sendInput = useCallback(() => {
    const j = join;
    if (!j || j.status !== "approved" || j.playerSlot == null || !j.sessionToken) return;
    const pad = padRef.current;
    seqRef.current += 1;
    const packet = {
      v: 1,
      seq: seqRef.current,
      t: performance.now(),
      p: j.playerSlot,
      buttons: pad.buttons,
      lx: pad.lx,
      ly: pad.ly,
      rx: pad.rx,
      ry: pad.ry,
      lt: pad.lt,
      rt: pad.rt,
    };
    sendFnRef.current(packet);
    framesRef.current += 1;
    lastSentRef.current = performance.now();
  }, [join]);

  // Join / reconnect (profile changes do not create a new controller)
  useEffect(() => {
    let cancelled = false;
    async function run() {
      setError(null);
      const stored = loadStored(code);
      try {
        const res = await fetch(`/api/couch/sessions/${encodeURIComponent(code)}/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label: "Phone",
            profile: mode,
            controllerId: stored?.controllerId,
            controllerToken: stored?.controllerToken,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Join failed");
        if (cancelled) return;
        const next: JoinState = {
          sessionId: data.sessionId,
          controllerId: data.controllerId,
          controllerToken: data.controllerToken,
          sessionToken: data.sessionToken,
          playerSlot: data.playerSlot,
          status: data.status,
          hostLabel: data.hostLabel || "PlayBound",
          wsUrls: data.wsUrls || [],
          wsToken: data.wsToken,
          iceServers: data.iceServers || [{ urls: "stun:stun.l.google.com:19302" }],
        };
        setJoin(next);
        saveStored(code, next);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Join failed");
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- join once per code
  }, [code]);

  // Poll until approved + refresh endpoints
  useEffect(() => {
    if (!join) return;
    const session = join;
    if (session.status === "approved" && session.wsUrls.length > 0) return;
    const id = window.setInterval(async () => {
      try {
        const qs = new URLSearchParams({
          controllerId: session.controllerId,
          controllerToken: session.controllerToken,
        });
        const res = await fetch(
          `/api/couch/sessions/${encodeURIComponent(session.sessionId)}/join?${qs}`
        );
        const data = await res.json();
        if (!res.ok) return;
        setJoin((prev) => {
          if (!prev) return prev;
          const next = {
            ...prev,
            status: data.status,
            playerSlot: data.playerSlot,
            sessionToken: data.sessionToken,
            wsUrls: data.wsUrls || prev.wsUrls,
            wsToken: data.wsToken ?? prev.wsToken,
          };
          saveStored(code, next);
          return next;
        });
      } catch {
        /* ignore */
      }
    }, 1500);
    return () => window.clearInterval(id);
  }, [join, code]);

  // Wake lock
  useEffect(() => {
    let released = false;
    async function lock() {
      try {
        if ("wakeLock" in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request("screen");
        }
      } catch {
        /* unsupported */
      }
    }
    void lock();
    const onVis = () => {
      if (document.visibilityState === "visible" && !released) void lock();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVis);
      void wakeLockRef.current?.release();
      wakeLockRef.current = null;
    };
  }, []);

  // Transport: prefer WebRTC, fall back to WebSocket
  useEffect(() => {
    if (!join || join.status !== "approved" || join.playerSlot == null) return;
    const session = join;

    let closed = false;
    let pc: RTCPeerConnection | null = null;
    let dc: RTCDataChannel | null = null;
    let ws: WebSocket | null = null;
    let signalSince = 0;
    let pollTimer: number | null = null;
    let pingTimer: number | null = null;
    let hzTimer: number | null = null;
    let usingWebrtc = false;

    const send = (obj: unknown) => {
      const text = JSON.stringify(obj);
      if (dc && dc.readyState === "open") {
        try {
          dc.send(text);
          return;
        } catch {
          /* fall through */
        }
      }
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(text);
      }
    };
    sendFnRef.current = send;

    function handleControl(msg: { type?: string; t?: number }) {
      if (msg.type === "pong" && typeof msg.t === "number") {
        setPingMs(Math.max(0, performance.now() - msg.t));
      }
      if (msg.type === "kick") {
        setTransport("offline");
        setError("Disconnected by host");
      }
    }

    function onMessage(raw: string) {
      try {
        const msg = JSON.parse(raw);
        if (msg && msg.type) handleControl(msg);
      } catch {
        /* ignore */
      }
    }

    async function postSignal(payload: unknown) {
      await fetch(`/api/couch/sessions/${encodeURIComponent(session.sessionId)}/signal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderRole: "controller",
          recipientRole: "host",
          senderPeerId: session.controllerId,
          controllerId: session.controllerId,
          controllerToken: session.controllerToken,
          payload: JSON.stringify(payload),
        }),
      });
    }

    async function startWebRtc() {
      pc = new RTCPeerConnection({ iceServers: session.iceServers });
      dc = pc.createDataChannel("input", { ordered: false, maxRetransmits: 0 });
      dc.binaryType = "arraybuffer";
      dc.onopen = () => {
        usingWebrtc = true;
        setTransport("webrtc");
        send({
          type: "hello",
          controllerId: session.controllerId,
          sessionToken: session.sessionToken,
          playerSlot: session.playerSlot,
          profile: mode,
        });
      };
      dc.onmessage = (ev) => {
        if (typeof ev.data === "string") onMessage(ev.data);
      };
      dc.onclose = () => {
        if (!closed && !ws) void startWsFallback();
      };

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          void postSignal({ kind: "ice", candidate: ev.candidate, from: session.controllerId });
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await postSignal({
        kind: "offer",
        sdp: offer,
        from: session.controllerId,
        playerSlot: session.playerSlot,
      });

      pollTimer = window.setInterval(async () => {
        if (closed || !pc) return;
        try {
          const qs = new URLSearchParams({
            forRole: "controller",
            since: String(signalSince),
            controllerId: session.controllerId,
            controllerToken: session.controllerToken,
            peerId: session.controllerId,
          });
          const res = await fetch(
            `/api/couch/sessions/${encodeURIComponent(session.sessionId)}/signal?${qs}`
          );
          const data = await res.json();
          if (!res.ok) return;
          for (const m of data.messages || []) {
            signalSince = Math.max(signalSince, m.timestamp || 0);
            let payload: {
              kind?: string;
              sdp?: RTCSessionDescriptionInit;
              candidate?: RTCIceCandidateInit;
              to?: string;
            };
            try {
              payload = JSON.parse(m.payload);
            } catch {
              continue;
            }
            if (payload.to && payload.to !== session.controllerId) continue;
            if (payload.kind === "answer" && payload.sdp && pc.signalingState !== "stable") {
              await pc.setRemoteDescription(payload.sdp);
            }
            if (payload.kind === "ice" && payload.candidate) {
              try {
                await pc.addIceCandidate(payload.candidate);
              } catch {
                /* ignore */
              }
            }
          }
        } catch {
          /* ignore */
        }
      }, 500);

      // If no DC open soon, fall back
      window.setTimeout(() => {
        if (!closed && !usingWebrtc) void startWsFallback();
      }, 4000);
    }

    async function startWsFallback() {
      if (ws || closed) return;
      const urls = session.wsUrls || [];
      if (!urls.length || !session.wsToken) {
        setTransport("offline");
        return;
      }
      let idx = 0;
      const tryNext = () => {
        if (closed || idx >= urls.length) {
          if (!usingWebrtc) setTransport("offline");
          return;
        }
        const url = urls[idx++]!;
        try {
          ws = new WebSocket(url);
        } catch {
          tryNext();
          return;
        }
        ws.onopen = () => {
          if (!usingWebrtc) setTransport("websocket");
          ws?.send(
            JSON.stringify({
              type: "auth",
              controllerId: session.controllerId,
              sessionToken: session.sessionToken,
              wsToken: session.wsToken,
              playerSlot: session.playerSlot,
            })
          );
          send({
            type: "hello",
            controllerId: session.controllerId,
            sessionToken: session.sessionToken,
            playerSlot: session.playerSlot,
            profile: mode,
          });
        };
        ws.onmessage = (ev) => {
          if (typeof ev.data === "string") onMessage(ev.data);
        };
        ws.onclose = () => {
          ws = null;
          if (!closed && !usingWebrtc) {
            window.setTimeout(tryNext, 800);
          }
        };
        ws.onerror = () => {
          try {
            ws?.close();
          } catch {
            /* ignore */
          }
        };
      };
      tryNext();
    }

    void startWebRtc();

    pingTimer = window.setInterval(() => {
      send({ type: "ping", t: performance.now() });
    }, 2000);

    hzTimer = window.setInterval(() => {
      setHz(framesRef.current);
      framesRef.current = 0;
    }, 1000);

    const inputLoop = window.setInterval(() => {
      sendInput();
    }, 1000 / 60);

    return () => {
      closed = true;
      if (pollTimer) window.clearInterval(pollTimer);
      if (pingTimer) window.clearInterval(pingTimer);
      if (hzTimer) window.clearInterval(hzTimer);
      window.clearInterval(inputLoop);
      try {
        dc?.close();
      } catch {
        /* ignore */
      }
      try {
        pc?.close();
      } catch {
        /* ignore */
      }
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      sendFnRef.current = () => {};
    };
  }, [join, mode, sendInput]);

  // Physical gamepad polling
  useEffect(() => {
    if (mode !== "standard-gamepad") {
      setPhysicalLabel(null);
      return;
    }
    let raf = 0;
    const tick = () => {
      const pads = navigator.getGamepads?.() || [];
      const pad = pads.find((p) => p && p.connected) || null;
      if (pad) {
        setPhysicalLabel(pad.id || "Gamepad");
        let buttons = 0;
        const map: [number, number][] = [
          [0, BUTTON.A],
          [1, BUTTON.B],
          [2, BUTTON.X],
          [3, BUTTON.Y],
          [4, BUTTON.LB],
          [5, BUTTON.RB],
          [8, BUTTON.BACK],
          [9, BUTTON.START],
          [10, BUTTON.LS],
          [11, BUTTON.RS],
          [12, BUTTON.DPAD_UP],
          [13, BUTTON.DPAD_DOWN],
          [14, BUTTON.DPAD_LEFT],
          [15, BUTTON.DPAD_RIGHT],
        ];
        for (const [idx, bit] of map) {
          if (pad.buttons[idx]?.pressed) buttons |= bit;
        }
        padRef.current = {
          buttons,
          lx: clamp(pad.axes[0] ?? 0, -1, 1),
          ly: clamp(pad.axes[1] ?? 0, -1, 1),
          rx: clamp(pad.axes[2] ?? 0, -1, 1),
          ry: clamp(pad.axes[3] ?? 0, -1, 1),
          lt: clamp(pad.buttons[6]?.value ?? 0, 0, 1),
          rt: clamp(pad.buttons[7]?.value ?? 0, 0, 1),
        };
      } else {
        setPhysicalLabel(null);
        padRef.current = { ...EMPTY };
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mode]);

  const setBit = (bit: number, down: boolean) => {
    if (down) padRef.current.buttons |= bit;
    else padRef.current.buttons &= ~bit;
    sendInput();
  };

  /* ── Screens ─────────────────────────────────────────────────────────── */

  if (error) {
    return (
      <Shell tone="bad">
        <Eyebrow>Couldn’t join</Eyebrow>
        <h1 className="pbc-title">{error}</h1>
        <p className="pbc-code">{code}</p>
      </Shell>
    );
  }

  if (!join) {
    return (
      <Shell>
        <div className="pbc-pulse" aria-hidden />
        <Eyebrow>Connecting</Eyebrow>
        <h1 className="pbc-title">Joining {code}</h1>
        <p className="pbc-sub">Holding the line to your PC…</p>
      </Shell>
    );
  }

  if (join.status === "pending") {
    return (
      <Shell>
        <div className="pbc-pulse" aria-hidden />
        <Eyebrow>Waiting for host</Eyebrow>
        <h1 className="pbc-title">{join.hostLabel}</h1>
        <p className="pbc-sub">Ask them to approve this controller. This screen updates itself.</p>
        <p className="pbc-code">{code}</p>
      </Shell>
    );
  }

  if (mode === "standard-gamepad") {
    return (
      <Shell>
        <Eyebrow>{playerLabel}</Eyebrow>
        <h1 className="pbc-title">{physicalLabel || "Connect a controller"}</h1>
        <p className="pbc-sub">
          Pair an Xbox, DualSense, Switch, 8BitDo or other browser-supported pad to this phone.
          PlayBound forwards it to the PC.
        </p>
        <div className={physicalLabel ? "pbc-dot pbc-dot-live" : "pbc-dot"} aria-hidden />
        <StatusBar transport={transport} pingMs={pingMs} hz={hz} />
        <ModeToggle mode={mode} setMode={setMode} />
      </Shell>
    );
  }

  /* ── The pad ─────────────────────────────────────────────────────────── */

  return (
    <main className="pbc-pad">
      <ControllerStyles />

      {/*
        Portrait is not how anyone holds a controller, so it says so rather
        than pretending. The pad stays live underneath — a nudge, not a wall.
      */}
      <div className="pbc-rotate" aria-hidden>
        <span className="pbc-rotate-icon">⟳</span>
        Turn your phone sideways
      </div>

      <header className="pbc-hud">
        <span className="pbc-hud-host">{join.hostLabel}</span>
        <span className="pbc-hud-sep" aria-hidden>
          ·
        </span>
        <span className="pbc-hud-player">{playerLabel}</span>
        <StatusBar transport={transport} pingMs={pingMs} hz={hz} />
      </header>

      {/* Shoulders sit on the top edge, where the index fingers already are. */}
      <div className="pbc-shoulder pbc-shoulder-left">
        <TriggerButton
          label="LT"
          onValue={(v) => {
            padRef.current.lt = v;
          }}
        />
        <HoldButton label="LB" bit={BUTTON.LB} setBit={setBit} />
      </div>
      <div className="pbc-shoulder pbc-shoulder-right">
        <HoldButton label="RB" bit={BUTTON.RB} setBit={setBit} />
        <TriggerButton
          label="RT"
          onValue={(v) => {
            padRef.current.rt = v;
          }}
        />
      </div>

      <div className="pbc-zone pbc-zone-left">
        <AnalogStick
          label="L"
          onChange={(x, y) => {
            padRef.current.lx = x;
            padRef.current.ly = y;
          }}
        />
        <DPad setBit={setBit} />
      </div>

      <div className="pbc-zone pbc-zone-right">
        <FaceCluster setBit={setBit} />
        <AnalogStick
          label="R"
          onChange={(x, y) => {
            padRef.current.rx = x;
            padRef.current.ry = y;
          }}
        />
      </div>

      {/* Menu keys live centre-bottom, out of thumb travel so they are hard to hit by accident. */}
      <div className="pbc-menu">
        <HoldButton label="◀" bit={BUTTON.BACK} setBit={setBit} title="Back" />
        <ModeToggle mode={mode} setMode={setMode} compact />
        <HoldButton label="▶" bit={BUTTON.START} setBit={setBit} title="Start" />
      </div>
    </main>
  );
}

/* ── Chrome ──────────────────────────────────────────────────────────── */

function Shell({ children, tone }: { children: React.ReactNode; tone?: "bad" }) {
  return (
    <main className={tone === "bad" ? "pbc-shell pbc-shell-bad" : "pbc-shell"}>
      <ControllerStyles />
      <div className="pbc-shell-inner">{children}</div>
    </main>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="pbc-eyebrow">{children}</p>;
}

function StatusBar({
  transport,
  pingMs,
  hz,
}: {
  transport: Transport;
  pingMs: number | null;
  hz: number;
}) {
  const live = transport === "webrtc" || transport === "websocket";
  return (
    <div className="pbc-status" role="status">
      <span className={live ? "pbc-status-led pbc-status-led-live" : "pbc-status-led"} aria-hidden />
      <span className="pbc-status-transport">
        {transport === "webrtc" ? "direct" : transport === "websocket" ? "relay" : transport}
      </span>
      {pingMs != null && <span className="pbc-status-num">{pingMs.toFixed(0)}ms</span>}
      {hz > 0 && <span className="pbc-status-num">{hz}Hz</span>}
    </div>
  );
}

function ModeToggle({
  mode,
  setMode,
  compact,
}: {
  mode: "touch-gamepad" | "standard-gamepad";
  setMode: (m: "touch-gamepad" | "standard-gamepad") => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "pbc-toggle pbc-toggle-compact" : "pbc-toggle"}>
      <button
        type="button"
        className={mode === "touch-gamepad" ? "pbc-toggle-btn is-on" : "pbc-toggle-btn"}
        onClick={() => setMode("touch-gamepad")}
      >
        Touch
      </button>
      <button
        type="button"
        className={mode === "standard-gamepad" ? "pbc-toggle-btn is-on" : "pbc-toggle-btn"}
        onClick={() => setMode("standard-gamepad")}
      >
        Pad
      </button>
    </div>
  );
}

/* ── Inputs ──────────────────────────────────────────────────────────── */

/**
 * A short tap through the phone's own motor.
 *
 * Touch controls have no travel and no click, so without this a press is
 * confirmed only by whatever happens on the TV — which is exactly the feedback
 * loop a controller exists to shorten. Guarded because iOS Safari has no
 * vibrate at all and must not throw over it.
 */
function tap(ms = 8) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* no motor, or blocked — the visual press state still lands */
  }
}

/** Shared press wiring: pointer capture, haptics, and a class for the press state. */
function pressProps(down: () => void, up: () => void) {
  return {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      e.currentTarget.classList.add("is-down");
      tap();
      down();
    },
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
      e.currentTarget.classList.remove("is-down");
      up();
    },
    onPointerCancel: (e: React.PointerEvent<HTMLElement>) => {
      e.currentTarget.classList.remove("is-down");
      up();
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
}

const FACE = [
  { label: "Y", bit: BUTTON.Y, hue: "var(--pbc-y)", area: "y" },
  { label: "X", bit: BUTTON.X, hue: "var(--pbc-x)", area: "x" },
  { label: "B", bit: BUTTON.B, hue: "var(--pbc-b)", area: "b" },
  { label: "A", bit: BUTTON.A, hue: "var(--pbc-a)", area: "a" },
] as const;

function FaceCluster({ setBit }: { setBit: (bit: number, down: boolean) => void }) {
  return (
    <div className="pbc-face">
      {FACE.map(({ label, bit, hue, area }) => (
        <button
          key={label}
          type="button"
          aria-label={label}
          className="pbc-face-btn"
          style={{ gridArea: area, ["--btn" as string]: hue }}
          {...pressProps(
            () => setBit(bit, true),
            () => setBit(bit, false)
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function HoldButton({
  label,
  bit,
  setBit,
  title,
}: {
  label: string;
  bit: number;
  setBit: (bit: number, down: boolean) => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      className="pbc-bumper"
      aria-label={title || label}
      {...pressProps(
        () => setBit(bit, true),
        () => setBit(bit, false)
      )}
    >
      {label}
    </button>
  );
}

function TriggerButton({ label, onValue }: { label: string; onValue: (v: number) => void }) {
  return (
    <button
      type="button"
      className="pbc-trigger"
      aria-label={label}
      {...pressProps(
        () => onValue(1),
        () => onValue(0)
      )}
    >
      {label}
    </button>
  );
}

function AnalogStick({
  label,
  onChange,
}: {
  label: string;
  onChange: (x: number, y: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);

  const move = (clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const max = r.width * 0.34;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const mag = Math.hypot(dx, dy) || 1;
    if (mag > max) {
      dx = (dx / mag) * max;
      dy = (dy / mag) * max;
    }
    setKnob({ x: dx, y: dy });
    onChange(clamp(dx / max, -1, 1), clamp(dy / max, -1, 1));
  };

  const end = () => {
    setActive(false);
    setKnob({ x: 0, y: 0 });
    onChange(0, 0);
  };

  return (
    <div
      ref={ref}
      className={active ? "pbc-stick is-active" : "pbc-stick"}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setActive(true);
        tap(6);
        move(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (e.buttons || e.pressure > 0) move(e.clientX, e.clientY);
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="pbc-stick-ring" aria-hidden />
      <span
        className="pbc-stick-knob"
        style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
      >
        {label}
      </span>
    </div>
  );
}

const DPAD_KEYS = [
  { label: "▲", bit: BUTTON.DPAD_UP, area: "u" },
  { label: "◀", bit: BUTTON.DPAD_LEFT, area: "l" },
  { label: "▶", bit: BUTTON.DPAD_RIGHT, area: "r" },
  { label: "▼", bit: BUTTON.DPAD_DOWN, area: "d" },
] as const;

function DPad({ setBit }: { setBit: (bit: number, down: boolean) => void }) {
  return (
    <div className="pbc-dpad">
      <span className="pbc-dpad-hub" aria-hidden />
      {DPAD_KEYS.map(({ label, bit, area }) => (
        <button
          key={area}
          type="button"
          aria-label={area}
          className="pbc-dpad-key"
          style={{ gridArea: area }}
          {...pressProps(
            () => setBit(bit, true),
            () => setBit(bit, false)
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}


/* ── Styles ──────────────────────────────────────────────────────────── */

/**
 * One stylesheet rather than inline styles, because the things that make this
 * feel like a controller cannot be expressed inline: orientation media
 * queries, press states, and keyframes.
 *
 * Sizes are in vmin, not px. A pad measured in pixels is right on exactly one
 * phone — the previous 58px buttons and 130px sticks were tuned for a mid-size
 * device and left an SE cramped and a Max looking like a toy. vmin ties every
 * control to the short edge, which in landscape is the height, which is what
 * actually limits a thumb.
 */
function ControllerStyles() {
  return (
    <style>{`
:root {
  --pbc-ground: #07060B;
  --pbc-ink: #F4F1FB;
  --pbc-muted: #8F87A6;
  --pbc-line: rgba(255,255,255,.10);
  --pbc-raise: rgba(255,255,255,.055);
  --pbc-accent: #8B6DFF;
  --pbc-live: #3DD68C;
  /* Canonical face colours. These are information, not decoration — every
     console overlay and every button prompt in every game uses them. */
  --pbc-a: #5BD98A;
  --pbc-b: #FF6B6B;
  --pbc-x: #6AA8FF;
  --pbc-y: #F5CE5A;
  /* Insets on all four edges. Landscape is the orientation this is used in,
     and that is precisely when a notch eats the left or right edge — the
     earlier layout only ever accounted for the bottom. */
  --pbc-safe-t: env(safe-area-inset-top, 0px);
  --pbc-safe-r: env(safe-area-inset-right, 0px);
  --pbc-safe-b: env(safe-area-inset-bottom, 0px);
  --pbc-safe-l: env(safe-area-inset-left, 0px);
}

.pbc-shell, .pbc-pad {
  position: fixed;
  inset: 0;
  background:
    radial-gradient(120% 90% at 50% -10%, rgba(139,109,255,.16), transparent 62%),
    var(--pbc-ground);
  color: var(--pbc-ink);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  overflow: hidden;
  /* Nothing here should ever select, callout, or bounce under a thumb. */
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
  overscroll-behavior: none;
  touch-action: none;
}

/* ── Connection screens ─────────────────────────────────────────────── */

.pbc-shell { display: grid; place-items: center; padding: 28px; }
.pbc-shell-inner {
  display: flex; flex-direction: column; align-items: center; gap: 14px;
  text-align: center; max-width: 34ch;
}
.pbc-shell-bad { background: radial-gradient(120% 90% at 50% -10%, rgba(255,107,107,.16), transparent 62%), var(--pbc-ground); }

.pbc-eyebrow {
  margin: 0; font-size: 11px; font-weight: 700;
  letter-spacing: .18em; text-transform: uppercase; color: var(--pbc-muted);
}
.pbc-title {
  margin: 0; font-size: clamp(22px, 6vw, 30px); font-weight: 700;
  line-height: 1.15; letter-spacing: -0.02em; text-wrap: balance;
}
.pbc-sub { margin: 0; color: var(--pbc-muted); font-size: 14px; line-height: 1.55; }
.pbc-code {
  margin: 4px 0 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px; letter-spacing: .34em; color: var(--pbc-muted);
  padding-left: .34em; /* letter-spacing pads the right; balance it */
}

/* A slow breath, so "waiting" looks alive rather than hung. */
.pbc-pulse {
  width: 74px; height: 74px; border-radius: 50%; margin-bottom: 4px;
  background: radial-gradient(circle, rgba(139,109,255,.55), transparent 68%);
  animation: pbc-breathe 2.4s ease-in-out infinite;
}
@keyframes pbc-breathe {
  0%, 100% { transform: scale(.86); opacity: .55; }
  50%      { transform: scale(1.06); opacity: 1; }
}
.pbc-dot {
  width: 9px; height: 9px; border-radius: 50%;
  background: var(--pbc-muted); box-shadow: 0 0 0 4px rgba(255,255,255,.05);
}
.pbc-dot-live { background: var(--pbc-live); box-shadow: 0 0 0 4px rgba(61,214,140,.16); }

/* ── Status ─────────────────────────────────────────────────────────── */

.pbc-status {
  display: inline-flex; align-items: center; gap: 7px;
  font-size: 11px; font-weight: 600; color: var(--pbc-muted);
  font-variant-numeric: tabular-nums;
}
.pbc-status-led {
  width: 6px; height: 6px; border-radius: 50%; background: var(--pbc-muted);
}
.pbc-status-led-live { background: var(--pbc-live); box-shadow: 0 0 8px var(--pbc-live); }
.pbc-status-transport { text-transform: uppercase; letter-spacing: .1em; }
.pbc-status-num { opacity: .8; }

/* ── Mode toggle ────────────────────────────────────────────────────── */

.pbc-toggle {
  display: inline-flex; gap: 4px; padding: 4px;
  border-radius: 999px; background: rgba(255,255,255,.05);
  border: 1px solid var(--pbc-line);
}
.pbc-toggle-btn {
  appearance: none; border: 0; background: transparent; color: var(--pbc-muted);
  font: inherit; font-size: 12px; font-weight: 700;
  padding: 7px 15px; border-radius: 999px; cursor: pointer;
  transition: background .15s ease, color .15s ease;
}
.pbc-toggle-btn.is-on { background: var(--pbc-accent); color: #0b0713; }
.pbc-toggle-compact .pbc-toggle-btn { font-size: 10px; padding: 5px 11px; }

/* ── Pad chrome ─────────────────────────────────────────────────────── */

.pbc-hud {
  position: absolute; top: calc(var(--pbc-safe-t) + 8px); left: 50%;
  transform: translateX(-50%);
  display: flex; align-items: center; gap: 8px;
  font-size: 11px; color: var(--pbc-muted); white-space: nowrap;
  max-width: 60vw; overflow: hidden;
}
.pbc-hud-host { font-weight: 600; overflow: hidden; text-overflow: ellipsis; }
.pbc-hud-player { font-weight: 700; color: var(--pbc-ink); }
.pbc-hud-sep { opacity: .4; }

.pbc-menu {
  position: absolute; bottom: calc(var(--pbc-safe-b) + 6px); left: 50%;
  transform: translateX(-50%);
  display: flex; align-items: center; gap: 10px;
}

/* ── Shoulders: on the top edge, under the index fingers ────────────── */

.pbc-shoulder {
  position: absolute; top: calc(var(--pbc-safe-t) + 6px);
  display: flex; gap: 8px; align-items: flex-start;
}
.pbc-shoulder-left  { left: calc(var(--pbc-safe-l) + 10px); }
.pbc-shoulder-right { right: calc(var(--pbc-safe-r) + 10px); }

.pbc-bumper, .pbc-trigger {
  appearance: none; font: inherit; cursor: pointer;
  color: var(--pbc-ink); font-weight: 700;
  font-size: clamp(11px, 2.4vmin, 15px);
  border: 1px solid var(--pbc-line);
  background: linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,.03));
  box-shadow: inset 0 1px 0 rgba(255,255,255,.10), 0 2px 6px rgba(0,0,0,.35);
  touch-action: none;
  transition: transform .06s ease, background .06s ease, box-shadow .06s ease;
}
.pbc-bumper {
  min-width: clamp(48px, 11vmin, 74px); height: clamp(44px, 9vmin, 54px);
  border-radius: 12px;
}
/* Triggers read as taller than bumpers, the way they sit on real hardware. */
.pbc-trigger {
  min-width: clamp(48px, 11vmin, 74px); height: clamp(48px, 10.5vmin, 64px);
  border-radius: 12px 12px 16px 16px;
}
.pbc-bumper.is-down, .pbc-trigger.is-down {
  transform: translateY(2px) scale(.97);
  background: linear-gradient(180deg, rgba(139,109,255,.45), rgba(139,109,255,.22));
  box-shadow: inset 0 2px 6px rgba(0,0,0,.45);
}

/* ── Thumb zones ────────────────────────────────────────────────────── */

/*
 * Thumb zones sit just below the vertical centre, not in the bottom corners.
 * Holding a phone sideways in two hands puts the thumbs a little under the
 * midline; anchoring to the bottom edge pushed every control into the last
 * third of the screen and left the rest empty.
 */
.pbc-zone {
  position: absolute; top: 50%; transform: translateY(-42%);
  display: flex; align-items: center; gap: clamp(10px, 3vmin, 26px);
}
.pbc-zone-left  { left: calc(var(--pbc-safe-l) + 12px); }
.pbc-zone-right { right: calc(var(--pbc-safe-r) + 12px); }

/* ── Analog stick ───────────────────────────────────────────────────── */

.pbc-stick {
  position: relative;
  width: clamp(112px, 39vmin, 208px); aspect-ratio: 1;
  border-radius: 50%;
  background:
    radial-gradient(circle at 50% 42%, rgba(255,255,255,.07), rgba(255,255,255,.02) 60%, transparent 72%),
    rgba(255,255,255,.03);
  border: 1px solid var(--pbc-line);
  touch-action: none;
  transition: border-color .12s ease;
}
.pbc-stick.is-active { border-color: rgba(139,109,255,.5); }
.pbc-stick-ring {
  position: absolute; inset: 18%; border-radius: 50%;
  border: 1px dashed rgba(255,255,255,.09);
}
.pbc-stick-knob {
  position: absolute; left: 50%; top: 50%;
  width: 44%; aspect-ratio: 1; border-radius: 50%;
  display: grid; place-items: center;
  font-weight: 800; font-size: clamp(12px, 2.6vmin, 17px); color: var(--pbc-ink);
  background: linear-gradient(180deg, rgba(255,255,255,.20), rgba(255,255,255,.07));
  box-shadow: inset 0 2px 0 rgba(255,255,255,.22), 0 6px 16px rgba(0,0,0,.5);
  /* No transition on transform — a stick that eases is a stick that lags. */
}
.pbc-stick.is-active .pbc-stick-knob {
  background: linear-gradient(180deg, rgba(139,109,255,.55), rgba(139,109,255,.28));
}

/* ── Face buttons ───────────────────────────────────────────────────── */

.pbc-face {
  display: grid;
  grid-template-areas: ". y ." "x . b" ". a .";
  gap: clamp(4px, 1.2vmin, 10px);
}
.pbc-face-btn {
  appearance: none; cursor: pointer; font: inherit;
  width: clamp(50px, 15vmin, 92px); aspect-ratio: 1; border-radius: 50%;
  font-weight: 800; font-size: clamp(15px, 3.4vmin, 24px);
  color: var(--btn);
  border: 2px solid color-mix(in oklab, var(--btn) 70%, transparent);
  background:
    radial-gradient(circle at 50% 35%, color-mix(in oklab, var(--btn) 22%, transparent), transparent 70%),
    rgba(255,255,255,.04);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.14), 0 3px 10px rgba(0,0,0,.45);
  touch-action: none;
  transition: transform .06s ease, background .06s ease, box-shadow .06s ease;
}
.pbc-face-btn.is-down {
  transform: translateY(2px) scale(.94);
  background: radial-gradient(circle at 50% 35%, color-mix(in oklab, var(--btn) 62%, transparent), transparent 78%), rgba(255,255,255,.06);
  box-shadow: inset 0 3px 8px rgba(0,0,0,.5), 0 0 18px color-mix(in oklab, var(--btn) 40%, transparent);
}

/* ── D-pad ──────────────────────────────────────────────────────────── */

.pbc-dpad {
  position: relative;
  display: grid;
  grid-template-areas: ". u ." "l . r" ". d .";
  gap: 2px;
}
.pbc-dpad-key {
  appearance: none; cursor: pointer; font: inherit;
  width: clamp(44px, 12vmin, 74px); aspect-ratio: 1;
  color: var(--pbc-ink); font-size: clamp(11px, 2.4vmin, 16px);
  border: 1px solid var(--pbc-line);
  background: linear-gradient(180deg, rgba(255,255,255,.09), rgba(255,255,255,.03));
  box-shadow: inset 0 1px 0 rgba(255,255,255,.08), 0 2px 6px rgba(0,0,0,.35);
  touch-action: none;
  transition: transform .06s ease, background .06s ease;
}
/* Rounded only on the outer corners, so the four keys read as one cross. */
[style*="grid-area: u"].pbc-dpad-key { border-radius: 12px 12px 3px 3px; }
[style*="grid-area: d"].pbc-dpad-key { border-radius: 3px 3px 12px 12px; }
[style*="grid-area: l"].pbc-dpad-key { border-radius: 12px 3px 3px 12px; }
[style*="grid-area: r"].pbc-dpad-key { border-radius: 3px 12px 12px 3px; }
.pbc-dpad-key.is-down {
  transform: scale(.94);
  background: linear-gradient(180deg, rgba(139,109,255,.45), rgba(139,109,255,.22));
}
.pbc-dpad-hub {
  position: absolute; inset: 0; margin: auto;
  width: clamp(44px, 12vmin, 74px); aspect-ratio: 1;
  background: linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.02));
  border-top: 1px solid var(--pbc-line); border-bottom: 1px solid var(--pbc-line);
  pointer-events: none;
}

/* ── Orientation ────────────────────────────────────────────────────── */

.pbc-rotate { display: none; }

/*
 * Portrait. The pad still works, but the thumb zones stack instead of sitting
 * in opposite corners, and a nudge appears — the old layout simply ran the
 * same column layout in both orientations, which is why it never sat right
 * held sideways.
 */
@media (orientation: portrait) {
  /*
   * The pad becomes a bottom-weighted column: both thumb clusters stack within
   * reach of the bottom edge, because in portrait one hand is holding the phone
   * and neither thumb reaches the middle.
   */
  .pbc-pad {
    display: flex; flex-direction: column;
    justify-content: flex-end; align-items: center;
    gap: clamp(12px, 3.5vh, 34px);
    padding: 0 12px calc(var(--pbc-safe-b) + 84px);
  }
  .pbc-zone {
    /* Both must be reset: position alone leaves the landscape transform,
       which is what pulled the clusters off-centre. */
    position: static; transform: none;
    width: 100%; justify-content: center;
    gap: clamp(12px, 5vw, 30px);
  }
  .pbc-zone-right { flex-direction: row-reverse; }

  /* Shoulders keep the top corners; the HUD drops below them so the two stop
     sharing the same line. */
  .pbc-hud {
    top: auto; bottom: calc(var(--pbc-safe-b) + 54px);
    max-width: 90vw; justify-content: center;
  }
  .pbc-rotate {
    display: flex; align-items: center; gap: 8px;
    position: absolute; top: calc(var(--pbc-safe-t) + 78px); left: 50%;
    transform: translateX(-50%);
    font-size: 12px; font-weight: 600; color: var(--pbc-muted);
    white-space: nowrap;
  }
  .pbc-rotate-icon { font-size: 16px; animation: pbc-rock 2.2s ease-in-out infinite; display: inline-block; }
  @keyframes pbc-rock { 0%,100% { transform: rotate(-12deg); } 50% { transform: rotate(78deg); } }
}

/* A short landscape phone has no room for a wide gap between stick and d-pad. */
@media (orientation: landscape) and (max-height: 380px) {
  .pbc-zone { gap: clamp(6px, 2vmin, 14px); }
  .pbc-hud { font-size: 10px; }
  .pbc-stick { width: clamp(104px, 34vmin, 150px); }
  .pbc-face-btn { width: clamp(46px, 13vmin, 74px); }
}

@media (prefers-reduced-motion: reduce) {
  .pbc-pulse, .pbc-rotate-icon { animation: none; }
  .pbc-face-btn, .pbc-bumper, .pbc-trigger, .pbc-dpad-key { transition: none; }
}
`}</style>
  );
}

