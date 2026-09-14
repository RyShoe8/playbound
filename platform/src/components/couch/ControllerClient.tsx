"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BUTTON } from "@/lib/couch/protocol";
import {
  applyKeyboardMouseEvent,
  emptyPadAxes,
  KEYBOARD_MOUSE_HELP,
} from "@/lib/couch/keyboardMouseMap";
import { CADENCE } from "@/lib/realtime/cadence";
import { couchControllerJoinLabel, type CouchControlChoice } from "@/lib/couch/joinLabel";
import {
  addRemoteIceCandidate,
  iceServersIncludeTurn,
  isPublicHttpsOrigin,
} from "@/lib/couch/rtcSignal";

type InputMode = "keyboard-mouse" | "touch-gamepad" | "standard-gamepad";

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

export function ControllerClient({
  code,
  layout = "default",
}: {
  code: string;
  /** Full-window game view for Join online (separate popup), not the small embedded phone frame. */
  layout?: "default" | "game";
}) {
  const gameLayout = layout === "game";
  const [error, setError] = useState<string | null>(null);
  const [join, setJoin] = useState<JoinState | null>(null);
  /**
   * Game-view joiners pick the same three options as the launcher Input Setup:
   * keyboard, controller, or phone. Phone pads still open the default layout (QR).
   */
  const [controlChoice, setControlChoice] = useState<CouchControlChoice>(() => {
    // Default layout is already the phone/touch pad — no chooser needed.
    if (!gameLayout) return "keyboard";
    return "undecided";
  });
  // Phones scanning the QR want the touch pad, not keyboard+stream chrome.
  const [mode, setMode] = useState<InputMode>(() => {
    if (typeof window === "undefined") return "keyboard-mouse";
    try {
      const coarse =
        window.matchMedia?.("(pointer: coarse)").matches ||
        (navigator.maxTouchPoints ?? 0) > 0;
      if (coarse && !gameLayout) return "touch-gamepad";
    } catch {
      /* ignore */
    }
    return "keyboard-mouse";
  });
  const [transport, setTransport] = useState<Transport>("connecting");
  const [connectHint, setConnectHint] = useState<string | null>(null);
  const [pingMs, setPingMs] = useState<number | null>(null);
  const [hz, setHz] = useState(0);
  const [physicalLabel, setPhysicalLabel] = useState<string | null>(null);

  // Twin Stick Mode (default off for massive face buttons in couch/action games)
  const [twinStick, setTwinStick] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem("playbound.couch.twinStick") === "true";
    } catch {
      return false;
    }
  });
  const [showLeftStick, setShowLeftStick] = useState<boolean>(() => {
    try {
      return localStorage.getItem("playbound.couch.show-left-stick") !== "false";
    } catch {
      return true;
    }
  });

  const padRef = useRef<PadState>({ ...EMPTY });
  const seqRef = useRef(0);
  const sendFnRef = useRef<(obj: unknown) => void>(() => {});
  const lastSentRef = useRef(0);
  const lastPadKeyRef = useRef("");
  const framesRef = useRef(0);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const [hasVideo, setHasVideo] = useState(false);
  const [videoWaiting, setVideoWaiting] = useState(false);
  const videoFrameWatchRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [cropTitleBar, setCropTitleBar] = useState(true);
  const [hudVisible, setHudVisible] = useState(true);
  const hudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange);
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        const root = document.documentElement;
        if (root.requestFullscreen) {
          await root.requestFullscreen();
        } else if ((root as unknown as { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen) {
          await (root as unknown as { webkitRequestFullscreen: () => Promise<void> }).webkitRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as unknown as { webkitExitFullscreen?: () => Promise<void> }).webkitExitFullscreen) {
          await (document as unknown as { webkitExitFullscreen: () => Promise<void> }).webkitExitFullscreen();
        }
      }
    } catch (err) {
      console.warn("Fullscreen toggle failed:", err);
    }
  }, []);

  const resetHudTimer = useCallback(() => {
    setHudVisible(true);
    if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    hudTimerRef.current = setTimeout(() => {
      setHudVisible(false);
    }, 3000);
  }, []);

  useEffect(() => {
    if (!gameLayout) return;
    const onMove = () => resetHudTimer();
    window.addEventListener("mousemove", onMove);
    resetHudTimer();
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    };
  }, [gameLayout, resetHudTimer]);

  function clearVideoFrameWatch() {
    if (videoFrameWatchRef.current) {
      clearInterval(videoFrameWatchRef.current);
      videoFrameWatchRef.current = null;
    }
  }

  function attachRemoteStream(stream: MediaStream) {
    remoteStreamRef.current = stream;
    const el = videoRef.current;
    if (el && el.srcObject !== stream) {
      el.srcObject = stream;
      void el.play().catch(() => {});
    }
    clearVideoFrameWatch();
    setVideoWaiting(true);
    setHasVideo(false);
    const track = stream.getVideoTracks()[0];

    const markLive = () => {
      const v = videoRef.current;
      // Dark game menus are common — do not treat low luminance as "blank capture".
      // Only wait until the decoder reports real dimensions.
      if (!v || v.videoWidth <= 0 || v.videoHeight <= 0) return false;
      setHasVideo(true);
      setVideoWaiting(false);
      clearVideoFrameWatch();
      return true;
    };
    if (track) {
      track.onunmute = () => {
        void videoRef.current?.play().catch(() => {});
        markLive();
      };
    }
    videoFrameWatchRef.current = setInterval(() => {
      if (markLive()) return;
      const v = videoRef.current;
      if (v) void v.play().catch(() => {});
    }, 400);
    window.setTimeout(() => {
      markLive();
    }, 80);
  }

  function bindVideoEl(el: HTMLVideoElement | null) {
    videoRef.current = el;
    const stream = remoteStreamRef.current;
    if (el && stream && el.srcObject !== stream) {
      el.srcObject = stream;
      void el.play().catch(() => {});
    }
  }

  const playerLabel = useMemo(() => {
    if (join?.playerSlot == null) return "…";
    return `Player ${join.playerSlot + 1}`;
  }, [join?.playerSlot]);

  const sendInput = useCallback((opts?: { force?: boolean }) => {
    const j = join;
    if (!j || j.status !== "approved" || j.playerSlot == null || !j.sessionToken) return;
    const pad = padRef.current;
    const key = [
      pad.buttons >>> 0,
      Math.round(pad.lx * 1000),
      Math.round(pad.ly * 1000),
      Math.round(pad.rx * 1000),
      Math.round(pad.ry * 1000),
      Math.round(pad.lt * 255),
      Math.round(pad.rt * 255),
    ].join("|");
    // Skip unchanged reports (host ViGEm already dedupes; this cuts wire + IPC).
    if (!opts?.force && key === lastPadKeyRef.current) return;
    lastPadKeyRef.current = key;
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

  const toggleTwinStick = () => {
    setTwinStick((prev) => {
      const next = !prev;
      try {
        sessionStorage.setItem("playbound.couch.twinStick", String(next));
      } catch {
        /* ignore */
      }
      if (!next) {
        padRef.current.rx = 0;
        padRef.current.ry = 0;
        sendInput();
      }
      return next;
    });
  };

  const toggleLeftStick = () => {
    setShowLeftStick((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("playbound.couch.show-left-stick", String(next));
      } catch {
        /* ignore */
      }
      if (!next) {
        padRef.current.lx = 0;
        padRef.current.ly = 0;
        sendInput();
      }
      return next;
    });
  };

  const joinDisplayLabel = useMemo(
    () =>
      couchControllerJoinLabel({
        mode,
        gameLayout,
        controlChoice,
        gamepadId: physicalLabel,
      }),
    [mode, gameLayout, controlChoice, physicalLabel]
  );

  // Join / reconnect (profile changes do not create a new controller)
  useEffect(() => {
    let cancelled = false;
    async function run() {
      setError(null);
      const stored = loadStored(code);
      const label = couchControllerJoinLabel({
        mode,
        gameLayout,
        controlChoice,
        gamepadId: null,
      });
      try {
        const res = await fetch(`/api/couch/sessions/${encodeURIComponent(code)}/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label,
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
          iceServers:
            data.iceServers && data.iceServers.length > 0
              ? data.iceServers
              : [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }],
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
  }, [code, mode, gameLayout, controlChoice]);

  // Refresh controller row label when PC/gamepad choice becomes known.
  useEffect(() => {
    if (!join?.controllerId || !join?.controllerToken) return;
    const { controllerId, controllerToken } = join;
    async function syncLabel() {
      try {
        await fetch(`/api/couch/sessions/${encodeURIComponent(code)}/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label: joinDisplayLabel,
            deviceLabel: physicalLabel || undefined,
            profile: mode,
            controllerId,
            controllerToken,
          }),
        });
      } catch {
        /* ignore */
      }
    }
    void syncLabel();
  }, [
    code,
    join?.controllerId,
    join?.controllerToken,
    joinDisplayLabel,
    physicalLabel,
    mode,
  ]);

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
            iceServers:
              data.iceServers && data.iceServers.length > 0
                ? data.iceServers
                : prev.iceServers,
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
      // Receive host game view when the host shares their display.
      pc.addTransceiver("video", { direction: "recvonly" });

      pc.onconnectionstatechange = () => {
        const state = pc?.connectionState;
        if (state === "connected") {
          usingWebrtc = true;
          setTransport("webrtc");
        } else if (state === "failed") {
          console.warn("[couch] WebRTC connection failed, attempting ICE restart...");
          try {
            pc?.restartIce();
            void (async () => {
              if (!pc) return;
              const offer = await pc.createOffer({ iceRestart: true });
              await pc.setLocalDescription(offer);
              await postSignal({
                kind: "offer",
                sdp: offer,
                from: session.controllerId,
                playerSlot: session.playerSlot,
              });
            })();
          } catch {
            if (!ws) void startWsFallback();
          }
        }
      };

      pc.oniceconnectionstatechange = () => {
        const ice = pc?.iceConnectionState;
        if (ice === "connected" || ice === "completed") {
          usingWebrtc = true;
          setTransport("webrtc");
        }
      };

      pc.ontrack = (ev) => {
        usingWebrtc = true;
        setTransport("webrtc");
        const stream = ev.streams?.[0] || (ev.track ? new MediaStream([ev.track]) : null);
        if (stream) attachRemoteStream(stream);
      };
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
        void postSignal(
          ev.candidate
            ? { kind: "ice", candidate: ev.candidate, from: session.controllerId }
            : { kind: "ice", complete: true, from: session.controllerId }
        );
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await postSignal({
        kind: "offer",
        sdp: offer,
        from: session.controllerId,
        playerSlot: session.playerSlot,
      });

      /*
       * Same bursty pattern as the host: fast while handshake messages arrive,
       * then idle. Flat 500ms forever wasted ~120 empty GETs/min after connect.
       */
      const SIGNAL_ACTIVE_MS = CADENCE.couchSignalActiveMs;
      const SIGNAL_IDLE_MS = CADENCE.couchSignalIdleMs;
      const SIGNAL_IDLE_AFTER = CADENCE.couchSignalIdleAfterEmptyPolls;
      let emptySignalPolls = 0;
      let signalPollMs = SIGNAL_ACTIVE_MS;

      const pollSignalsOnce = async () => {
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
          const messages = data.messages || [];
          if (messages.length > 0) {
            emptySignalPolls = 0;
            if (signalPollMs !== SIGNAL_ACTIVE_MS) {
              signalPollMs = SIGNAL_ACTIVE_MS;
              if (pollTimer) window.clearInterval(pollTimer);
              pollTimer = window.setInterval(() => {
                void pollSignalsOnce();
              }, SIGNAL_ACTIVE_MS);
            }
          } else {
            emptySignalPolls += 1;
            if (
              emptySignalPolls >= SIGNAL_IDLE_AFTER &&
              signalPollMs !== SIGNAL_IDLE_MS
            ) {
              signalPollMs = SIGNAL_IDLE_MS;
              if (pollTimer) window.clearInterval(pollTimer);
              pollTimer = window.setInterval(() => {
                void pollSignalsOnce();
              }, SIGNAL_IDLE_MS);
            }
          }
          for (const m of messages) {
            signalSince = Math.max(signalSince, m.timestamp || 0);
            let payload: {
              kind?: string;
              sdp?: RTCSessionDescriptionInit;
              candidate?: RTCIceCandidateInit | null;
              complete?: boolean;
              to?: string;
            };
            try {
              payload = JSON.parse(m.payload);
            } catch {
              continue;
            }
            if (payload.to && payload.to !== session.controllerId) continue;
            if (payload.kind === "offer" && payload.sdp && pc) {
              try {
                await pc.setRemoteDescription(payload.sdp);
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                await postSignal({
                  kind: "answer",
                  sdp: answer,
                  from: session.controllerId,
                });
                usingWebrtc = true;
                setTransport("webrtc");
              } catch {
                /* ignore renegotiation races */
              }
            }
            if (payload.kind === "answer" && payload.sdp && pc.signalingState !== "stable") {
              await pc.setRemoteDescription(payload.sdp);
            }
            if (payload.kind === "ice") {
              await addRemoteIceCandidate(pc, payload.candidate, payload.complete);
            }
          }
        } catch {
          /* ignore */
        }
      };

      pollTimer = window.setInterval(() => {
        void pollSignalsOnce();
      }, SIGNAL_ACTIVE_MS);

      // Check if local WebSocket fallback exists (LAN or localhost)
      const candidateUrls = session.wsUrls || [];
      const hasWsCandidates = candidateUrls.some(
        (u) =>
          typeof window === "undefined" ||
          window.location.protocol !== "https:" ||
          u.startsWith("wss://") ||
          u.startsWith("ws://127.0.0.1") ||
          u.startsWith("ws://localhost")
      );

      if (hasWsCandidates) {
        window.setTimeout(() => {
          if (!closed && !usingWebrtc && !ws) void startWsFallback();
        }, 5000);
      }

      function markOfflineIfFailed() {
        if (closed || usingWebrtc || ws?.readyState === WebSocket.OPEN) return;
        const ice = pc?.iceConnectionState;
        const conn = pc?.connectionState;
        if (ice !== "failed" && conn !== "failed" && ice !== "disconnected") return;
        if (isPublicHttpsOrigin() && !iceServersIncludeTurn(session.iceServers)) {
          setConnectHint(
            " Browser blocked direct LAN access from playbound.club — open game view from the PlayBound launcher popup, or ensure Connect TURN is configured."
          );
        } else {
          setConnectHint(null);
        }
        setTransport("offline");
      }

      // Give ICE time on LAN; only fail once the peer connection is actually failed.
      window.setTimeout(() => {
        markOfflineIfFailed();
      }, 45_000);
    }

    async function startWsFallback() {
      if (ws || closed) return;
      const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
      const candidateUrls = session.wsUrls || [];
      const urls = candidateUrls.filter((u) => {
        if (!isHttps) return true;
        // On HTTPS pages, connecting to plain ws:// on remote hosts triggers mixed-content warnings ("Not secure")
        // and is blocked by modern browsers. Only allow wss:// or loopback ws://.
        if (u.startsWith("wss://")) return true;
        if (u.startsWith("ws://127.0.0.1") || u.startsWith("ws://localhost")) return true;
        return false;
      });
        if (!urls.length || !session.wsToken) {
        if (!usingWebrtc && (pc?.connectionState === "failed" || pc?.iceConnectionState === "failed")) {
          if (isPublicHttpsOrigin() && !iceServersIncludeTurn(session.iceServers)) {
            setConnectHint(
              " Browser blocked direct LAN access from playbound.club — open game view from the PlayBound launcher popup, or ensure Connect TURN is configured."
            );
          }
          setTransport("offline");
        }
        return;
      }
      let idx = 0;
      const tryNext = () => {
        if (closed || idx >= urls.length) {
          if (!usingWebrtc) setTransport("offline");
          return;
        }
        const raw = urls[idx++]!;
        const url = session.wsToken
          ? `${raw}${raw.includes("?") ? "&" : "?"}token=${encodeURIComponent(session.wsToken)}`
          : raw;
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

    // rAF + change detection instead of a blind 60Hz setInterval.
    let raf = 0;
    let lastForce = performance.now();
    const tick = (now: number) => {
      // Heartbeat every 250ms so the host knows the pad is alive even when idle.
      const force = now - lastForce >= 250;
      if (force) lastForce = now;
      sendInput(force ? { force: true } : undefined);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      closed = true;
      if (pollTimer) window.clearInterval(pollTimer);
      if (pingTimer) window.clearInterval(pingTimer);
      if (hzTimer) window.clearInterval(hzTimer);
      cancelAnimationFrame(raf);
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
      clearVideoFrameWatch();
    };
  }, [join, mode, sendInput]);

  // Physical gamepad polling
  useEffect(() => {
    const usePad =
      mode === "standard-gamepad" || (gameLayout && controlChoice === "controller");
    if (!usePad) {
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
        // In game-view PC mode, keyboard owns the pad when no hardware pad is
        // connected — clearing here would wipe every keypress every frame.
        if (mode === "standard-gamepad") {
          padRef.current = { ...EMPTY };
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mode, gameLayout, controlChoice]);

  // Keyboard & mouse → virtual pad (default join mode)
  useEffect(() => {
    if (mode !== "keyboard-mouse") return;
    if (controlChoice === "phone") return;
    const heldMove = { up: false, down: false, left: false, right: false };
    padRef.current = emptyPadAxes();

    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.repeat && e.type === "keydown") return;
      const next = applyKeyboardMouseEvent(padRef.current, heldMove, {
        type: e.type === "keyup" ? "keyup" : "keydown",
        code: e.code,
      });
      padRef.current = next;
      e.preventDefault();
      sendInput();
    };
    const onMouse = (e: MouseEvent) => {
      if (e.button > 2) return;
      const next = applyKeyboardMouseEvent(padRef.current, heldMove, {
        type: e.type === "mouseup" ? "mouseup" : "mousedown",
        button: e.button,
      });
      padRef.current = next;
      if (e.button === 2) e.preventDefault();
      sendInput();
    };
    const onContext = (e: Event) => e.preventDefault();

    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("mousedown", onMouse);
    window.addEventListener("mouseup", onMouse);
    window.addEventListener("contextmenu", onContext);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("mousedown", onMouse);
      window.removeEventListener("mouseup", onMouse);
      window.removeEventListener("contextmenu", onContext);
      padRef.current = { ...EMPTY };
    };
  }, [mode, controlChoice, sendInput]);

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

  if (gameLayout && controlChoice === "undecided") {
    return (
      <Shell tone="setup">
        <Eyebrow>Input Setup</Eyebrow>
        <h1 className="pbc-title">How do you want to play?</h1>
        <p className="pbc-sub pbc-sub-wide">
          Joining <strong>{join.hostLabel}</strong>&apos;s game view — same three options as the
          PlayBound launcher.
        </p>
        <div className="pbc-choice-row pbc-choice-row-h">
          <button
            type="button"
            className="pbc-choice-btn"
            onClick={() => {
              setMode("keyboard-mouse");
              setControlChoice("keyboard");
            }}
          >
            <span className="pbc-choice-icon" aria-hidden>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <rect x="2" y="6" width="20" height="12" rx="2" />
                <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9 14h6" />
              </svg>
            </span>
            <strong>Mouse and Keyboard</strong>
            <span>Keys and mouse on this computer</span>
          </button>
          <button
            type="button"
            className="pbc-choice-btn"
            onClick={() => {
              setMode("standard-gamepad");
              setControlChoice("controller");
            }}
          >
            <span className="pbc-choice-icon" aria-hidden>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <rect x="2" y="6" width="20" height="12" rx="2" />
                <path d="M6 12h4M8 10v4M15 11h.01M18 13h.01" />
              </svg>
            </span>
            <strong>Controller</strong>
            <span>Xbox, DualSense, Switch, or USB pad</span>
          </button>
          <button
            type="button"
            className="pbc-choice-btn is-featured"
            onClick={() => setControlChoice("phone")}
          >
            <span className="pbc-choice-icon" aria-hidden>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <rect x="7" y="2" width="10" height="20" rx="2" />
                <path d="M11 18h2" />
              </svg>
            </span>
            <strong>Phone as Controller</strong>
            <span>Scan a QR — no app needed</span>
          </button>
        </div>
      </Shell>
    );
  }

  if (mode === "standard-gamepad" && !gameLayout) {
    return (
      <Shell>
        <Eyebrow>{playerLabel}</Eyebrow>
        <h1 className="pbc-title">{physicalLabel || "Connect a controller"}</h1>
        <p className="pbc-sub">
          Pair an Xbox, DualSense, Switch, 8BitDo or other browser-supported pad to this device.
          PlayBound forwards it to the PC.
        </p>
        <div className={physicalLabel ? "pbc-dot pbc-dot-live" : "pbc-dot"} aria-hidden />
        <StatusBar transport={transport} pingMs={pingMs} hz={hz} />
        <ModeToggle mode={mode} setMode={setMode} />
      </Shell>
    );
  }

  if (mode === "keyboard-mouse" || gameLayout) {
    const phoneJoinUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/c/${encodeURIComponent(code)}`
        : `https://playbound.club/c/${encodeURIComponent(code)}`;
    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
      phoneJoinUrl
    )}`;
    return (
      <main
        className={[
          hasVideo ? "pbc-pad is-kbm is-gameview" : "pbc-pad is-kbm",
          gameLayout ? "is-popup-game" : "",
          isFullscreen ? "is-fullscreen" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <ControllerStyles />
        <div
          className={hasVideo ? "pbc-gameview is-live" : "pbc-gameview"}
          aria-hidden={!hasVideo}
          onDoubleClick={gameLayout ? toggleFullscreen : undefined}
        >
          <video
            ref={bindVideoEl}
            className={["pbc-gameview-video", cropTitleBar ? "is-cropped" : ""].filter(Boolean).join(" ")}
            playsInline
            muted
            autoPlay
          />
          {!hasVideo ? (
            <p className="pbc-gameview-wait">
              {videoWaiting
                ? "Connected — waiting for the first video frame from the host…"
                : transport === "webrtc" || transport === "websocket"
                  ? "Waiting for host game view… host may still be launching — keep this window open"
                  : transport === "connecting"
                    ? "Connecting to host…"
                    : transport === "offline"
                      ? connectHint || "Can't reach host (network)"
                      : "Waiting for host game view…"}
            </p>
          ) : null}
        </div>
        <header
          className={["pbc-hud", !hudVisible && gameLayout ? "is-hidden" : ""].filter(Boolean).join(" ")}
        >
          <span className="pbc-hud-host">{join.hostLabel}</span>
          <span className="pbc-hud-player">{playerLabel}</span>
          {gameLayout ? (
            <>
              <button
                type="button"
                className={`pbc-hud-fs ${cropTitleBar ? "is-active" : ""}`}
                onClick={() => setCropTitleBar((prev) => !prev)}
                title="Crop out window title bar / program bar"
              >
                {cropTitleBar ? "Crop Bar: ON" : "Crop Bar: OFF"}
              </button>
              <button
                type="button"
                className="pbc-hud-fs"
                onClick={toggleFullscreen}
              >
                {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              </button>
            </>
          ) : null}
        </header>
        {gameLayout ? (
          <div
            className="pbc-rtt-pin"
            title="Pad round-trip to host (network). High values feel like input lag."
          >
            {pingMs != null ? `${pingMs.toFixed(0)}ms` : "…ms"}
            {hz > 0 ? ` · ${hz}Hz` : ""}
          </div>
        ) : null}
        {gameLayout && controlChoice === "phone" ? (
          <div className="pbc-phone-qr">
            <img src={qrSrc} alt="QR code to open the phone controller" width={220} height={220} />
            <p className="pbc-sub">
              Scan with your phone — this window stays the game view. Code{" "}
              <strong>{code}</strong>
            </p>
            <button
              type="button"
              className="pbc-choice-btn"
              onClick={() => setControlChoice("undecided")}
            >
              Choose controls again
            </button>
          </div>
        ) : null}
        {!gameLayout || !hasVideo ? (
          <div className="pbc-kbm-panel">
            <h1 className="pbc-title">Keyboard &amp; mouse</h1>
            <p className="pbc-sub">{KEYBOARD_MOUSE_HELP}</p>
            <p className="pbc-sub">Need a pad? Switch to Touch or Pad below.</p>
          </div>
        ) : null}
        {!gameLayout ? <StatusBar transport={transport} pingMs={pingMs} hz={hz} /> : null}
        {!gameLayout ? <ModeToggle mode={mode} setMode={setMode} /> : null}
      </main>
    );
  }

  /* ── The Pad ─────────────────────────────────────────────────────────── */

  return (
    <main
      className={[
        "pbc-pad",
        twinStick ? "is-twin-stick" : "",
        hasVideo ? "is-gameview" : "",
        gameLayout ? "is-popup-game" : "",
        isFullscreen ? "is-fullscreen" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <ControllerStyles />

      {/* Host game view (P2P) — online multiplayer for local-only games */}
      <div
        className={hasVideo ? "pbc-gameview is-live" : "pbc-gameview"}
        aria-hidden={!hasVideo}
        onDoubleClick={gameLayout ? toggleFullscreen : undefined}
      >
        <video
          ref={bindVideoEl}
          className={["pbc-gameview-video", cropTitleBar ? "is-cropped" : ""].filter(Boolean).join(" ")}
          playsInline
          muted
          autoPlay
        />
        {!hasVideo ? (
          <p className="pbc-gameview-wait">
            {videoWaiting
              ? "Connected — waiting for the first video frame from the host…"
              : transport === "webrtc" || transport === "websocket"
                ? "Waiting for host game view… host may still be launching — keep this window open"
                : transport === "connecting"
                  ? "Connecting to host…"
                  : transport === "offline"
                    ? connectHint || "Can't reach host (network)"
                    : "Waiting for host game view…"}
          </p>
        ) : null}
      </div>

      {/* Three-zone background ambient glow */}
      <div className="pbc-ambient pbc-ambient-left" aria-hidden />
      <div className="pbc-ambient pbc-ambient-right" aria-hidden />

      {/* Portrait rotation nudge */}
      <div className="pbc-rotate" aria-hidden>
        <span className="pbc-rotate-icon">⟳</span>
        Turn sideways for landscape
      </div>

      {/* Center Top HUD Telemetry */}
      <header className="pbc-hud">
        <span className="pbc-hud-host">{join.hostLabel}</span>
        <span className="pbc-hud-sep" aria-hidden>
          ·
        </span>
        <span className="pbc-hud-player">{playerLabel}</span>
        <StatusBar transport={transport} pingMs={pingMs} hz={hz} />
      </header>

      {/* Shoulders docked in the upper corners */}
      <div className="pbc-shoulder pbc-shoulder-left">
        <TriggerButton
          label="LT"
          onValue={(v) => {
            padRef.current.lt = v;
            sendInput();
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
            sendInput();
          }}
        />
      </div>

      {/* Left Thumb Zone: Movement (Left Stick + D-Pad) */}
      <div className={showLeftStick ? "pbc-zone pbc-zone-left" : "pbc-zone pbc-zone-left is-stickless"}>
        {showLeftStick && (
          <AnalogStick
            label="L"
            onChange={(x, y) => {
              padRef.current.lx = x;
              padRef.current.ly = y;
            }}
          />
        )}
        <DPad setBit={setBit} />
      </div>

      {/* Right Thumb Zone: Action (Face Buttons + Optional Right Stick) anchored at bottom-right */}
      <div className="pbc-zone pbc-zone-right">
        {twinStick && (
          <AnalogStick
            label="R"
            onChange={(x, y) => {
              padRef.current.rx = x;
              padRef.current.ry = y;
            }}
          />
        )}
        <FaceCluster setBit={setBit} />
      </div>

      {/* Menu / System utility bar docked center-bottom */}
      <div className="pbc-menu">
        <HoldButton label="◀" bit={BUTTON.BACK} setBit={setBit} title="Back / Select" />
        
        {/* Layout quick toggle: Action vs Twin Stick */}
        <button
          type="button"
          className={twinStick ? "pbc-twin-btn is-active" : "pbc-twin-btn"}
          onClick={toggleTwinStick}
          aria-label={twinStick ? "Twin Stick Mode: On" : "Action Mode: Right Stick Off"}
          title="Toggle Right Analog Stick"
        >
          <span className="pbc-twin-icon" aria-hidden>
            {twinStick ? "🕹️" : "⚡"}
          </span>
          <span className="pbc-twin-text">{twinStick ? "Twin Stick" : "Action"}</span>
        </button>

        <ModeToggle mode={mode} setMode={setMode} compact />
        <button
          type="button"
          className={showLeftStick ? "pbc-twin-btn is-active" : "pbc-twin-btn"}
          onClick={toggleLeftStick}
          aria-pressed={showLeftStick}
          title="Show or hide the left analog stick"
        >
          <span className="pbc-twin-icon" aria-hidden>🕹️</span>
          <span className="pbc-twin-text">L stick</span>
        </button>
        <HoldButton label="▶" bit={BUTTON.START} setBit={setBit} title="Start / Menu" />
      </div>
    </main>
  );
}

/* ── Chrome ──────────────────────────────────────────────────────────── */

function Shell({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "bad" | "setup";
}) {
  return (
    <main
      className={[
        "pbc-shell",
        tone === "bad" ? "pbc-shell-bad" : "",
        tone === "setup" ? "pbc-shell-setup" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
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
  mode: InputMode;
  setMode: (m: InputMode) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "pbc-toggle pbc-toggle-compact" : "pbc-toggle"}>
      <button
        type="button"
        className={mode === "keyboard-mouse" ? "pbc-toggle-btn is-on" : "pbc-toggle-btn"}
        onClick={() => setMode("keyboard-mouse")}
      >
        Keys
      </button>
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
 * A short haptic tap through the phone's vibration motor.
 * Guarded against browsers/platforms (like iOS Safari) where navigator.vibrate is absent or restricted.
 */
function tap(ms = 10) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* no motor, or blocked */
  }
}

/** Shared press wiring: pointer capture, haptics, and instant visual state. */
function pressProps(down: () => void, up: () => void) {
  return {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      e.currentTarget.classList.add("is-down");
      tap(10);
      down();
    },
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        /* ignore */
      }
      e.currentTarget.classList.remove("is-down");
      up();
    },
    onPointerCancel: (e: React.PointerEvent<HTMLElement>) => {
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        /* ignore */
      }
      e.currentTarget.classList.remove("is-down");
      up();
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
}

const FACE = [
  { label: "Y", bit: BUTTON.Y, hue: "var(--pbc-y)", btn: "Y" },
  { label: "X", bit: BUTTON.X, hue: "var(--pbc-x)", btn: "X" },
  { label: "B", bit: BUTTON.B, hue: "var(--pbc-b)", btn: "B" },
  { label: "A", bit: BUTTON.A, hue: "var(--pbc-a)", btn: "A" },
] as const;

function FaceCluster({ setBit }: { setBit: (bit: number, down: boolean) => void }) {
  return (
    <div className="pbc-face">
      <div className="pbc-face-diamond" aria-hidden />
      {FACE.map(({ label, bit, hue, btn }) => (
        <button
          key={label}
          type="button"
          aria-label={`Button ${label}`}
          data-btn={btn}
          className="pbc-face-btn"
          style={{ ["--btn" as string]: hue }}
          {...pressProps(
            () => setBit(bit, true),
            () => setBit(bit, false)
          )}
        >
          <span className="pbc-btn-label">{label}</span>
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
      title={title || label}
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
    const max = r.width * 0.36;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const mag = Math.hypot(dx, dy) || 1;
    if (mag > max) {
      dx = (dx / mag) * max;
      dy = (dy / mag) * max;
    }
    
    // Smooth deadzone filtering (6%)
    const normMag = Math.min(1, mag / max);
    const deadzone = 0.06;
    let filteredX = 0;
    let filteredY = 0;
    if (normMag > deadzone) {
      const scaledMag = (normMag - deadzone) / (1 - deadzone);
      filteredX = (dx / mag) * scaledMag;
      filteredY = (dy / mag) * scaledMag;
    }

    setKnob({ x: dx, y: dy });
    onChange(clamp(filteredX, -1, 1), clamp(filteredY, -1, 1));
  };

  const end = (e?: React.PointerEvent<HTMLElement>) => {
    if (e) {
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        /* ignore */
      }
    }
    setActive(false);
    setKnob({ x: 0, y: 0 });
    onChange(0, 0);
  };

  return (
    <div
      ref={ref}
      className={active ? "pbc-stick is-active" : "pbc-stick"}
      onPointerDown={(e) => {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        setActive(true);
        tap(8);
        move(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (active || e.buttons > 0) move(e.clientX, e.clientY);
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="pbc-stick-ring" aria-hidden />
      <span className="pbc-stick-crosshair" aria-hidden />
      <span
        className="pbc-stick-knob"
        style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
      >
        <span className="pbc-stick-label">{label}</span>
      </span>
    </div>
  );
}

const DPAD_KEYS = [
  { label: "▲", bit: BUTTON.DPAD_UP, area: "u", dir: "up" },
  { label: "◀", bit: BUTTON.DPAD_LEFT, area: "l", dir: "left" },
  { label: "▶", bit: BUTTON.DPAD_RIGHT, area: "r", dir: "right" },
  { label: "▼", bit: BUTTON.DPAD_DOWN, area: "d", dir: "down" },
] as const;

function DPad({ setBit }: { setBit: (bit: number, down: boolean) => void }) {
  return (
    <div className="pbc-dpad">
      <span className="pbc-dpad-hub" aria-hidden />
      {DPAD_KEYS.map(({ label, bit, area, dir }) => (
        <button
          key={area}
          type="button"
          aria-label={`D-Pad ${dir}`}
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

function ControllerStyles() {
  return (
    <style>{`
:root {
  /* Align with site tokens (globals.css dark theme) */
  --pbc-ground: oklch(0.165 0.014 278);
  --pbc-ink: oklch(0.96 0.005 280);
  --pbc-muted: oklch(0.68 0.015 280);
  --pbc-line: oklch(1 0 0 / 9%);
  --pbc-raise: oklch(0.21 0.016 278);
  --pbc-raise-2: oklch(0.27 0.02 278);
  --pbc-accent: oklch(0.62 0.21 288);
  --pbc-live: oklch(0.74 0.19 152);
  --pbc-live-fg: oklch(0.17 0.03 155);

  --pbc-a: #3DD68C;
  --pbc-b: #FF5C5C;
  --pbc-x: #38BDF8;
  --pbc-y: #FBBF24;

  --pbc-safe-t: env(safe-area-inset-top, 0px);
  --pbc-safe-r: env(safe-area-inset-right, 0px);
  --pbc-safe-b: env(safe-area-inset-bottom, 0px);
  --pbc-safe-l: env(safe-area-inset-left, 0px);
}

.pbc-shell, .pbc-pad {
  position: fixed;
  inset: 0;
  background:
    radial-gradient(ellipse 80% 50% at 50% -10%, oklch(0.35 0.08 288 / 35%), transparent 55%),
    var(--pbc-ground);
  color: var(--pbc-ink);
  font-family: var(--font-geist-sans), ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
  overscroll-behavior: none;
}

.pbc-shell-setup .pbc-shell-inner {
  max-width: 920px;
  width: min(920px, 94vw);
  margin: 0 auto;
  padding: clamp(28px, 6vh, 56px) 8px;
  text-align: center;
}

.pbc-choice-row {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: min(420px, 92vw);
  margin: 20px auto 0;
}
.pbc-choice-row-h {
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: center;
  align-items: stretch;
  gap: 16px;
  width: 100%;
  max-width: 900px;
  margin: 28px auto 0;
}
.pbc-choice-btn {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  text-align: left;
  padding: 18px 18px 16px;
  border-radius: 12px;
  border: 1px solid var(--pbc-line);
  background: var(--pbc-raise);
  color: inherit;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease;
}
.pbc-choice-row-h .pbc-choice-btn {
  flex: 1 1 240px;
  max-width: 280px;
  min-height: 148px;
}
.pbc-choice-btn:hover {
  border-color: oklch(1 0 0 / 16%);
  background: var(--pbc-raise-2);
  transform: translateY(-1px);
}
.pbc-choice-icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  margin-bottom: 4px;
  border-radius: 10px;
  background: oklch(1 0 0 / 6%);
  color: var(--pbc-ink);
}
.pbc-choice-btn strong {
  font-size: 16px;
  font-weight: 650;
  letter-spacing: -0.02em;
  line-height: 1.25;
}
.pbc-choice-btn > span:last-child {
  font-size: 13px;
  line-height: 1.45;
  color: var(--pbc-muted);
  opacity: 1;
}
.pbc-choice-btn.is-featured {
  border-color: oklch(0.74 0.19 152 / 45%);
  background: oklch(0.74 0.19 152 / 10%);
}
.pbc-choice-btn.is-featured .pbc-choice-icon {
  background: oklch(0.74 0.19 152 / 18%);
  color: var(--pbc-live);
}
.pbc-choice-btn.is-featured:hover {
  border-color: oklch(0.74 0.19 152 / 65%);
  background: oklch(0.74 0.19 152 / 14%);
}

.pbc-sub-wide {
  max-width: 36rem;
  margin-left: auto;
  margin-right: auto;
}
.pbc-sub-wide strong {
  color: var(--pbc-ink);
  font-weight: 600;
}

.pbc-phone-qr {
  position: absolute;
  left: 50%;
  bottom: calc(var(--pbc-safe-b) + 24px);
  transform: translateX(-50%);
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 16px 18px;
  border-radius: 16px;
  background: rgba(8, 8, 12, 0.92);
  border: 1px solid rgba(255,255,255,0.1);
  max-width: min(320px, 92vw);
  text-align: center;
}
.pbc-phone-qr img {
  border-radius: 8px;
  background: #fff;
}

.pbc-pad {
  overflow: hidden;
  touch-action: none;
}

.pbc-gameview {
  position: absolute;
  left: 50%;
  top: calc(var(--pbc-safe-t) + 44px);
  transform: translateX(-50%);
  width: min(92vw, 720px);
  height: min(38vh, 280px);
  border-radius: 12px;
  overflow: hidden;
  background: #050508;
  border: 1px solid rgba(255, 255, 255, 0.08);
  z-index: 2;
  pointer-events: none;
}

/* Fullscreen / popup-game fills 100% of viewport without restriction */
.pbc-pad.is-popup-game .pbc-gameview,
.pbc-pad.is-fullscreen .pbc-gameview,
.pbc-pad:fullscreen .pbc-gameview,
:fullscreen .pbc-gameview {
  position: fixed !important;
  inset: 0 !important;
  left: 0 !important;
  top: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  transform: none !important;
  width: 100vw !important;
  height: 100vh !important;
  max-width: 100vw !important;
  max-height: 100vh !important;
  border-radius: 0 !important;
  border: none !important;
  z-index: 1 !important;
  background: #000 !important;
  pointer-events: auto !important;
  cursor: default;
}

.pbc-pad.is-popup-game .pbc-hud {
  position: fixed;
  top: 14px;
  right: 14px;
  left: auto;
  transform: none;
  background: rgba(10, 10, 16, 0.78);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(12px);
  border-radius: 999px;
  padding: 5px 14px;
  gap: 10px;
  z-index: 10;
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.pbc-pad.is-popup-game .pbc-hud.is-hidden {
  opacity: 0;
  pointer-events: none;
  transform: translateY(-8px);
}

.pbc-pad.is-popup-game .pbc-hud:hover {
  opacity: 1 !important;
  pointer-events: auto !important;
  transform: none !important;
}

.pbc-pad.is-popup-game .pbc-status,
.pbc-pad.is-popup-game .pbc-modes {
  z-index: 3;
}

.pbc-hud-fs {
  margin-left: auto;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.pbc-hud-fs:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.4);
}

.pbc-hud-fs.is-active {
  background: rgba(61, 214, 140, 0.2);
  border-color: rgba(61, 214, 140, 0.6);
  color: #3dd68c;
}

/* Phone pad preview sizes (when NOT in popup or fullscreen) */
.pbc-pad.is-gameview:not(.is-popup-game):not(.is-fullscreen) .pbc-gameview {
  height: min(32vh, 240px);
}
.pbc-pad.is-gameview:not(.is-popup-game):not(.is-fullscreen) .pbc-hud {
  top: calc(var(--pbc-safe-t) + 8px);
}
.pbc-pad.is-kbm:not(.is-popup-game):not(.is-fullscreen) .pbc-gameview {
  top: calc(var(--pbc-safe-t) + 40px);
  height: min(52vh, 420px);
}

.pbc-gameview.is-live {
  border-color: rgba(61, 214, 140, 0.45);
}

.pbc-gameview-video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000;
  transition: transform 0.25s ease-out;
}

/* Scale up and shift video upward to crop out the Windows program/caption bar (~32px) and borders */
.pbc-gameview-video.is-cropped {
  transform: scale(1.05) translateY(-2.2%);
  transform-origin: center center;
}

.pbc-gameview-wait {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  margin: 0;
  padding: 12px;
  text-align: center;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
}

.pbc-kbm-panel {
  position: absolute;
  left: 50%;
  bottom: calc(var(--pbc-safe-b) + 16px);
  transform: translateX(-50%);
  width: min(92vw, 520px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 16px;
  border-radius: 14px;
  background: rgba(8, 8, 12, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.08);
  z-index: 3;
  text-align: center;
}

/* ── Three-Zone Ambient Backdrop ─────────────────────────────────────── */

.pbc-ambient {
  position: absolute;
  pointer-events: none;
  border-radius: 50%;
  filter: blur(50px);
  opacity: 0.85;
  transition: opacity 0.3s ease;
}

/* Left zone: Indigo / Violet movement identity */
.pbc-ambient-left {
  width: clamp(240px, 60vmin, 380px);
  height: clamp(240px, 60vmin, 380px);
  left: -40px;
  bottom: -40px;
  background: radial-gradient(circle, rgba(99, 102, 241, 0.22) 0%, rgba(99, 102, 241, 0.05) 55%, transparent 70%);
}

/* Right zone: Coral / Rose action identity */
.pbc-ambient-right {
  width: clamp(240px, 60vmin, 380px);
  height: clamp(240px, 60vmin, 380px);
  right: -40px;
  bottom: -40px;
  background: radial-gradient(circle, rgba(244, 63, 94, 0.22) 0%, rgba(244, 63, 94, 0.05) 55%, transparent 70%);
}

/* ── Hit-Slop Expansion on all interactive controls ─────────────────── */

.pbc-face-btn::before {
  content: "";
  position: absolute;
  inset: -6px;
  border-radius: inherit;
  z-index: 1;
}

.pbc-bumper::before,
.pbc-trigger::before,
.pbc-dpad-key::before,
.pbc-twin-btn::before,
.pbc-toggle-btn::before {
  content: "";
  position: absolute;
  inset: -14px;
  border-radius: inherit;
  z-index: 1;
}

/* ── Connection Screens ─────────────────────────────────────────────── */

.pbc-shell {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-y;
  padding: calc(var(--pbc-safe-t) + 16px) calc(var(--pbc-safe-r) + 16px) calc(var(--pbc-safe-b) + 16px) calc(var(--pbc-safe-l) + 16px);
  box-sizing: border-box;
}

.pbc-shell-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  text-align: center;
  max-width: 38ch;
  width: 100%;
  margin: auto;
}

.pbc-shell-bad {
  background: radial-gradient(120% 90% at 50% -10%, rgba(255, 92, 92, 0.20), transparent 62%), var(--pbc-ground);
}

.pbc-eyebrow {
  margin: 0 0 10px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .16em;
  text-transform: uppercase;
  color: var(--pbc-accent);
}

.pbc-title {
  margin: 0;
  font-size: clamp(26px, 4vw, 36px);
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.03em;
  text-wrap: balance;
}

.pbc-sub {
  margin: 12px 0 0;
  color: var(--pbc-muted);
  font-size: 15px;
  line-height: 1.55;
}

.pbc-code {
  margin: 6px 0 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: .38em;
  color: var(--pbc-accent);
  padding: 6px 14px;
  border-radius: 8px;
  background: rgba(139, 109, 255, 0.10);
  border: 1px solid rgba(139, 109, 255, 0.25);
}

.pbc-pulse {
  width: 76px;
  height: 76px;
  border-radius: 50%;
  margin-bottom: 6px;
  background: radial-gradient(circle, rgba(139, 109, 255, 0.6), transparent 68%);
  animation: pbc-breathe 2.4s ease-in-out infinite;
}

@keyframes pbc-breathe {
  0%, 100% { transform: scale(.86); opacity: .55; }
  50%      { transform: scale(1.08); opacity: 1; }
}

.pbc-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--pbc-muted);
  box-shadow: 0 0 0 4px rgba(255,255,255,.06);
}

.pbc-dot-live {
  background: var(--pbc-live);
  box-shadow: 0 0 0 4px rgba(61,214,140,.20), 0 0 12px var(--pbc-live);
}

/* ── Telemetry Status Bar ─────────────────────────────────────────────── */

.pbc-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  font-weight: 600;
  color: var(--pbc-muted);
  font-variant-numeric: tabular-nums;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(255,255,255,.04);
  border: 1px solid rgba(255,255,255,.06);
}

.pbc-status-led {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--pbc-muted);
}

.pbc-status-led-live {
  background: var(--pbc-live);
  box-shadow: 0 0 8px var(--pbc-live);
}

.pbc-status-transport {
  text-transform: uppercase;
  letter-spacing: .1em;
  font-size: 10px;
}

.pbc-status-num {
  opacity: .85;
}

/* ── Mode & Twin Stick Toggles ────────────────────────────────────────── */

.pbc-toggle {
  display: inline-flex;
  gap: 3px;
  padding: 3px;
  border-radius: 999px;
  background: rgba(255,255,255,.06);
  border: 1px solid var(--pbc-line);
  backdrop-filter: blur(8px);
}

.pbc-toggle-btn {
  position: relative;
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--pbc-muted);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  padding: 6px 14px;
  border-radius: 999px;
  cursor: pointer;
  touch-action: none;
  transition: background .15s ease, color .15s ease;
}

.pbc-toggle-btn.is-on {
  background: var(--pbc-accent);
  color: #0b0713;
  box-shadow: 0 2px 8px rgba(139,109,255,.4);
}

.pbc-toggle-compact .pbc-toggle-btn {
  font-size: 10px;
  padding: 4px 10px;
}

.pbc-twin-btn {
  position: relative;
  appearance: none;
  border: 1px solid var(--pbc-line);
  background: rgba(255,255,255,.06);
  color: var(--pbc-muted);
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  padding: 5px 12px;
  border-radius: 999px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  backdrop-filter: blur(8px);
  touch-action: none;
  transition: all .15s ease;
}

.pbc-twin-btn.is-active {
  background: rgba(139, 109, 255, 0.22);
  border-color: rgba(139, 109, 255, 0.6);
  color: #fff;
  box-shadow: 0 0 12px rgba(139, 109, 255, 0.3);
}

.pbc-twin-icon {
  font-size: 12px;
}

/* ── HUD & Menu Chrome ────────────────────────────────────────────────── */

.pbc-hud {
  position: absolute;
  top: calc(var(--pbc-safe-t) + 8px);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--pbc-muted);
  white-space: nowrap;
  max-width: 65vw;
  overflow: hidden;
  z-index: 10;
  backdrop-filter: blur(10px);
}

.pbc-hud-host {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pbc-hud-player {
  font-weight: 700;
  color: var(--pbc-ink);
}

.pbc-hud-rtt {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--pbc-ink);
  opacity: 0.85;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.25);
}

/* Always visible in game view — not part of the auto-hiding HUD. */
.pbc-rtt-pin {
  position: absolute;
  top: calc(var(--pbc-safe-t) + 10px);
  right: calc(var(--pbc-safe-r) + 10px);
  z-index: 12;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  color: #fff;
  padding: 4px 8px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(8px);
  pointer-events: none;
  letter-spacing: 0.02em;
}

.pbc-hud-sep {
  opacity: .35;
}

.pbc-menu {
  position: absolute;
  bottom: calc(var(--pbc-safe-b) + 8px);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 10;
}

/* ── Shoulder Controls (Top Corners) ─────────────────────────────────── */

.pbc-shoulder {
  position: absolute;
  top: calc(var(--pbc-safe-t) + 6px);
  display: flex;
  gap: 8px;
  align-items: flex-start;
  z-index: 10;
}

.pbc-shoulder-left  { left: calc(var(--pbc-safe-l) + 12px); }
.pbc-shoulder-right { right: calc(var(--pbc-safe-r) + 12px); }

.pbc-bumper, .pbc-trigger {
  position: relative;
  appearance: none;
  font: inherit;
  cursor: pointer;
  color: var(--pbc-ink);
  font-weight: 800;
  font-size: clamp(11px, 2.4vmin, 15px);
  border: 1px solid var(--pbc-line);
  background: linear-gradient(180deg, rgba(255,255,255,.12), rgba(255,255,255,.04));
  box-shadow: inset 0 1px 0 rgba(255,255,255,.14), 0 3px 8px rgba(0,0,0,.4);
  touch-action: none;
  transition: transform .06s ease, background .06s ease, box-shadow .06s ease;
  backdrop-filter: blur(8px);
}

.pbc-bumper {
  min-width: clamp(52px, 12vmin, 80px);
  height: clamp(44px, 9.5vmin, 56px);
  border-radius: 14px;
}

.pbc-trigger {
  min-width: clamp(52px, 12vmin, 80px);
  height: clamp(48px, 11vmin, 66px);
  border-radius: 14px 14px 18px 18px;
}

.pbc-bumper.is-down, .pbc-trigger.is-down {
  transform: translateY(2px) scale(.96);
  background: linear-gradient(180deg, rgba(139,109,255,.55), rgba(139,109,255,.28));
  border-color: rgba(139, 109, 255, 0.8);
  box-shadow: inset 0 2px 6px rgba(0,0,0,.5), 0 0 16px rgba(139,109,255,.4);
}

/* ── Ergonomic Bottom-Outer Thumb Zones ──────────────────────────────── */

/*
 * Anchored to the bottom-outer corners where the thumb's natural pivot arc rests.
 */
.pbc-zone {
  position: absolute;
  bottom: calc(var(--pbc-safe-b) + clamp(10px, 3.2vmin, 26px));
  display: flex;
  align-items: flex-end;
  gap: clamp(10px, 2.8vmin, 24px);
  z-index: 5;
}

.pbc-zone-left {
  left: calc(var(--pbc-safe-l) + clamp(12px, 3.5vmin, 28px));
}

.pbc-zone-right {
  right: calc(var(--pbc-safe-r) + clamp(12px, 3.5vmin, 28px));
  flex-direction: row;
}

/* ── Face Buttons Cluster (Diamond Layout) ───────────────────────────── */

/* Default: Action Mode (Right stick off) -> Huge buttons, spacious reach */
.pbc-pad:not(.is-twin-stick) .pbc-face {
  --face-btn-size: clamp(66px, 17.5vmin, 94px);
  --face-font-size: clamp(22px, 5.2vmin, 32px);
  position: relative;
  /* 2.55 leaves ~0.275×size gap between adjacent ABXY circles (was overlapping at 2.28). */
  width: calc(var(--face-btn-size) * 2.55);
  height: calc(var(--face-btn-size) * 2.55);
  flex-shrink: 0;
}

/* Twin-Stick Mode -> Scaled gracefully to fit right stick */
.pbc-pad.is-twin-stick .pbc-face {
  --face-btn-size: clamp(48px, 12vmin, 68px);
  --face-font-size: clamp(16px, 3.6vmin, 22px);
  position: relative;
  width: calc(var(--face-btn-size) * 2.55);
  height: calc(var(--face-btn-size) * 2.55);
  flex-shrink: 0;
}

.pbc-face-diamond {
  position: absolute;
  inset: 12%;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255,255,255,.03), transparent 70%);
  pointer-events: none;
}

.pbc-face-btn {
  --tx: 0px;
  --ty: 0px;
  position: absolute;
  width: var(--face-btn-size);
  height: var(--face-btn-size);
  border-radius: 50%;
  appearance: none;
  cursor: pointer;
  font: inherit;
  font-weight: 900;
  font-size: var(--face-font-size);
  color: var(--btn);
  border: 2.5px solid color-mix(in oklab, var(--btn) 75%, transparent);
  background:
    radial-gradient(circle at 50% 35%, color-mix(in oklab, var(--btn) 25%, transparent), transparent 72%),
    rgba(255,255,255,.04);
  box-shadow: inset 0 2px 0 rgba(255,255,255,.16), 0 4px 14px rgba(0,0,0,.5);
  touch-action: none;
  transform: translate(var(--tx), var(--ty));
  transition: transform .06s ease, background .06s ease, box-shadow .06s ease, border-color .06s ease;
  display: grid;
  place-items: center;
  backdrop-filter: blur(6px);
}

/* Pure Diamond placement with 0 wasted grid perimeter */
.pbc-face-btn[data-btn="Y"] { top: 0; left: 50%; --tx: -50%; --ty: 0; }
.pbc-face-btn[data-btn="A"] { bottom: 0; left: 50%; --tx: -50%; --ty: 0; }
.pbc-face-btn[data-btn="X"] { left: 0; top: 50%; --tx: 0; --ty: -50%; }
.pbc-face-btn[data-btn="B"] { right: 0; top: 50%; --tx: 0; --ty: -50%; }

.pbc-btn-label {
  display: inline-block;
  line-height: 1;
  text-shadow: 0 2px 6px rgba(0,0,0,0.6);
}

.pbc-face-btn.is-down {
  transform: translate(var(--tx), calc(var(--ty) + 2px)) scale(.94);
  background: radial-gradient(circle at 50% 35%, color-mix(in oklab, var(--btn) 65%, transparent), transparent 80%), rgba(255,255,255,.08);
  border-color: var(--btn);
  box-shadow: inset 0 3px 10px rgba(0,0,0,.6), 0 0 24px color-mix(in oklab, var(--btn) 60%, transparent);
}

/* ── Analog Sticks ──────────────────────────────────────────────────── */

.pbc-stick {
  position: relative;
  width: clamp(118px, 35vmin, 180px);
  aspect-ratio: 1;
  border-radius: 50%;
  background:
    radial-gradient(circle at 50% 42%, rgba(255,255,255,.08), rgba(255,255,255,.02) 60%, transparent 72%),
    rgba(255,255,255,.03);
  border: 1.5px solid var(--pbc-line);
  touch-action: none;
  transition: border-color .12s ease;
  flex-shrink: 0;
  backdrop-filter: blur(6px);
}

.pbc-pad.is-twin-stick .pbc-stick {
  width: clamp(108px, 30vmin, 155px);
}

.pbc-stick.is-active {
  border-color: rgba(139,109,255,.6);
  box-shadow: 0 0 20px rgba(139, 109, 255, 0.2);
}

.pbc-stick-ring {
  position: absolute;
  inset: 18%;
  border-radius: 50%;
  border: 1.5px dashed rgba(255,255,255,.12);
  pointer-events: none;
}

.pbc-stick-crosshair {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(rgba(255,255,255,.05), rgba(255,255,255,.05)) center/1px 70% no-repeat,
    linear-gradient(rgba(255,255,255,.05), rgba(255,255,255,.05)) center/70% 1px no-repeat;
  pointer-events: none;
}

.pbc-stick-knob {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 44%;
  aspect-ratio: 1;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-weight: 800;
  font-size: clamp(13px, 2.8vmin, 18px);
  color: var(--pbc-ink);
  background: linear-gradient(180deg, rgba(255,255,255,.22), rgba(255,255,255,.08));
  box-shadow: inset 0 2px 0 rgba(255,255,255,.25), 0 8px 20px rgba(0,0,0,.6);
  pointer-events: none;
  border: 1px solid rgba(255,255,255,.15);
}

.pbc-stick.is-active .pbc-stick-knob {
  background: linear-gradient(180deg, rgba(139,109,255,.65), rgba(139,109,255,.32));
  border-color: rgba(139, 109, 255, 0.7);
  box-shadow: inset 0 2px 0 rgba(255,255,255,.3), 0 0 16px rgba(139,109,255,.5);
}

.pbc-stick-label {
  line-height: 1;
  text-shadow: 0 1px 4px rgba(0,0,0,.6);
}

/* ── D-Pad ──────────────────────────────────────────────────────────── */

.pbc-dpad {
  position: relative;
  display: grid;
  grid-template-areas:
    ". u ."
    "l . r"
    ". d .";
  gap: 2px;
  flex-shrink: 0;
}

.pbc-dpad-key {
  position: relative;
  appearance: none;
  cursor: pointer;
  font: inherit;
  width: clamp(46px, 12vmin, 72px);
  aspect-ratio: 1;
  color: var(--pbc-ink);
  font-size: clamp(12px, 2.5vmin, 17px);
  border: 1px solid var(--pbc-line);
  background: linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,.04));
  box-shadow: inset 0 1px 0 rgba(255,255,255,.10), 0 3px 8px rgba(0,0,0,.4);
  touch-action: none;
  transition: transform .06s ease, background .06s ease, border-color .06s ease;
  backdrop-filter: blur(6px);
}

[style*="grid-area: u"].pbc-dpad-key { border-radius: 12px 12px 3px 3px; }
[style*="grid-area: d"].pbc-dpad-key { border-radius: 3px 3px 12px 12px; }
[style*="grid-area: l"].pbc-dpad-key { border-radius: 12px 3px 3px 12px; }
[style*="grid-area: r"].pbc-dpad-key { border-radius: 3px 12px 12px 3px; }

.pbc-dpad-key.is-down {
  transform: scale(.94);
  background: linear-gradient(180deg, rgba(139,109,255,.55), rgba(139,109,255,.28));
  border-color: rgba(139,109,255,.8);
  box-shadow: inset 0 2px 6px rgba(0,0,0,.5), 0 0 14px rgba(139,109,255,.4);
}

.pbc-dpad-hub {
  position: absolute;
  inset: 0;
  margin: auto;
  width: clamp(46px, 12vmin, 72px);
  aspect-ratio: 1;
  background: linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.03));
  border-top: 1px solid var(--pbc-line);
  border-bottom: 1px solid var(--pbc-line);
  pointer-events: none;
}

/* ── Orientation & Media Queries ─────────────────────────────────────── */

.pbc-rotate { display: none; }

@media (orientation: portrait) {
  .pbc-pad {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: center;
    gap: clamp(14px, 4vh, 36px);
    padding: 0 12px calc(var(--pbc-safe-b) + 90px);
  }

  .pbc-zone {
    position: static;
    transform: none;
    width: 100%;
    justify-content: center;
    gap: clamp(12px, 5vw, 32px);
  }

  .pbc-zone-right {
    flex-direction: row-reverse;
  }

  .pbc-hud {
    top: auto;
    bottom: calc(var(--pbc-safe-b) + 60px);
    max-width: 92vw;
    justify-content: center;
  }

  .pbc-rotate {
    display: flex;
    align-items: center;
    gap: 8px;
    position: absolute;
    top: calc(var(--pbc-safe-t) + 76px);
    left: 50%;
    transform: translateX(-50%);
    font-size: 13px;
    font-weight: 700;
    color: var(--pbc-muted);
    white-space: nowrap;
    padding: 6px 14px;
    border-radius: 999px;
    background: rgba(255,255,255,.06);
    border: 1px solid var(--pbc-line);
  }

  .pbc-rotate-icon {
    font-size: 16px;
    animation: pbc-rock 2.2s ease-in-out infinite;
    display: inline-block;
  }

  @keyframes pbc-rock {
    0%, 100% { transform: rotate(-12deg); }
    50%      { transform: rotate(78deg); }
  }
}

@media (orientation: landscape) and (max-height: 480px) {
  .pbc-zone {
    top: 48%;
    bottom: auto;
    transform: translateY(-40%);
    align-items: center;
    gap: clamp(18px, 4vw, 34px);
  }
  .pbc-hud {
    font-size: 10px;
    top: calc(var(--pbc-safe-t) + 4px);
  }
  .pbc-menu {
    bottom: calc(var(--pbc-safe-b) + 4px);
    gap: 6px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pbc-pulse, .pbc-rotate-icon { animation: none; }
  .pbc-face-btn, .pbc-bumper, .pbc-trigger, .pbc-dpad-key, .pbc-twin-btn { transition: none; }
}
`}</style>
  );
}
