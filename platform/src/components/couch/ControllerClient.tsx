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
    if (join.status === "approved" && join.wsUrls.length > 0) return;
    const id = window.setInterval(async () => {
      try {
        const qs = new URLSearchParams({
          controllerId: join.controllerId,
          controllerToken: join.controllerToken,
        });
        const res = await fetch(
          `/api/couch/sessions/${encodeURIComponent(join.sessionId)}/join?${qs}`
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
      await fetch(`/api/couch/sessions/${encodeURIComponent(join.sessionId)}/signal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderRole: "controller",
          recipientRole: "host",
          senderPeerId: join.controllerId,
          controllerId: join.controllerId,
          controllerToken: join.controllerToken,
          payload: JSON.stringify(payload),
        }),
      });
    }

    async function startWebRtc() {
      pc = new RTCPeerConnection({ iceServers: join.iceServers });
      dc = pc.createDataChannel("input", { ordered: false, maxRetransmits: 0 });
      dc.binaryType = "arraybuffer";
      dc.onopen = () => {
        usingWebrtc = true;
        setTransport("webrtc");
        send({
          type: "hello",
          controllerId: join.controllerId,
          sessionToken: join.sessionToken,
          playerSlot: join.playerSlot,
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
          void postSignal({ kind: "ice", candidate: ev.candidate, from: join.controllerId });
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await postSignal({
        kind: "offer",
        sdp: offer,
        from: join.controllerId,
        playerSlot: join.playerSlot,
      });

      pollTimer = window.setInterval(async () => {
        if (closed || !pc) return;
        try {
          const qs = new URLSearchParams({
            forRole: "controller",
            since: String(signalSince),
            controllerId: join.controllerId,
            controllerToken: join.controllerToken,
            peerId: join.controllerId,
          });
          const res = await fetch(
            `/api/couch/sessions/${encodeURIComponent(join.sessionId)}/signal?${qs}`
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
            if (payload.to && payload.to !== join.controllerId) continue;
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
      const urls = join.wsUrls || [];
      if (!urls.length || !join.wsToken) {
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
              controllerId: join.controllerId,
              sessionToken: join.sessionToken,
              wsToken: join.wsToken,
              playerSlot: join.playerSlot,
            })
          );
          send({
            type: "hello",
            controllerId: join.controllerId,
            sessionToken: join.sessionToken,
            playerSlot: join.playerSlot,
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

  if (error) {
    return (
      <Shell>
        <h1 style={titleStyle}>Couldn’t join</h1>
        <p style={{ opacity: 0.8 }}>{error}</p>
        <p style={{ opacity: 0.5, fontSize: 13 }}>Code: {code}</p>
      </Shell>
    );
  }

  if (!join) {
    return (
      <Shell>
        <h1 style={titleStyle}>Joining {code}…</h1>
      </Shell>
    );
  }

  if (join.status === "pending") {
    return (
      <Shell>
        <p style={eyebrowStyle}>Waiting for host</p>
        <h1 style={titleStyle}>{join.hostLabel}</h1>
        <p style={{ opacity: 0.7 }}>Ask the host to approve this controller.</p>
      </Shell>
    );
  }

  if (mode === "standard-gamepad") {
    return (
      <Shell>
        <p style={eyebrowStyle}>{playerLabel}</p>
        <h1 style={titleStyle}>{physicalLabel || "Connect a controller"}</h1>
        <p style={{ opacity: 0.75, maxWidth: 360, textAlign: "center" }}>
          Pair an Xbox, DualSense, Switch, 8BitDo, or other browser-supported pad to this phone.
          PlayBound forwards it to the PC.
        </p>
        <StatusBar transport={transport} pingMs={pingMs} hz={hz} />
        <ModeToggle mode={mode} setMode={setMode} />
      </Shell>
    );
  }

  return (
    <div style={rootPadStyle}>
      <div style={topBarStyle}>
        <div>
          <div style={eyebrowStyle}>{join.hostLabel}</div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{playerLabel}</div>
        </div>
        <StatusBar transport={transport} pingMs={pingMs} hz={hz} />
      </div>

      <div style={padGridStyle}>
        <AnalogStick
          label="L"
          onChange={(x, y) => {
            padRef.current.lx = x;
            padRef.current.ly = y;
          }}
        />
        <div style={faceClusterStyle}>
          <FaceButton label="Y" bit={BUTTON.Y} color="#f0d060" setBit={setBit} />
          <div style={{ display: "flex", gap: 18, justifyContent: "center" }}>
            <FaceButton label="X" bit={BUTTON.X} color="#6aa8ff" setBit={setBit} />
            <FaceButton label="B" bit={BUTTON.B} color="#ff6b6b" setBit={setBit} />
          </div>
          <FaceButton label="A" bit={BUTTON.A} color="#6ddea0" setBit={setBit} />
        </div>
        <AnalogStick
          label="R"
          onChange={(x, y) => {
            padRef.current.rx = x;
            padRef.current.ry = y;
          }}
        />
      </div>

      <div style={shoulderRowStyle}>
        <TriggerButton label="LT" onValue={(v) => { padRef.current.lt = v; }} />
        <HoldButton label="LB" bit={BUTTON.LB} setBit={setBit} />
        <HoldButton label="◀" bit={BUTTON.BACK} setBit={setBit} />
        <HoldButton label="▶" bit={BUTTON.START} setBit={setBit} />
        <HoldButton label="RB" bit={BUTTON.RB} setBit={setBit} />
        <TriggerButton label="RT" onValue={(v) => { padRef.current.rt = v; }} />
      </div>

      <DPad setBit={setBit} />
      <ModeToggle mode={mode} setMode={setMode} />
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: 24,
        background: "#0b0a10",
        color: "#f2efe8",
      }}
    >
      {children}
    </main>
  );
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
  return (
    <div style={{ fontSize: 12, opacity: 0.65, fontVariantNumeric: "tabular-nums" }}>
      {transport}
      {pingMs != null ? ` · ${pingMs.toFixed(0)} ms` : ""}
      {hz ? ` · ${hz} Hz` : ""}
    </div>
  );
}

function ModeToggle({
  mode,
  setMode,
}: {
  mode: "touch-gamepad" | "standard-gamepad";
  setMode: (m: "touch-gamepad" | "standard-gamepad") => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
      <button
        type="button"
        style={mode === "touch-gamepad" ? toggleOn : toggleOff}
        onClick={() => setMode("touch-gamepad")}
      >
        Touch
      </button>
      <button
        type="button"
        style={mode === "standard-gamepad" ? toggleOn : toggleOff}
        onClick={() => setMode("standard-gamepad")}
      >
        Physical pad
      </button>
    </div>
  );
}

function FaceButton({
  label,
  bit,
  color,
  setBit,
}: {
  label: string;
  bit: number;
  color: string;
  setBit: (bit: number, down: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      style={{
        width: 58,
        height: 58,
        borderRadius: "50%",
        border: `2px solid ${color}`,
        background: "rgba(255,255,255,0.06)",
        color,
        fontWeight: 700,
        fontSize: 18,
        touchAction: "none",
      }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setBit(bit, true);
      }}
      onPointerUp={() => setBit(bit, false)}
      onPointerCancel={() => setBit(bit, false)}
    >
      {label}
    </button>
  );
}

function HoldButton({
  label,
  bit,
  setBit,
}: {
  label: string;
  bit: number;
  setBit: (bit: number, down: boolean) => void;
}) {
  return (
    <button
      type="button"
      style={{
        minWidth: 48,
        height: 40,
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.2)",
        background: "rgba(255,255,255,0.08)",
        color: "#f2efe8",
        fontWeight: 600,
        touchAction: "none",
      }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setBit(bit, true);
      }}
      onPointerUp={() => setBit(bit, false)}
      onPointerCancel={() => setBit(bit, false)}
    >
      {label}
    </button>
  );
}

function TriggerButton({ label, onValue }: { label: string; onValue: (v: number) => void }) {
  return (
    <button
      type="button"
      style={{
        minWidth: 48,
        height: 40,
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.2)",
        background: "rgba(255,255,255,0.08)",
        color: "#f2efe8",
        fontWeight: 600,
        touchAction: "none",
      }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onValue(1);
      }}
      onPointerUp={() => onValue(0)}
      onPointerCancel={() => onValue(0)}
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

  const move = (clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const max = r.width * 0.35;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const mag = Math.hypot(dx, dy) || 1;
    if (mag > max) {
      dx = (dx / mag) * max;
      dy = (dy / mag) * max;
    }
    const x = dx / max;
    const y = dy / max;
    setKnob({ x: dx, y: dy });
    onChange(clamp(x, -1, 1), clamp(y, -1, 1));
  };

  const end = () => {
    setKnob({ x: 0, y: 0 });
    onChange(0, 0);
  };

  return (
    <div
      ref={ref}
      style={stickWellStyle}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (e.buttons || e.pressure > 0) move(e.clientX, e.clientY);
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div
        style={{
          ...stickKnobStyle,
          transform: `translate(${knob.x}px, ${knob.y}px)`,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function DPad({ setBit }: { setBit: (bit: number, down: boolean) => void }) {
  const cell = (_label: string, _bit: number): CSSProperties => ({
    width: 44,
    height: 44,
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.07)",
    color: "#f2efe8",
    fontWeight: 700,
  });
  const Btn = ({ label, bit }: { label: string; bit: number }) => (
    <button
      type="button"
      style={cell(label, bit)}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setBit(bit, true);
      }}
      onPointerUp={() => setBit(bit, false)}
      onPointerCancel={() => setBit(bit, false)}
    >
      {label}
    </button>
  );
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "44px 44px 44px",
        gridTemplateRows: "44px 44px 44px",
        gap: 6,
        justifyContent: "center",
        marginTop: 8,
      }}
    >
      <span />
      <Btn label="▲" bit={BUTTON.DPAD_UP} />
      <span />
      <Btn label="◀" bit={BUTTON.DPAD_LEFT} />
      <span />
      <Btn label="▶" bit={BUTTON.DPAD_RIGHT} />
      <span />
      <Btn label="▼" bit={BUTTON.DPAD_DOWN} />
      <span />
    </div>
  );
}

const titleStyle: CSSProperties = { margin: 0, fontSize: "1.6rem" };
const eyebrowStyle: CSSProperties = {
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  opacity: 0.55,
  fontSize: 11,
  margin: 0,
};
const rootPadStyle: CSSProperties = {
  minHeight: "100dvh",
  background: "#0b0a10",
  color: "#f2efe8",
  padding: "12px 16px calc(12px + env(safe-area-inset-bottom))",
  display: "flex",
  flexDirection: "column",
  gap: 10,
  boxSizing: "border-box",
};
const topBarStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
};
const padGridStyle: CSSProperties = {
  flex: 1,
  display: "grid",
  gridTemplateColumns: "1fr auto 1fr",
  alignItems: "center",
  gap: 12,
  minHeight: 200,
};
const faceClusterStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 10,
};
const shoulderRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "center",
  flexWrap: "wrap",
  gap: 8,
};
const stickWellStyle: CSSProperties = {
  width: 130,
  height: 130,
  borderRadius: "50%",
  margin: "0 auto",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.12)",
  position: "relative",
  touchAction: "none",
};
const stickKnobStyle: CSSProperties = {
  position: "absolute",
  left: "50%",
  top: "50%",
  width: 54,
  height: 54,
  marginLeft: -27,
  marginTop: -27,
  borderRadius: "50%",
  background: "rgba(255,255,255,0.16)",
  display: "grid",
  placeItems: "center",
  fontWeight: 700,
  fontSize: 14,
};
const toggleOn: CSSProperties = {
  border: "1px solid #9ad0ff",
  background: "rgba(154,208,255,0.15)",
  color: "#9ad0ff",
  borderRadius: 999,
  padding: "8px 14px",
  fontWeight: 600,
};
const toggleOff: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.2)",
  background: "transparent",
  color: "#f2efe8",
  borderRadius: 999,
  padding: "8px 14px",
  fontWeight: 600,
  opacity: 0.7,
};
