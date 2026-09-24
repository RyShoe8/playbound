/**
 * Shared host display capture for Connect online multiplayer (local-co-op
 * games) and PlayBound Remote Play. One stream is reused across all
 * phone/controller/remote-play peer connections.
 *
 * Capture source is chosen in main via setDisplayMediaRequestHandler
 * (confident game-window match, else most-active screen).
 *
 * The raw capture is native resolution (often 4K on modern monitors) — real-
 * time encoding that is heavy enough to cause visible lag. Two browser-native
 * downscale paths were already tried and reverted because both crop instead
 * of scale on a desktop-capture-sourced track in this Chromium build:
 * getDisplayMedia's own width/height constraints, and
 * RTCRtpSender.scaleResolutionDownBy. Both go through the encoder's own
 * scaler; this instead draws every frame through a plain 2D canvas — a
 * completely different code path with no reported cropping bug — to produce
 * an already-correctly-sized track before it ever reaches the encoder.
 * canvas.captureStream()'s video track is combined with the raw capture's
 * audio track into the processed stream this module hands out.
 *
 * The same canvas draw also applies the crop rect (see setCropRect) when the
 * game doesn't fill the captured monitor — cropping and downscaling in one
 * pass means a small windowed game costs bitrate proportional to its own
 * size, not the whole monitor's.
 */

const TARGET_WIDTH = 1920;
const TARGET_HEIGHT = 1080;
const TARGET_FPS = 60;

let hostDisplayStream = null; // raw getDisplayMedia() stream
let processedStream = null; // canvas video track + raw audio track(s)
let sourceVideoEl = null; // hidden <video> decoding the raw stream, feeds the canvas
let canvasEl = null;
let canvasCtx = null;
let drawTimerId = null;
let currentCropRect = null;

/** Called from couch.js whenever main.js reports a new (or cleared) crop rect. */
export function setCropRect(rect) {
  currentCropRect =
    rect && rect.width > 0 && rect.height > 0
      ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
      : null;
}

function startCanvasPipeline(rawStream) {
  stopCanvasPipeline();
  sourceVideoEl = document.createElement("video");
  sourceVideoEl.muted = true;
  sourceVideoEl.playsInline = true;
  sourceVideoEl.srcObject = rawStream;
  void sourceVideoEl.play().catch(() => {});

  canvasEl = document.createElement("canvas");
  canvasEl.width = TARGET_WIDTH;
  canvasEl.height = TARGET_HEIGHT;
  canvasCtx = canvasEl.getContext("2d", { alpha: false });

  let drawnFrames = 0;
  let fpsWindowStart = performance.now();

  /*
   * Deliberately setInterval, not requestAnimationFrame. rAF is tied to the
   * compositor and gets throttled or paused outright the moment this window
   * loses focus or is occluded — exactly what happens the instant a game
   * window is focused, i.e. the entire time anyone is actually playing.
   * canvas.captureStream() just samples whatever is currently in the canvas
   * on its own schedule; if draw() stalls, viewers see a frozen frame
   * repeated at "60fps" rather than an honestly-reported drop. main.js's
   * BrowserWindow already sets backgroundThrottling: false, which protects
   * setInterval/setTimeout (but not rAF) from exactly this.
   */
  const draw = () => {
    if (!sourceVideoEl || !canvasCtx) return;
    const vw = sourceVideoEl.videoWidth;
    const vh = sourceVideoEl.videoHeight;
    if (vw > 0 && vh > 0) {
      let sx = 0;
      let sy = 0;
      let sw = vw;
      let sh = vh;
      if (currentCropRect) {
        sx = currentCropRect.left * vw;
        sy = currentCropRect.top * vh;
        sw = currentCropRect.width * vw;
        sh = currentCropRect.height * vh;
      }
      try {
        canvasCtx.drawImage(sourceVideoEl, sx, sy, sw, sh, 0, 0, TARGET_WIDTH, TARGET_HEIGHT);
        drawnFrames += 1;
      } catch {
        /* a frame not yet decoded is not an error — retry next tick */
      }
    }
    const now = performance.now();
    if (now - fpsWindowStart >= 4000) {
      console.log(`[couch-stats] canvas draw rate: ${(drawnFrames / ((now - fpsWindowStart) / 1000)).toFixed(1)}fps`);
      drawnFrames = 0;
      fpsWindowStart = now;
    }
  };
  drawTimerId = window.setInterval(draw, 1000 / TARGET_FPS);

  const canvasStream = canvasEl.captureStream(TARGET_FPS);
  const canvasVideoTrack = canvasStream.getVideoTracks()[0];
  if (canvasVideoTrack) {
    try {
      canvasVideoTrack.contentHint = "motion";
    } catch {
      /* best-effort */
    }
  }
  processedStream = new MediaStream([...(canvasVideoTrack ? [canvasVideoTrack] : []), ...rawStream.getAudioTracks()]);
  console.log(`[couch] downscaling to ${TARGET_WIDTH}x${TARGET_HEIGHT} @ ${TARGET_FPS} via canvas`);
  return processedStream;
}

function stopCanvasPipeline() {
  if (drawTimerId) window.clearInterval(drawTimerId);
  drawTimerId = null;
  if (sourceVideoEl) {
    try {
      sourceVideoEl.srcObject = null;
    } catch {
      /* ignore */
    }
    sourceVideoEl = null;
  }
  canvasEl = null;
  canvasCtx = null;
  if (processedStream) {
    for (const t of processedStream.getVideoTracks()) {
      try {
        t.stop();
      } catch {
        /* ignore */
      }
    }
    processedStream = null;
  }
}

/**
 * @param {boolean} [forceNew=false]
 * @returns {Promise<MediaStream|null>}
 */
export async function ensureHostDisplayStream(forceNew = false) {
  if (forceNew && hostDisplayStream) {
    stopHostDisplayStream();
  }
  if (hostDisplayStream && hostDisplayStream.active && processedStream) {
    const live = hostDisplayStream.getVideoTracks().some((t) => t.readyState === "live");
    if (live) {
      console.log("[couch] reusing existing display stream");
      return processedStream;
    }
    stopHostDisplayStream();
  }
  if (!navigator.mediaDevices?.getDisplayMedia) {
    console.warn("[couch] getDisplayMedia not available");
    return null;
  }
  try {
    console.log("[couch] requesting fresh display capture");
    hostDisplayStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: { ideal: 60, max: 60 },
      },
      // Electron's setDisplayMediaRequestHandler (main.js) answers this with
      // `audio: "loopback"` — WASAPI system-audio capture on Windows. `true`
      // here just opts into whatever the main-process handler decides; the
      // actual capture behavior lives there, not in this constraint object.
      audio: true,
    });
    const track = hostDisplayStream.getVideoTracks()[0];
    if (!track || track.readyState !== "live") {
      console.warn("[couch] display capture returned no live video track");
      stopHostDisplayStream();
      return null;
    }
    try {
      track.contentHint = "motion";
    } catch {
      /* contentHint is best-effort */
    }
    track.addEventListener("ended", () => {
      hostDisplayStream = null;
      stopCanvasPipeline();
    });
    try {
      // Do not add width/height here — see the module docstring. Frame rate
      // alone doesn't hit the crop bug; resolution is handled by the canvas.
      await track.applyConstraints({
        frameRate: { ideal: 60, max: 60 },
      });
    } catch {
      /* constraints best-effort */
    }
    // Best-effort only: some Windows configurations (no default output
    // device, audio capture policy) hand back a video-only stream even when
    // "loopback" was requested. Silent stream still beats no stream.
    const audioTrack = hostDisplayStream.getAudioTracks()[0];
    if (!audioTrack) {
      console.warn("[couch] display capture returned no audio track — streaming video only");
    }
    const settings = typeof track.getSettings === "function" ? track.getSettings() : {};
    console.log(
      "[couch] display track live",
      settings.width || "?",
      "x",
      settings.height || "?",
      "@",
      settings.frameRate || "?",
      audioTrack ? "+audio" : "(no audio)"
    );
    return startCanvasPipeline(hostDisplayStream);
  } catch (err) {
    console.warn("[couch] display capture failed:", err?.message || err);
    hostDisplayStream = null;
    return null;
  }
}

export function stopHostDisplayStream() {
  stopCanvasPipeline();
  if (!hostDisplayStream) return;
  for (const t of hostDisplayStream.getTracks()) {
    try {
      t.stop();
    } catch {
      /* ignore */
    }
  }
  hostDisplayStream = null;
}
