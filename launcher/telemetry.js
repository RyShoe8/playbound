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
const fs = require("fs");
const Platform = require("./platform");

/** Offline events kept for retry. The site rejects client times older than 48 h. */
const QUEUE_MAX = 200;
const QUEUE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const FLUSH_BATCH = 25;

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
 * @param {() => Record<string, string>} [deps.getAuthHeaders]
 */
function createTelemetry({
  getApiBase,
  loadSettings,
  saveSettings,
  getAppVersion,
  getAuthHeaders = (extra = {}) => extra,
  queueFile = null,
}) {
  let flushing = false;

  function readQueue() {
    if (!queueFile) return [];
    try {
      const parsed = JSON.parse(fs.readFileSync(queueFile, "utf8"));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeQueue(items) {
    if (!queueFile) return;
    try {
      if (!items.length) fs.rmSync(queueFile, { force: true });
      else fs.writeFileSync(queueFile, JSON.stringify(items.slice(-QUEUE_MAX)));
    } catch {
      // Best effort: a queue that cannot be written is just a dropped event.
    }
  }

  /** Keep an event that could not be delivered so the next launch can retry it. */
  function enqueue(body) {
    if (!queueFile || body.event === "launcher_install") return;
    const cutoff = Date.now() - QUEUE_MAX_AGE_MS;
    const live = readQueue().filter((b) => Date.parse(b.timestamp) > cutoff);
    live.push(body);
    writeQueue(live);
  }

  /**
   * Whether a failed response is worth retrying. Network errors, timeouts,
   * rate limiting and server errors are; a 4xx is the event itself being
   * wrong, and resending it would only fail again.
   */
  function isRetryable(status) {
    return status == null || status === 429 || status >= 500;
  }

  async function send(body) {
    try {
      const res = await fetch(`${getApiBase()}/api/telemetry`, {
        method: "POST",
        headers: getAuthHeaders({
          "Content-Type": "application/json",
          accept: "application/json",
          "user-agent": `playbound-launcher/${getAppVersion()} (${Platform.getOS()}; ${Platform.getArchitecture()})`,
        }),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
      return { ok: res.ok, status: res.status };
    } catch {
      return { ok: false, status: null };
    }
  }

  /** Resend queued events, oldest first, stopping at the first failure. */
  async function flushQueue() {
    if (flushing || !queueFile) return { sent: 0 };
    flushing = true;
    try {
      const cutoff = Date.now() - QUEUE_MAX_AGE_MS;
      let queue = readQueue().filter((b) => Date.parse(b.timestamp) > cutoff);
      let sent = 0;
      while (queue.length && sent < FLUSH_BATCH) {
        const result = await send(queue[0]);
        if (!result.ok && isRetryable(result.status)) break;
        queue = queue.slice(1); // delivered, or permanently rejected
        sent += 1;
      }
      writeQueue(queue);
      return { sent, remaining: queue.length };
    } finally {
      flushing = false;
    }
  }

  let launcherInstallInFlight = null;
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

      const body = {
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
      };
      const result = await send(body);
      if (result.ok) {
        // Connectivity is back: drain anything that was waiting.
        if (queueFile) void flushQueue();
      } else if (isRetryable(result.status)) {
        enqueue(body);
      }
      return { ok: result.ok };
    } catch {
      // Swallowed on purpose — see the module header.
      return { ok: false };
    }
  }

  /**
   * Record this launcher installation once, rather than inferring installs
   * from whichever unrelated event happened to arrive first.
   *
   * The anonymous id is already the launcher's stable per-install identity,
   * so key the receipt to it. Persist only after a successful response: an
   * offline first run should retry next launch instead of losing the event.
   */
  function launcherInstalled() {
    if (launcherInstallInFlight) return launcherInstallInFlight;
    launcherInstallInFlight = (async () => {
      let existingIdentity = "";
      try { existingIdentity = String(loadSettings().analyticsId || ""); } catch { /* best effort */ }
      const anonymousId = getAnonymousId();
      try {
        const settings = loadSettings();
        // A per-run fallback cannot identify an installation across updates.
        if (String(settings.analyticsId || "") !== anonymousId) return { ok: false };
        if (settings.launcherInstallTrackedId === anonymousId) {
          return { ok: true, alreadyTracked: true };
        }
        // Older launchers already created an analytics identity before install
        // receipts existed. Upgrading one must not become a new installation.
        // A fresh install keeps a pending receipt so offline first runs retry.
        if (existingIdentity.length >= MIN_ID_LENGTH && settings.launcherInstallPendingId !== anonymousId) {
          saveSettings({ ...settings, launcherInstallTrackedId: anonymousId });
          return { ok: true, alreadyTracked: true, migrated: true };
        }
        saveSettings({ ...settings, launcherInstallPendingId: anonymousId });
      } catch {
        // Avoid treating every launch as a new install when settings fail.
        return { ok: false };
      }

      const result = await track("launcher_install", { firstSeen: true });
      if (result.ok) {
        try {
          const settings = loadSettings();
          saveSettings({ ...settings, launcherInstallTrackedId: anonymousId, launcherInstallPendingId: null });
        } catch {
          // The event arrived; a failed receipt only means a possible retry.
        }
      }
      return result;
    })().finally(() => {
      launcherInstallInFlight = null;
    });
    return launcherInstallInFlight;
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
    flushQueue,
    launcherInstalled,

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
      return track("edition_launched", {
        ...editionProps(info),
        installMethod: info.installMethod || "playbound_installer",
      });
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
     * @param {number|null} [info.exitCode]
     * @param {string} [info.signal]
     * @param {string} [info.stderrTail]
     * @param {string} [info.exeBasename]
     * @param {boolean} [info.morrowindDataFound]
     * @param {boolean} [info.openmwCfgWritten]
     */
    launchFailed(info) {
      return track("launch_failed", {
        ...editionProps(info),
        code: info.code || "UNKNOWN",
        message: String(info.message || "").slice(0, 1000) || undefined,
        phase: info.phase || "play",
        exitCode: info.exitCode != null ? info.exitCode : undefined,
        signal: info.signal || undefined,
        stderrTail: info.stderrTail
          ? String(info.stderrTail).slice(0, 2048)
          : undefined,
        exeBasename: info.exeBasename
          ? String(info.exeBasename).slice(0, 120)
          : undefined,
        morrowindDataFound:
          typeof info.morrowindDataFound === "boolean" ? info.morrowindDataFound : undefined,
        openmwCfgWritten:
          typeof info.openmwCfgWritten === "boolean" ? info.openmwCfgWritten : undefined,
      });
    },

    /**
     * Install never completed. Server upserts an Admin bug from this event
     * (same path as launch_failed).
     */
    installFailed(info) {
      return track("install_failed", {
        ...editionProps(info),
        code: info.code || "INSTALL_FAILED",
        message: String(info.message || "").slice(0, 1000) || undefined,
        phase: info.phase || "install",
        version: info.version || undefined,
        versionLabel: info.versionLabel || undefined,
        repo: info.repo || undefined,
        assetPattern: info.assetPattern || undefined,
        httpStatus: info.httpStatus != null ? info.httpStatus : undefined,
        exitCode: info.exitCode != null ? info.exitCode : undefined,
        signal: info.signal || undefined,
        stderrTail: info.stderrTail
          ? String(info.stderrTail).slice(0, 2048)
          : undefined,
        exeBasename: info.exeBasename
          ? String(info.exeBasename).slice(0, 120)
          : undefined,
      });
    },

    /** Unexpected error for Admin auto-bugs. */
    error(info) {
      return track("error", {
        code: info.code || "UNKNOWN",
        message: String(info.message || "").slice(0, 1000) || undefined,
        source: "launcher",
        phase: info.phase || undefined,
        gameSlug: info.gameSlug || undefined,
        editionSlug: info.editionSlug || undefined,
        gameTitle: info.gameTitle || undefined,
      });
    },

    /**
     * Game exited. One edition-aware completion event carries the duration.
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
      return track("game_ended", props);
    },

    /** Close any session still open — used when the launcher itself quits. */
    flushOpenSessions() {
      const pending = [...openSessions.entries()];
      openSessions.clear();
      return Promise.all(
        pending.map(([, open]) => {
          const durationMs = Math.max(0, Date.now() - open.startedAt);
          const props = { ...editionProps(open.info), durationMs };
          return track("game_ended", { ...props, incomplete: true });
        })
      );
    },
  };
}

module.exports = { createTelemetry };
