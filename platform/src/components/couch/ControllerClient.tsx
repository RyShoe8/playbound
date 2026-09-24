"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BUTTON } from "@/lib/couch/protocol";
import {
  applyKeyboardMouseEvent,
  emptyPadAxes,
  KEYBOARD_MOUSE_LEGEND,
} from "@/lib/couch/keyboardMouseMap";
import { CADENCE } from "@/lib/realtime/cadence";
import { couchControllerJoinLabel, type CouchControlChoice } from "@/lib/couch/joinLabel";
import {
  addRemoteIceCandidate,
  iceServersIncludeTurn,
  isPlayBoundLauncherGameView,
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

function clearStored(code: string) {
  try {
    sessionStorage.removeItem(`${STORAGE_KEY}.${code}`);
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
  const [isDesktopClient, setIsDesktopClient] = useState(false);
  useEffect(() => {
    try {
      const isMobile = window.matchMedia?.("(max-width: 640px) and (pointer: coarse)").matches;
      if (!isMobile) {
        setIsDesktopClient(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const gameLayout = layout === "game" || isDesktopClient;
  const [error, setError] = useState<string | null>(null);
  const [join, setJoin] = useState<JoinState | null>(null);
  const [joinEpoch, setJoinEpoch] = useState(0);

  const handleUnauthorized = useCallback(() => {
    clearStored(code);
    setJoin(null);
    setJoinEpoch((v) => v + 1);
  }, [code]);
  /**
   * Game-view joiners pick the same three options as the launcher Input Setup:
   * keyboard, controller, or phone.
   */
  const [controlChoice, setControlChoice] = useState<CouchControlChoice>(() => {
    if (typeof window !== "undefined") {
      const isMobile = window.matchMedia?.("(max-width: 640px) and (pointer: coarse)").matches;
      if (layout !== "game" && isMobile) return "phone";
    }
    return "undecided";
  });
  const [showPhoneQr, setShowPhoneQr] = useState(true);
  // Phones scanning the QR want the touch pad, not keyboard+stream chrome.
  const [mode, setMode] = useState<InputMode>(() => {
    if (typeof window === "undefined") return "keyboard-mouse";
    try {
      const coarse =
        window.matchMedia?.("(pointer: coarse)").matches ||
        (navigator.maxTouchPoints ?? 0) > 0;
      if (coarse && layout !== "game") return "touch-gamepad";
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
  const joinRef = useRef(join);
  useEffect(() => {
    joinRef.current = join;
  }, [join]);
  const framesRef = useRef(0);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const [hasVideo, setHasVideo] = useState(false);
  const [videoWaiting, setVideoWaiting] = useState(false);
  const videoFrameWatchRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [cropTitleBar, setCropTitleBar] = useState(false);
  const [hudVisible, setHudVisible] = useState(true);
  const [showControlsModal, setShowControlsModal] = useState(false);
  const hudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!showControlsModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowControlsModal(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showControlsModal]);

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
    const initialTimer = setTimeout(resetHudTimer, 0);
    return () => {
      clearTimeout(initialTimer);
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

  // Try unmuted autoplay first (works unprompted inside PlayBound's own
  // Electron game-view window, which relaxes the gesture requirement); a
  // real phone browser will reject that, so fall back to muted playback and
  // unmute on the player's first tap/click, same pattern every video site
  // uses for audio-on-load. Only the full-window "Join online" popup
  // (layout="game") offered an audio track in the first place — a phone
  // used as a local controller never has one, and stays muted like before.
  function playWithAudio(el: HTMLVideoElement) {
    if (!gameLayout) {
      void el.play().catch(() => {});
      return;
    }
    el.muted = false;
    el.play().catch(() => {
      el.muted = true;
      void el.play().catch(() => {});
      const unmuteOnGesture = () => {
        el.muted = false;
        void el.play().catch(() => {});
      };
      el.addEventListener("pointerdown", unmuteOnGesture, { once: true });
      el.addEventListener("touchstart", unmuteOnGesture, { once: true, passive: true });
    });
  }

  function attachRemoteStream(stream: MediaStream) {
    remoteStreamRef.current = stream;
    const el = videoRef.current;
    if (el && el.srcObject !== stream) {
      el.srcObject = stream;
      playWithAudio(el);
    }
    const videoTrack = stream.getVideoTracks()[0];

    const markLive = () => {
      const v = videoRef.current;
      if (!v) return false;
      // Some captures report dimensions only after play() + unmute.
      if ((v.readyState >= 2 && (v.videoWidth > 0 || v.videoHeight > 0)) || (v.videoWidth > 0 && v.videoHeight > 0)) {
        setHasVideo(true);
        setVideoWaiting(false);
        clearVideoFrameWatch();
        return true;
      }
      return false;
    };
    if (videoTrack) {
      try {
        videoTrack.enabled = true;
      } catch {
        /* ignore */
      }
      videoTrack.onunmute = () => {
        const v = videoRef.current;
        if (v) void v.play().catch(() => {});
        markLive();
      };
      videoTrack.onended = () => {
        setHasVideo(false);
        setVideoWaiting(true);
      };
    }
    if (!markLive()) {
      clearVideoFrameWatch();
      setVideoWaiting(true);
      setHasVideo(false);
      videoFrameWatchRef.current = setInterval(() => {
        if (markLive()) return;
        const v = videoRef.current;
        if (v) void v.play().catch(() => {});
      }, 400);
    }
    window.setTimeout(() => {
      markLive();
    }, 80);
  }

  function bindVideoEl(el: HTMLVideoElement | null) {
    videoRef.current = el;
    const stream = remoteStreamRef.current;
    if (el && stream && el.srcObject !== stream) {
      el.srcObject = stream;
      playWithAudio(el);
      if ((el.readyState >= 2 && el.videoWidth > 0) || (el.videoWidth > 0 && el.videoHeight > 0)) {
        setHasVideo(true);
        setVideoWaiting(false);
        clearVideoFrameWatch();
      }
    }
  }

  const playerLabel = useMemo(() => {
    if (join?.playerSlot == null) return "…";
    return `Player ${join.playerSlot + 1}`;
  }, [join?.playerSlot]);

  const sendInput = useCallback((opts?: { force?: boolean }) => {
    // The approval/endpoints poll replaces `join` every few seconds. Reading
    // the latest value through the ref keeps this callback stable, so that
    // refresh does not tear down the WebRTC effect and restart the video stream.
    const j = joinRef.current;
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
  }, []);

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
    // Join once per code — do not tear down when the player picks keyboard/controller/phone.
  }, [code, gameLayout, joinEpoch]);

  // Refresh controller row label when PC/gamepad choice becomes known.
  useEffect(() => {
    if (!join?.controllerId || !join?.controllerToken) return;
    const { controllerId, controllerToken } = join;
    async function syncLabel() {
      try {
        const res = await fetch(`/api/couch/sessions/${encodeURIComponent(code)}/join`, {
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
        if (res.status === 401) {
          handleUnauthorized();
        }
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
    handleUnauthorized,
  ]);

  // Poll until approved + keep refreshing endpoints (host LAN IPs / ICE can land late).
  useEffect(() => {
    if (!join?.controllerId || !join?.controllerToken || !join?.sessionId) return;
    const controllerId = join.controllerId;
    const controllerToken = join.controllerToken;
    const sessionId = join.sessionId;
    let cancelled = false;
    let timer: number | null = null;
    let delayMs = 1500;

    const tick = async () => {
      if (cancelled) return;
      try {
        const qs = new URLSearchParams({ controllerId, controllerToken });
        const res = await fetch(
          `/api/couch/sessions/${encodeURIComponent(sessionId)}/join?${qs}`
        );
        if (res.status === 401) {
          handleUnauthorized();
          return;
        }
        const data = await res.json();
        if (!res.ok || cancelled) return;
        let hasEndpoints = false;
        setJoin((prev) => {
          if (!prev) return prev;
          const wsUrls = data.wsUrls || prev.wsUrls;
          hasEndpoints = Array.isArray(wsUrls) && wsUrls.length > 0;
          const next = {
            ...prev,
            status: data.status,
            playerSlot: data.playerSlot,
            sessionToken: data.sessionToken,
            wsUrls,
            wsToken: data.wsToken ?? prev.wsToken,
            iceServers:
              data.iceServers && data.iceServers.length > 0
                ? data.iceServers
                : prev.iceServers,
          };
          saveStored(code, next);
          return next;
        });
        if (data.status === "approved" && hasEndpoints) {
          delayMs = 8000;
        } else {
          delayMs = 1500;
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) {
          timer = window.setTimeout(() => {
            void tick();
          }, delayMs);
        }
      }
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [join?.sessionId, join?.controllerId, join?.controllerToken, code]);

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
    const seenSignalIds = new Set<string>();
    const pendingRemoteIce: Array<{ candidate?: RTCIceCandidateInit | null; complete?: boolean }> = [];
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
      try {
        const res = await fetch(`/api/couch/sessions/${encodeURIComponent(session.sessionId)}/signal`, {
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
        if (res.status === 401) {
          handleUnauthorized();
        }
      } catch {
        /* ignore */
      }
    }

    async function startWebRtc() {
      pc = new RTCPeerConnection({ iceServers: session.iceServers });
      // Receive host game view when the host shares their display.
      pc.addTransceiver("video", { direction: "recvonly" });
      // Audio only for the full-window "Join online" popup (layout="game")
      // — the actual remote player watching/hearing the host's game with no
      // other audio source. A phone used as a local controller sits in the
      // same room as the host's speakers, so an audio m-line there would
      // just play the game a second time out of the phone's tiny speaker.
      // The host (answerer) can't add a new audio m-line on its own, so this
      // must be offered upfront when wanted.
      if (gameLayout) {
        pc.addTransceiver("audio", { direction: "recvonly" });
      }

      pc.onconnectionstatechange = () => {
        const state = pc?.connectionState;
        console.log("[couch] connectionState:", state);
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
        // TEMPORARY diagnostic logging for the Remote Play "stuck forever"
        // report — pins down whether ICE is gathering/checking/failing vs.
        // never even reaching those states. Remove once resolved.
        console.log("[couch] iceConnectionState:", ice);
        if (ice === "connected" || ice === "completed") {
          usingWebrtc = true;
          setTransport("webrtc");
        }
      };
      pc.onicegatheringstatechange = () => {
        console.log("[couch] iceGatheringState:", pc?.iceGatheringState);
      };
      pc.onicecandidateerror = (ev) => {
        const e = ev as RTCPeerConnectionIceErrorEvent;
        console.warn("[couch] ICE candidate error:", e.errorCode, e.errorText, e.url);
      };

      pc.ontrack = (ev) => {
        // Consolidate all incoming tracks (video AND audio) into a single MediaStream.
        // In WebRTC with transceivers, ev.streams may be empty or separate per track.
        // Overwriting srcObject with a single-track stream on each ontrack event
        // strips the video track when the audio track arrives (or vice versa).
        let stream = remoteStreamRef.current;
        if (!stream) {
          stream = new MediaStream();
          remoteStreamRef.current = stream;
        }

        if (ev.track) {
          const already = stream.getTracks().some((t) => t.id === ev.track.id);
          if (!already) {
            stream.addTrack(ev.track);
          }
        }
        if (ev.streams?.[0]) {
          for (const t of ev.streams[0].getTracks()) {
            if (!stream.getTracks().some((existing) => existing.id === t.id)) {
              stream.addTrack(t);
            }
          }
        }

        attachRemoteStream(stream);
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
        console.log(
          "[couch] local ICE candidate:",
          ev.candidate ? ev.candidate.candidate : "(end of candidates)"
        );
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
      let signalPollInFlight = false;

      const pollSignalsOnce = async () => {
        if (closed || !pc || signalPollInFlight) return;
        signalPollInFlight = true;
        try {
          const qs = new URLSearchParams({
            forRole: "controller",
            // Concurrent posts can be stored out of timestamp order.
            since: String(Math.max(0, signalSince - 10_000)),
            controllerId: session.controllerId,
            controllerToken: session.controllerToken,
            peerId: session.controllerId,
          });
          const res = await fetch(
            `/api/couch/sessions/${encodeURIComponent(session.sessionId)}/signal?${qs}`
          );
          if (res.status === 401) {
            handleUnauthorized();
            return;
          }
          const data = await res.json();
          if (!res.ok) return;
          const messages = (data.messages || []).filter(
            (m: { id: string }) => !seenSignalIds.has(m.id)
          );
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
            seenSignalIds.add(m.id);
            if (seenSignalIds.size > 2048) {
              const oldest = seenSignalIds.values().next().value;
              if (oldest) seenSignalIds.delete(oldest);
            }
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
                for (const ice of pendingRemoteIce.splice(0)) {
                  await addRemoteIceCandidate(pc, ice.candidate, ice.complete);
                }
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                await postSignal({
                  kind: "answer",
                  sdp: answer,
                  from: session.controllerId,
                });
              } catch {
                /* ignore renegotiation races */
              }
            }
            if (payload.kind === "answer" && payload.sdp && pc.signalingState !== "stable") {
              await pc.setRemoteDescription(payload.sdp);
              for (const ice of pendingRemoteIce.splice(0)) {
                await addRemoteIceCandidate(pc, ice.candidate, ice.complete);
              }
            }
            if (payload.kind === "ice") {
              if (pc.remoteDescription) {
                await addRemoteIceCandidate(pc, payload.candidate, payload.complete);
              } else {
                pendingRemoteIce.push({ candidate: payload.candidate, complete: payload.complete });
              }
            }
          }
        } catch {
          /* ignore */
        } finally {
          signalPollInFlight = false;
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

      // Prefer LAN WebSocket early when the in-app game view can use ws://.
      // hasWsCandidates currently ignores plain LAN ws:// on HTTPS — still start
      // fallback in the launcher window where webSecurity is off.
      if (hasWsCandidates || isPlayBoundLauncherGameView()) {
        window.setTimeout(() => {
          if (!closed && !usingWebrtc && !ws) void startWsFallback();
        }, isPlayBoundLauncherGameView() ? 600 : 5000);
      }

      function markOfflineIfFailed() {
        if (closed || usingWebrtc || ws?.readyState === WebSocket.OPEN) return;
        const ice = pc?.iceConnectionState;
        const conn = pc?.connectionState;
        // "disconnected" is often transient — only treat hard failure as offline.
        if (ice !== "failed" && conn !== "failed") return;
        if (
          isPublicHttpsOrigin() &&
          !iceServersIncludeTurn(session.iceServers) &&
          !isPlayBoundLauncherGameView()
        ) {
          setConnectHint(
            " Browser blocked direct LAN access from playbound.club — open game view from the PlayBound launcher popup, or ensure Connect TURN is configured."
          );
        } else {
          setConnectHint(null);
        }
        setTransport("offline");
      }

      // Give ICE time on LAN; retry WS and only fail once the peer is actually failed.
      window.setTimeout(() => {
        if (!closed && !usingWebrtc && !ws) void startWsFallback();
        markOfflineIfFailed();
      }, 20_000);
      window.setTimeout(() => {
        markOfflineIfFailed();
      }, 45_000);
    }

    async function startWsFallback() {
      if (ws || closed) return;
      const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
      const allowLanWs = isPlayBoundLauncherGameView();
      // Prefer latest endpoints — host may publish LAN/NetBird URLs after approve.
      const latest = joinRef.current;
      const candidateUrls = latest?.wsUrls?.length ? latest.wsUrls : session.wsUrls || [];
      const wsToken = latest?.wsToken || session.wsToken;
      const sessionToken = latest?.sessionToken || session.sessionToken;
      const urls = candidateUrls.filter((u) => {
        if (!isHttps) return true;
        if (u.startsWith("wss://")) return true;
        if (u.startsWith("ws://127.0.0.1") || u.startsWith("ws://localhost")) return true;
        // In-app game view: allow plain LAN ws:// (webSecurity disabled on that window).
        if (allowLanWs && u.startsWith("ws://")) return true;
        return false;
      });
      if (!urls.length || !wsToken) {
        if (!usingWebrtc && (pc?.connectionState === "failed" || pc?.iceConnectionState === "failed")) {
          if (isPublicHttpsOrigin() && !iceServersIncludeTurn(session.iceServers) && !allowLanWs) {
            setConnectHint(
              " Browser blocked direct LAN access from playbound.club — open game view from the PlayBound launcher, or ensure Connect TURN is configured."
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
        const url = wsToken
          ? `${raw}${raw.includes("?") ? "&" : "?"}token=${encodeURIComponent(wsToken)}`
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
              sessionToken,
              wsToken,
              playerSlot: session.playerSlot,
            })
          );
          send({
            type: "hello",
            controllerId: session.controllerId,
            sessionToken,
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
      if (remoteStreamRef.current) {
        for (const t of remoteStreamRef.current.getTracks()) {
          try {
            t.stop();
          } catch {
            /* ignore */
          }
        }
        remoteStreamRef.current = null;
      }
    };
    // Keep the peer connection across input-mode changes (keyboard ↔ controller).
    // Restart when LAN endpoints arrive so WS fallback can use them.
  }, [
    join?.sessionId,
    join?.controllerId,
    join?.status,
    join?.playerSlot,
    join?.sessionToken,
    join?.wsUrls?.length,
    sendInput,
  ]);

  // Physical gamepad polling
  useEffect(() => {
    const usePad =
      mode === "standard-gamepad" ||
      (gameLayout && (controlChoice === "controller" || controlChoice === "undecided"));
    if (!usePad) {
      const clearLabelTimer = setTimeout(() => setPhysicalLabel(null), 0);
      return () => clearTimeout(clearLabelTimer);
    }
    let raf = 0;
    const tick = () => {
      const pads = Array.from(navigator.getGamepads?.() || []);
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
        const lx = clamp(pad.axes[0] ?? 0, -1, 1);
        const ly = clamp(pad.axes[1] ?? 0, -1, 1);
        const rx = clamp(pad.axes[2] ?? 0, -1, 1);
        const ry = clamp(pad.axes[3] ?? 0, -1, 1);
        const lt = clamp(pad.buttons[6]?.value ?? 0, 0, 1);
        const rt = clamp(pad.buttons[7]?.value ?? 0, 0, 1);

        // Only commit input state to padRef if controller mode is actively selected
        if (mode === "standard-gamepad" || controlChoice === "controller") {
          padRef.current = { buttons, lx, ly, rx, ry, lt, rt };
        }
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

    const onPadConnected = (e: GamepadEvent) => {
      if (e.gamepad?.id) {
        setPhysicalLabel(e.gamepad.id.trim());
      }
    };
    window.addEventListener("gamepadconnected", onPadConnected);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("gamepadconnected", onPadConnected);
    };
  }, [mode, gameLayout, controlChoice]);

  // Keyboard & mouse → virtual pad (default join mode)
  useEffect(() => {
    if (mode !== "keyboard-mouse") return;
    if (controlChoice === "phone" || controlChoice === "undecided") return;
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
          "pbc-pad",
          hasVideo ? "is-gameview" : "",
          mode === "keyboard-mouse" ? "is-kbm" : "",
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
            onLoadedMetadata={() => {
              const v = videoRef.current;
              if (v && v.videoWidth > 0 && v.videoHeight > 0) {
                setHasVideo(true);
                setVideoWaiting(false);
                clearVideoFrameWatch();
              }
            }}
            onPlaying={() => {
              const v = videoRef.current;
              if (v && v.videoWidth > 0 && v.videoHeight > 0) {
                setHasVideo(true);
                setVideoWaiting(false);
                clearVideoFrameWatch();
              }
            }}
            onResize={() => {
              const v = videoRef.current;
              if (v && v.videoWidth > 0 && v.videoHeight > 0) {
                setHasVideo(true);
                setVideoWaiting(false);
                clearVideoFrameWatch();
              }
            }}
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
          className={["pbc-hud", !hudVisible && gameLayout && !showControlsModal ? "is-hidden" : ""].filter(Boolean).join(" ")}
        >
          <span className="pbc-hud-host">{join.hostLabel}</span>
          <span className="pbc-hud-player">{playerLabel}</span>
          {gameLayout ? (
            <div className="pbc-hud-actions">
              <button
                type="button"
                className={`pbc-hud-fs ${showControlsModal ? "is-active" : ""}`}
                onClick={() => setShowControlsModal((prev) => !prev)}
                title="View button mapping for your selected controls"
              >
                Controls
              </button>
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
            </div>
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
        {/* ── Defacto Input Setup Modal (identical to regular game launch) ── */}
        {gameLayout && controlChoice === "undecided" ? (
          <div
            className="phone-controller-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="phone-controller-title"
          >
            <div className="phone-controller-sheet">
              <div className="phone-controller-header">
                <div className="phone-controller-badge">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <rect x="2" y="6" width="20" height="12" rx="2" />
                    <line x1="6" y1="12" x2="10" y2="12" />
                    <line x1="8" y1="10" x2="8" y2="14" />
                    <circle cx="15" cy="11" r="1" />
                    <circle cx="18" cy="13" r="1" />
                  </svg>
                  Input Setup
                </div>
                <h2 id="phone-controller-title">How do you want to play?</h2>
                <p className="phone-controller-lead">
                  Joining <strong>{join.hostLabel}</strong>&apos;s game view. Choose your control setup:
                </p>
              </div>

              <div className="phone-controller-choices">
                <button
                  type="button"
                  className="phone-controller-choice-card"
                  onClick={() => {
                    setMode("keyboard-mouse");
                    setControlChoice("keyboard");
                  }}
                >
                  <div className="phone-controller-choice-icon-wrap icon-keyboard">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <line x1="6" y1="8" x2="6" y2="8.01" />
                      <line x1="10" y1="8" x2="10" y2="8.01" />
                      <line x1="14" y1="8" x2="14" y2="8.01" />
                      <line x1="18" y1="8" x2="18" y2="8.01" />
                      <line x1="6" y1="12" x2="6" y2="12.01" />
                      <line x1="18" y1="12" x2="18" y2="12.01" />
                      <line x1="8" y1="16" x2="16" y2="16" />
                    </svg>
                  </div>
                  <div className="phone-controller-choice-text">
                    <div className="phone-controller-choice-header">
                      <span className="phone-controller-choice-title">Mouse and Keyboard</span>
                      <span className="phone-controller-choice-tag">PC Controls</span>
                    </div>
                    <span className="phone-controller-choice-sub">Play using standard keyboard and mouse controls</span>
                  </div>
                </button>

                <button
                  type="button"
                  className="phone-controller-choice-card"
                  onClick={() => {
                    setMode("standard-gamepad");
                    setControlChoice("controller");
                  }}
                >
                  <div className="phone-controller-choice-icon-wrap icon-controller">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="2" y="6" width="20" height="12" rx="2" />
                      <line x1="6" y1="12" x2="10" y2="12" />
                      <line x1="8" y1="10" x2="8" y2="14" />
                      <circle cx="15" cy="11" r="1" />
                      <circle cx="18" cy="13" r="1" />
                    </svg>
                  </div>
                  <div className="phone-controller-choice-text">
                    <div className="phone-controller-choice-header">
                      <span className="phone-controller-choice-title">Controller (Gamepad)</span>
                      <span className="phone-controller-choice-tag">{physicalLabel ? "Connected" : "Direct"}</span>
                    </div>
                    <span className="phone-controller-choice-sub">
                      {physicalLabel ? `Connected: ${physicalLabel}` : "Play with an Xbox, PlayStation, Switch Pro, or USB controller"}
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  className="phone-controller-choice-card is-featured"
                  onClick={() => {
                    setControlChoice("phone");
                    setShowPhoneQr(true);
                  }}
                >
                  <div className="phone-controller-choice-icon-wrap icon-phone">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                      <line x1="12" y1="18" x2="12.01" y2="18" />
                    </svg>
                  </div>
                  <div className="phone-controller-choice-text">
                    <div className="phone-controller-choice-header">
                      <span className="phone-controller-choice-title">Phone as Controller</span>
                      <span className="phone-controller-choice-tag is-brand">Touch / Mobile Pad</span>
                    </div>
                    <span className="phone-controller-choice-sub">Scan a QR code — no app or account required on your phone</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* ── Defacto Phone Pairing Sheet ── */}
        {gameLayout && controlChoice === "phone" && showPhoneQr ? (
          <div
            className="phone-controller-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="phone-controller-title"
          >
            <div className="phone-controller-sheet phone-controller-pairing-sheet">
              <div className="phone-controller-header">
                <div className="phone-controller-badge">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                    <line x1="12" y1="18" x2="12.01" y2="18" />
                  </svg>
                  Connect Phone
                </div>
                <h2 id="phone-controller-title">Scan to connect your controller</h2>
                <p className="phone-controller-lead">
                  Scan this QR code with your phone&apos;s camera. This window stays your game view.
                </p>
              </div>

              <div className="phone-controller-qr-container">
                <div className="phone-controller-qr-frame">
                  <img className="phone-controller-qr-img" src={qrSrc} alt="Scan QR code" width={140} height={140} />
                </div>
                <div className="phone-controller-qr-info">
                  <div className="phone-controller-code-box">
                    <span className="phone-controller-code-label">Room Code</span>
                    <span className="phone-controller-code-val">{code}</span>
                  </div>
                  <p className="phone-controller-qr-hint">
                    or open <span className="phone-controller-url">playbound.club/c</span> and enter <strong>{code}</strong>
                  </p>
                </div>
              </div>

              <div
                className="phone-controller-footer"
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
              >
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setControlChoice("undecided")}
                >
                  ← Choose other controls
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ color: "#38bdf8", fontWeight: 600 }}
                  onClick={() => setShowPhoneQr(false)}
                >
                  Done / Hide QR
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* ── Controls Mapping Modal ── */}
        {gameLayout && showControlsModal ? (
          <div
            className="phone-controller-overlay"
            onClick={() => setShowControlsModal(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Controls Mapping"
          >
            <div
              className="phone-controller-sheet"
              style={{ width: "min(600px, 94vw)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="phone-controller-header"
                style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}
              >
                <div>
                  <div className="phone-controller-badge">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <rect x="2" y="6" width="20" height="12" rx="2" />
                      <line x1="6" y1="12" x2="10" y2="12" />
                      <line x1="8" y1="10" x2="8" y2="14" />
                      <circle cx="15" cy="11" r="1" />
                      <circle cx="18" cy="13" r="1" />
                    </svg>
                    Controls Mapping
                  </div>
                  <h2 id="phone-controller-title">
                    {controlChoice === "controller" || mode === "standard-gamepad"
                      ? "Controller (Gamepad)"
                      : controlChoice === "phone"
                      ? "Phone Controller"
                      : "Mouse and Keyboard"}
                  </h2>
                  <p className="phone-controller-lead">
                    {controlChoice === "controller" || mode === "standard-gamepad"
                      ? physicalLabel || "Standard Xbox, PlayStation, Switch Pro, or USB Gamepad"
                      : controlChoice === "phone"
                      ? `Phone paired to room ${code}`
                      : "Keys and mouse buttons driving Player 1"}
                  </p>
                </div>
                <button
                  type="button"
                  className="pbc-modal-close"
                  onClick={() => setShowControlsModal(false)}
                  aria-label="Close controls"
                >
                  ✕
                </button>
              </div>

              <div className="pbc-controls-grid" role="list">
                {(controlChoice === "controller" || mode === "standard-gamepad"
                  ? STANDARD_CONTROLLER_LEGEND
                  : KEYBOARD_MOUSE_LEGEND
                ).map((row) => (
                  <div key={row.action} className="pbc-controls-row" role="listitem">
                    <span className="pbc-controls-action">{row.action}</span>
                    <span className="pbc-controls-keys">
                      {"keys" in row
                        ? row.keys.map((key) => (
                            <kbd key={key} className="pbc-key">
                              {key}
                            </kbd>
                          ))
                        : row.buttons.map((btn) => (
                            <kbd key={btn} className="pbc-key">
                              {btn}
                            </kbd>
                          ))}
                    </span>
                  </div>
                ))}
              </div>

              <div
                className="phone-controller-footer"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                  paddingTop: "12px",
                  marginTop: "6px",
                }}
              >
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    setShowControlsModal(false);
                    setControlChoice("undecided");
                  }}
                >
                  Switch control scheme…
                </button>
                <button
                  type="button"
                  className="pbc-hud-fs is-active"
                  style={{ padding: "6px 18px", fontSize: "12px" }}
                  onClick={() => setShowControlsModal(false)}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {!gameLayout ? (
          <div className="pbc-kbm-panel">
            <h1 className="pbc-title">Keyboard &amp; mouse</h1>
            <ControlsLegend embedded />
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
          onLoadedMetadata={() => {
            const v = videoRef.current;
            if (v && v.videoWidth > 0 && v.videoHeight > 0) {
              setHasVideo(true);
              setVideoWaiting(false);
              clearVideoFrameWatch();
            }
          }}
          onPlaying={() => {
            const v = videoRef.current;
            if (v && v.videoWidth > 0 && v.videoHeight > 0) {
              setHasVideo(true);
              setVideoWaiting(false);
              clearVideoFrameWatch();
            }
          }}
          onResize={() => {
            const v = videoRef.current;
            if (v && v.videoWidth > 0 && v.videoHeight > 0) {
              setHasVideo(true);
              setVideoWaiting(false);
              clearVideoFrameWatch();
            }
          }}
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

export const STANDARD_CONTROLLER_LEGEND: ReadonlyArray<{
  action: string;
  buttons: ReadonlyArray<string>;
}> = [
  { action: "Movement", buttons: ["Left Stick", "D-Pad"] },
  { action: "Aim / Camera", buttons: ["Right Stick"] },
  { action: "A / Action", buttons: ["A Button (Bottom)"] },
  { action: "B / Back", buttons: ["B Button (Right)"] },
  { action: "X / Action", buttons: ["X Button (Left)"] },
  { action: "Y / Special", buttons: ["Y Button (Top)"] },
  { action: "Bumpers", buttons: ["LB", "RB"] },
  { action: "Triggers", buttons: ["LT", "RT"] },
  { action: "Start / Menu", buttons: ["Start (▶)"] },
  { action: "Back / Select", buttons: ["Back (◀)"] },
];

function ControlsLegend({
  compact = false,
  embedded = false,
  hidden = false,
  onChange,
}: {
  compact?: boolean;
  embedded?: boolean;
  hidden?: boolean;
  onChange?: () => void;
}) {
  return (
    <div
      className={[
        "pbc-controls-legend",
        compact ? "is-compact" : "",
        embedded ? "is-embedded" : "",
        hidden ? "is-hidden" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {!embedded ? (
        <div className="pbc-controls-legend-head">
          <p className="pbc-controls-legend-eyebrow">Control scheme</p>
          <h2 className="pbc-controls-legend-title">Keyboard &amp; mouse</h2>
          {!compact ? (
            <p className="pbc-controls-legend-lead">
              These keys drive the host&apos;s virtual pad for your player slot.
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="pbc-controls-grid" role="list">
        {KEYBOARD_MOUSE_LEGEND.map((row) => (
          <div key={row.action} className="pbc-controls-row" role="listitem">
            <span className="pbc-controls-action">{row.action}</span>
            <span className="pbc-controls-keys">
              {row.keys.map((key) => (
                <kbd key={key} className="pbc-key">
                  {key}
                </kbd>
              ))}
            </span>
          </div>
        ))}
      </div>
      {onChange ? (
        <button type="button" className="pbc-controls-legend-change" onClick={onChange}>
          Change input
        </button>
      ) : null}
    </div>
  );
}

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
.pbc-pad.is-gameview .pbc-gameview,
.pbc-pad.is-kbm .pbc-gameview,
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

.pbc-hud-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.pbc-hud-fs {
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

/* ── Unified Input Setup & Controls Modal (Matches Launcher Defacto UI) ── */
.phone-controller-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.78);
  backdrop-filter: blur(14px);
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 20px;
  animation: phoneModalIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.phone-controller-sheet {
  width: min(520px, 94vw);
  background: #11141c;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 18px;
  padding: 24px 24px 20px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: 90vh;
  overflow-y: auto;
}

@keyframes phoneModalIn {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(6px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.phone-controller-header {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.phone-controller-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(99, 102, 241, 0.15);
  border: 1px solid rgba(99, 102, 241, 0.3);
  color: #a5b4fc;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  margin-bottom: 2px;
}

.phone-controller-sheet h2 {
  margin: 0;
  font-size: 1.3rem;
  font-weight: 700;
  color: #f8fafc;
  letter-spacing: -0.01em;
}

.phone-controller-lead {
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.45;
  color: #cbd5e1;
}

.phone-controller-choices {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.phone-controller-choice-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s ease;
  color: inherit;
  font: inherit;
  width: 100%;
}

.phone-controller-choice-card:hover {
  background: rgba(255, 255, 255, 0.07);
  border-color: rgba(99, 102, 241, 0.4);
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}

.phone-controller-choice-card.is-featured {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(168, 85, 247, 0.04));
  border-color: rgba(99, 102, 241, 0.35);
}

.phone-controller-choice-card.is-featured:hover {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(168, 85, 247, 0.08));
  border-color: rgba(99, 102, 241, 0.6);
  box-shadow: 0 4px 20px rgba(99, 102, 241, 0.2);
}

.phone-controller-choice-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  flex-shrink: 0;
}

.phone-controller-choice-icon-wrap.icon-keyboard {
  background: rgba(59, 130, 246, 0.14);
  color: #60a5fa;
  border: 1px solid rgba(59, 130, 246, 0.28);
}

.phone-controller-choice-icon-wrap.icon-controller {
  background: rgba(34, 197, 94, 0.12);
  color: #4ade80;
  border: 1px solid rgba(34, 197, 94, 0.25);
}

.phone-controller-choice-icon-wrap.icon-phone {
  background: rgba(99, 102, 241, 0.16);
  color: #a5b4fc;
  border: 1px solid rgba(99, 102, 241, 0.3);
}

.phone-controller-choice-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
}

.phone-controller-choice-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.phone-controller-choice-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: #f8fafc;
}

.phone-controller-choice-tag {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  color: #94a3b8;
  white-space: nowrap;
}

.phone-controller-choice-tag.is-brand {
  background: rgba(99, 102, 241, 0.25);
  color: #c7d2fe;
}

.phone-controller-choice-sub {
  font-size: 0.8rem;
  line-height: 1.35;
  color: #94a3b8;
}

.phone-controller-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  margin-top: 4px;
}

.btn-ghost {
  background: transparent;
  border: none;
  color: #94a3b8;
  font: inherit;
  font-size: 0.85rem;
  font-weight: 500;
  padding: 6px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-ghost:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #f8fafc;
}

/* ── Pairing Screen ── */
.phone-controller-pairing-sheet {
  width: min(520px, 94vw);
}

.phone-controller-qr-container {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 16px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 14px;
}

.phone-controller-qr-frame {
  background: #fff;
  padding: 8px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

.phone-controller-qr-img {
  display: block;
  width: 140px;
  height: 140px;
}

.phone-controller-qr-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.phone-controller-code-box {
  display: flex;
  align-items: center;
  gap: 8px;
}

.phone-controller-code-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #94a3b8;
  font-weight: 600;
}

.phone-controller-code-val {
  font-family: ui-monospace, monospace;
  font-size: 1.1rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.12);
  padding: 2px 8px;
  border-radius: 6px;
  border: 1px solid rgba(56, 189, 248, 0.25);
}

.phone-controller-qr-hint {
  margin: 0;
  font-size: 0.8rem;
  color: #cbd5e1;
  word-break: break-all;
}

.phone-controller-url {
  font-family: ui-monospace, monospace;
  color: #cbd5e1;
}

.pbc-modal-close {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid var(--pbc-line);
  color: var(--pbc-ink);
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.pbc-modal-close:hover {
  background: rgba(255, 255, 255, 0.18);
}

/* Touch pad preview size only for mobile touch when not in game view */
.pbc-pad:not(.is-popup-game):not(.is-fullscreen):not(.is-gameview):not(.is-kbm) .pbc-gameview {
  height: min(32vh, 240px);
}
.pbc-pad:not(.is-popup-game):not(.is-fullscreen):not(.is-gameview):not(.is-kbm) .pbc-hud {
  top: calc(var(--pbc-safe-t) + 8px);
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
  width: min(94vw, 640px);
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 14px;
  padding: 18px 20px;
  border-radius: 14px;
  background: oklch(0.21 0.016 278 / 92%);
  border: 1px solid var(--pbc-line);
  z-index: 3;
  text-align: left;
  backdrop-filter: blur(12px);
}

.pbc-controls-legend {
  position: absolute;
  left: 50%;
  bottom: calc(var(--pbc-safe-b) + 20px);
  transform: translateX(-50%);
  z-index: 6;
  width: min(94vw, 720px);
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 20px 16px;
  border-radius: 14px;
  background: oklch(0.21 0.016 278 / 94%);
  border: 1px solid var(--pbc-line);
  backdrop-filter: blur(14px);
  box-shadow: 0 18px 48px oklch(0 0 0 / 35%);
  pointer-events: auto;
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.pbc-controls-legend.is-hidden {
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, 12px);
}
.pbc-pad.is-popup-game .pbc-controls-legend,
.pbc-pad.is-fullscreen .pbc-controls-legend {
  position: fixed;
  bottom: 24px;
  z-index: 10;
}
.pbc-controls-legend.is-compact {
  width: min(94vw, 560px);
  padding: 12px 14px;
  gap: 10px;
  opacity: 0.92;
}
.pbc-controls-legend.is-embedded {
  position: static;
  left: auto;
  bottom: auto;
  transform: none;
  width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
}
.pbc-controls-legend-head {
  text-align: left;
}
.pbc-controls-legend-eyebrow {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--pbc-accent);
}
.pbc-controls-legend-title {
  margin: 0;
  font-size: 18px;
  font-weight: 650;
  letter-spacing: -0.02em;
  color: var(--pbc-ink);
}
.pbc-controls-legend-lead {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.45;
  color: var(--pbc-muted);
}
.pbc-controls-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 20px;
}
.pbc-controls-legend.is-compact .pbc-controls-grid {
  gap: 8px 14px;
}
@media (max-width: 640px) {
  .pbc-controls-grid {
    grid-template-columns: 1fr;
  }
}
.pbc-controls-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 32px;
}
.pbc-controls-action {
  flex: 0 0 auto;
  min-width: 5.5rem;
  font-size: 13px;
  font-weight: 600;
  color: var(--pbc-ink);
  letter-spacing: -0.01em;
}
.pbc-controls-keys {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}
.pbc-key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.75rem;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid oklch(1 0 0 / 14%);
  background: oklch(0.27 0.02 278);
  color: var(--pbc-ink);
  font-family: var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  line-height: 1.2;
  box-shadow: inset 0 -1px 0 oklch(0 0 0 / 35%);
}
.pbc-controls-legend.is-compact .pbc-key {
  padding: 3px 6px;
  font-size: 10px;
}
.pbc-controls-legend-change {
  align-self: flex-start;
  margin-top: 2px;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid var(--pbc-line);
  background: transparent;
  color: var(--pbc-muted);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.pbc-controls-legend-change:hover {
  color: var(--pbc-ink);
  border-color: oklch(1 0 0 / 18%);
  background: oklch(1 0 0 / 4%);
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
