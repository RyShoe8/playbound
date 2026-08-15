/**
 * settings.js — reading and writing settings.json.
 *
 * Small, but everything depends on it: the API base, the games directory, and
 * the launcher token all come from here, so it is the one module worth keeping
 * boring and well covered.
 *
 * Dependencies are injected rather than required, following telemetry.js. The
 * paths come from app.getPath(), which only exists inside Electron, and
 * safeStorage cannot be exercised in a plain node process — passing them in is
 * what lets settingsCrypto.test.js drive this module directly with a stubbed
 * keyring instead of reaching into main.js for it.
 */
const fs = require("fs");
const path = require("path");

/**
 * @param {object} deps
 * @param {string} deps.settingsFile           Absolute path to settings.json.
 * @param {string} deps.defaultGamesDir        Fallback when no gamesDir is set.
 * @param {string} deps.defaultApiBase         Fallback when no valid apiBase is set.
 * @param {(url: string) => boolean} deps.isAllowedApiBase  Origin allowlist check.
 * @param {{ isEncryptionAvailable(): boolean, encryptString(s: string): Buffer, decryptString(b: Buffer): string }} deps.safeStorage
 */
function createSettings({ settingsFile, defaultGamesDir, defaultApiBase, isAllowedApiBase, safeStorage }) {
  /**
   * Whether the OS can back an encrypted secret (DPAPI, Keychain, libsecret).
   *
   * Guarded because this is unavailable before the app is ready and on Linux
   * boxes with no keyring at all, and it throws rather than returning false.
   */
  function encryptionAvailable() {
    try {
      return safeStorage.isEncryptionAvailable();
    } catch {
      return false;
    }
  }

  /*
   * settings.json holds the launcher token, which is a durable bearer for the
   * user's whole account, in a predictable path — precisely what credential
   * stealers scrape. It is encrypted at rest against the OS account instead.
   *
   * The encoding lives at the file boundary so the ~40 places that read
   * settings.launcherToken keep seeing an ordinary string, and so an existing
   * plaintext token migrates itself on the next write. Where the OS offers no
   * backing store we keep writing plaintext rather than lock someone out of
   * their own account.
   */
  function loadSettings() {
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
    } catch {
      return {};
    }
    if (!raw || typeof raw !== "object") return {};
    const enc = typeof raw.launcherTokenEnc === "string" ? raw.launcherTokenEnc : "";
    if (enc) {
      // Callers never see ciphertext, so a stray save cannot round-trip it.
      delete raw.launcherTokenEnc;
      try {
        if (encryptionAvailable()) {
          raw.launcherToken = safeStorage.decryptString(Buffer.from(enc, "base64"));
        }
      } catch {
        /* Written by another OS account, or the keyring was reset: signed out. */
      }
    }
    return raw;
  }

  function saveSettings(settings) {
    const out = { ...settings };
    delete out.launcherTokenEnc;
    const token = typeof out.launcherToken === "string" ? out.launcherToken.trim() : "";
    if (token && encryptionAvailable()) {
      try {
        out.launcherTokenEnc = safeStorage.encryptString(token).toString("base64");
        delete out.launcherToken;
      } catch {
        /* Keep the plaintext field rather than losing the session. */
      }
    }
    fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
    // 0600 so other accounts on a shared machine cannot read it (no-op on Windows,
    // where the userData directory already carries the ACL).
    fs.writeFileSync(settingsFile, JSON.stringify(out, null, 2), { mode: 0o600 });
  }

  /** Settings → games directory, falling back to the platform default. */
  function gamesRoot() {
    const configured = String(loadSettings().gamesDir || "").trim();
    return configured || defaultGamesDir;
  }

  /**
   * The origin every API call is made against.
   *
   * Both the stored value and the env override are re-checked against the
   * allowlist on every read rather than trusted because they were accepted
   * once — settings.json is a file on disk that anything can edit.
   */
  function getApiBase() {
    const settings = loadSettings();
    const fromSettings = settings.apiBase;
    if (fromSettings && isAllowedApiBase(fromSettings)) {
      return String(fromSettings).replace(/\/$/, "");
    }
    const fromEnv = process.env.PLAYBOUND_API_BASE;
    if (fromEnv && isAllowedApiBase(fromEnv)) {
      return String(fromEnv).replace(/\/$/, "");
    }
    return defaultApiBase;
  }

  return { loadSettings, saveSettings, gamesRoot, getApiBase, encryptionAvailable };
}

module.exports = { createSettings };
