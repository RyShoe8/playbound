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
    if (live) return hostDisplayStream;
    stopHostDisplayStream();
  }
  if (!navigator.mediaDevices?.getDisplayMedia) {
    console.warn("[couch] getDisplayMedia not available");
    return null;
  }
  try {
    hostDisplayStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: { ideal: 60, max: 60 },
        width: { ideal: 1920, max: 1920 },
        height: { ideal: 1080, max: 1080 },
      },
      audio: false,
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
      await track.applyConstraints({
        frameRate: { ideal: 60, max: 60 },
      });
    } catch {
      /* constraints best-effort */
    }
    const settings = typeof track.getSettings === "function" ? track.getSettings() : {};
    console.log(
      "[couch] display track live",
      settings.width || "?",
      "x",
      settings.height || "?",
      "@",
      settings.frameRate || "?"
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
