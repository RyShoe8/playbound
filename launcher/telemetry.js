/**
 * telemetry.js — main-process analytics for the launcher.
 *
 * Install, launch and exit are known only in the main process; the renderer
 * finds out afterwards, if at all. Reporting from here means an event still
 * fires when the window is closed to the tray, when a deep link installs
 * without any UI, and when a game outlives the launcher itself.
 *
 * Every event is edition-scoped. The launcher installs Editions, not Games
 * (see /api/launcher/editions), so each event carries gameSlug *and*
 * editionSlug/editionId. A game with no stored editions reports the
 * synthesized Official one (`virtual:<gameSlug>`) rather than dropping out of
 * the funnel, so existing installs keep reporting cleanly.
 *
 * Delivery is best effort and never throws: analytics must not be able to fail
 * an install or stop a game launching.
 */

const crypto = require("crypto");
const Platform = require("./platform");

/** Matches the site's ingest guard, which rejects ids shorter than this. */
const MIN_ID_LENGTH = 8;

/** One session per launcher run. */
const RUN_SESSION_ID = crypto.randomUUID();

/**
 * Play sessions in flight, keyed by `${gameSlug}::${editionSlug}`.
 * Holds the start time so an exit can report a real duration.
 */
const openSessions = new Map();

function sessionKey(gameSlug, editionSlug) {
  return `${gameSlug}::${editionSlug || "official"}`;
}

/**
 * Build the telemetry client.
 *
 * Dependencies are injected rather than imported so this module stays testable
 * and does not reach back into main.js.
 *
 * @param {object} deps
 * @param {() => string} deps.getApiBase
 * @param {() => object} deps.loadSettings
 * @param {(settings: object) => void} deps.saveSettings
 * @param {() => string} deps.getAppVersion
 * @param {() => string | null} [deps.getUserId]
 */
function createTelemetry({
  getApiBase,
  loadSettings,
  saveSettings,
  getAppVersion,
  getUserId = () => null,
}) {
  /**
   * A stable per-install id, persisted alongside the launcher's own settings.
   * Not tied to an account — it exists so repeat installs from one machine are
   * not counted as unique every time.
   */
  function getAnonymousId() {
    try {
      const settings = loadSettings();
      const existing = String(settings.analyticsId || "");
      if (existing.length >= MIN_ID_LENGTH) return existing;
      const id = crypto.randomUUID();
      saveSettings({ ...settings, analyticsId: id });
      return id;
    } catch {
      // Unwritable settings must not stop events; fall back to a per-run id.
      return RUN_SESSION_ID;
    }
  }

  async function track(event, properties = {}) {
    try {
      const anonymousId = getAnonymousId();
      if (!event || anonymousId.length < MIN_ID_LENGTH) return { ok: false };

      const res = await fetch(`${getApiBase()}/api/telemetry`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          accept: "application/json",
          "user-agent": `playbound-launcher/${getAppVersion()} (${Platform.getOS()}; ${Platform.getArchitecture()})`,
        },
        body: JSON.stringify({
          event: String(event),
          properties: {
            ...properties,
            source: "launcher",
            launcherVersion: getAppVersion(),
            platform: Platform.getOS(),
            osVersion: Platform.getOSVersion(),
            architecture: Platform.getArchitecture(),
          },
          timestamp: new Date().toISOString(),
          sessionId: RUN_SESSION_ID,
          anonymousId,
          userId: getUserId(),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      return { ok: res.ok };
    } catch {
      // Swallowed on purpose — see the module header.
      return { ok: false };
    }
  }

  /** Identity attached to every edition-scoped event. */
  function editionProps({ gameSlug, gameTitle, editionSlug, editionName, editionType }) {
    const slug = editionSlug || "official";
    return {
      gameSlug,
      gameTitle: gameTitle || undefined,
      // Mirrors the site's virtual-edition id so both sides agree on identity
      // for games that have no stored editions.
      editionId: `virtual:${gameSlug}`,
      editionSlug: slug,
      editionName: editionName || undefined,
      editionType: editionType || undefined,
    };
  }

  return {
    track,

    editionInstalled(info) {
      return track("edition_installed", {
        ...editionProps(info),
        installMethod: info.installMethod || "playbound_installer",
        version: info.version || undefined,
      });
    },

    editionUpdated(info) {
      return track("edition_updated", {
        ...editionProps(info),
        fromVersion: info.fromVersion || undefined,
        toVersion: info.toVersion || undefined,
      });
    },

    editionUninstalled(info) {
      return track("edition_uninstalled", editionProps(info));
    },

    /**
     * Game launched. Opens a play session so the matching exit can report a
     * duration; a second launch of the same edition replaces the open session
     * rather than stacking, since only one can really be running.
     */
    editionLaunched(info) {
      const key = sessionKey(info.gameSlug, info.editionSlug);
      openSessions.set(key, { startedAt: Date.now(), info });
      void track("edition_launched", {
        ...editionProps(info),
        installMethod: info.installMethod || "playbound_installer",
      });
      return track("session_started", { ...editionProps(info), sessionKind: "play" });
    },

    /** User clicked Play — before spawn. */
    launchAttempted(info) {
      return track("launch_attempted", {
        ...editionProps(info),
        phase: info.phase || "play",
      });
    },

    /**
     * Spawn/session never started. Server upserts an Admin bug from this event.
     * @param {object} info
     * @param {string} [info.code]
     * @param {string} [info.message]
     * @param {string} [info.phase]
     */
    launchFailed(info) {
      return track("launch_failed", {
        ...editionProps(info),
        code: info.code || "UNKNOWN",
        message: String(info.message || "").slice(0, 1000) || undefined,
        phase: info.phase || "play",
      });
    },

    /** Unexpected error for Admin auto-bugs. */
    error(info) {
      return track("error", {
        code: info.code || "UNKNOWN",
        message: String(info.message || "").slice(0, 1000) || undefined,
        source: "launcher",
        gameSlug: info.gameSlug || undefined,
        editionSlug: info.editionSlug || undefined,
        gameTitle: info.gameTitle || undefined,
      });
    },

    /**
     * Game exited. Emits both `game_ended` and `session_ended` — the first is
     * the edition-aware successor to the older game_finished event, the second
     * is the session-level pair to session_started.
     *
     * Does nothing when no session is open, so a spurious exit signal cannot
     * invent a zero-length session.
     */
    editionExited({ gameSlug, editionSlug }) {
      const key = sessionKey(gameSlug, editionSlug);
      const open = openSessions.get(key);
      if (!open) return Promise.resolve({ ok: false });
      openSessions.delete(key);

      const durationMs = Math.max(0, Date.now() - open.startedAt);
      const props = { ...editionProps(open.info), durationMs };
      void track("game_ended", props);
      return track("session_ended", { ...props, sessionKind: "play" });
    },

    /** Close any session still open — used when the launcher itself quits. */
    flushOpenSessions() {
      const pending = [...openSessions.entries()];
      openSessions.clear();
      return Promise.all(
        pending.map(([, open]) => {
          const durationMs = Math.max(0, Date.now() - open.startedAt);
          const props = { ...editionProps(open.info), durationMs };
          void track("game_ended", props);
          return track("session_ended", { ...props, sessionKind: "play", incomplete: true });
        })
      );
    },
  };
}

module.exports = { createTelemetry };
