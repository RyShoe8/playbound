/**
 * Shared host display capture for Connect online multiplayer (local-co-op games).
 * One stream is reused across all phone/controller peer connections.
 *
 * Capture source is chosen in main via setDisplayMediaRequestHandler
 * (confident game-window match, else most-active screen).
 */

let hostDisplayStream = null;

/**
 * @param {boolean} [forceNew=false]
 * @returns {Promise<MediaStream|null>}
 */
export async function ensureHostDisplayStream(forceNew = false) {
  if (forceNew && hostDisplayStream) {
    stopHostDisplayStream();
  }
  if (hostDisplayStream && hostDisplayStream.active) {
    const live = hostDisplayStream.getVideoTracks().some((t) => t.readyState === "live");
    if (live) {
      console.log("[couch] reusing existing display stream");
      return hostDisplayStream;
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
        width: { ideal: 1920, max: 1920 },
        height: { ideal: 1080, max: 1080 },
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
    });
    try {
      /*
       * The width/height requested in the initial getDisplayMedia() call
       * above are routinely ignored for desktop-capture sources — Chromium
       * hands back the source's native resolution regardless. Re-applying
       * them here, post-capture, is the actual way to get Chromium to
       * downscale a desktop-capture track. Without this, a 4K host streams
       * at native ~3840x2160: real-time software-encoding that is heavy
       * enough that the encoder can end up never producing a deliverable
       * first frame, which reads as the stream hanging forever rather than
       * as a quality problem.
       */
      await track.applyConstraints({
        width: { ideal: 1920, max: 1920 },
        height: { ideal: 1080, max: 1080 },
        frameRate: { ideal: 60, max: 60 },
      });
    } catch {
      /* constraints best-effort */
    }
    // Best-effort only: some Windows configurations (no default output
    // device, audio capture policy) hand back a video-only stream even when
    // "loopback" was requested. Silent stream still beats no stream, so this
    // never fails ensureHostDisplayStream — see couch.js's attachDisplayTracks,
    // which simply adds nothing to the audio transceiver when no track exists.
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
    return hostDisplayStream;
  } catch (err) {
    console.warn("[couch] display capture failed:", err?.message || err);
    hostDisplayStream = null;
    return null;
  }
}

export function stopHostDisplayStream() {
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
