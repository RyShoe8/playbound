/**
 * A browser-side memory that this person has the PlayBound launcher.
 *
 * `openPlayboundDeepLink` can only guess whether the launcher took a link, so a
 * missed guess used to download Setup for people who already have it. Anything
 * that proves the launcher exists records it here, and the install buttons then
 * stop offering the download as an automatic fallback.
 *
 * Browser storage can be empty or throw (private windows, blocked site data), so
 * every access is guarded and "unknown" simply means the old behaviour.
 */
const KEY = "playbound_launcher_known";

export function readLauncherKnown(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function rememberLauncherKnown(): void {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(KEY, "1");
  } catch {
    /* storage unavailable: the fallback simply stays available */
  }
}
