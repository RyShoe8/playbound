/*
 * Encryption-at-rest for the launcher token, plus API-base resolution.
 *
 * settings.js takes its paths and its keyring as injected dependencies, so this
 * drives the real module directly with a stubbed safeStorage — no Electron and
 * no reaching into main.js.
 *
 * Run with: npm run test:settings
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createSettings } = require("./settings");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pb-settings-"));
const SETTINGS_FILE = path.join(tmp, "settings.json");

/** Stand-in for DPAPI/Keychain: reversible, and never equal to the plaintext. */
function makeStorage(available) {
  return {
    isEncryptionAvailable: () => {
      if (available === "throw") throw new Error("no keyring");
      return available;
    },
    encryptString: (s) => Buffer.from("ENC:" + s, "utf8"),
    decryptString: (buf) => {
      const s = buf.toString("utf8");
      if (!s.startsWith("ENC:")) throw new Error("bad ciphertext");
      return s.slice(4);
    },
  };
}

function build(available, { isAllowedApiBase = () => true } = {}) {
  return createSettings({
    settingsFile: SETTINGS_FILE,
    defaultGamesDir: path.join(tmp, "Games"),
    defaultApiBase: "https://playbound.club",
    isAllowedApiBase,
    safeStorage: makeStorage(available),
  });
}

const results = [];
const check = (name, cond, extra = "") => results.push({ name, ok: Boolean(cond), extra });
const raw = () => JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));

// Encrypted round trip.
{
  const { loadSettings, saveSettings } = build(true);
  saveSettings({ launcherToken: "secret-abc", gamesDir: "D:\\Games" });
  const onDisk = raw();
  check("token is not on disk in plaintext", !("launcherToken" in onDisk), JSON.stringify(onDisk));
  check("ciphertext field written", typeof onDisk.launcherTokenEnc === "string");
  check(
    "plaintext string absent from the file bytes",
    !fs.readFileSync(SETTINGS_FILE, "utf8").includes("secret-abc")
  );
  const back = loadSettings();
  check("token decrypts back", back.launcherToken === "secret-abc", back.launcherToken);
  check("callers never see ciphertext", !("launcherTokenEnc" in back));
  check("other settings survive", back.gamesDir === "D:\\Games");
}

// An existing plaintext token migrates on the next write.
{
  fs.writeFileSync(
    SETTINGS_FILE,
    JSON.stringify({ launcherToken: "legacy-xyz", apiBase: "https://playbound.club" })
  );
  const { loadSettings, saveSettings } = build(true);
  const loaded = loadSettings();
  check("legacy plaintext still readable", loaded.launcherToken === "legacy-xyz");
  saveSettings(loaded);
  const onDisk = raw();
  check("legacy token migrated to ciphertext", !("launcherToken" in onDisk) && Boolean(onDisk.launcherTokenEnc));
  check("apiBase preserved through migration", onDisk.apiBase === "https://playbound.club");
  check("migrated token still loads", build(true).loadSettings().launcherToken === "legacy-xyz");
}

// No keyring: keep working rather than lock the user out of their account.
{
  fs.rmSync(SETTINGS_FILE, { force: true });
  const { loadSettings, saveSettings } = build(false);
  saveSettings({ launcherToken: "plain-fallback" });
  check("falls back to plaintext when unavailable", raw().launcherToken === "plain-fallback");
  check("fallback token loads", loadSettings().launcherToken === "plain-fallback");
}

// A throwing availability probe must not take startup down.
{
  fs.rmSync(SETTINGS_FILE, { force: true });
  const { loadSettings, saveSettings } = build("throw");
  saveSettings({ launcherToken: "throwy" });
  check("survives a throwing keyring probe", loadSettings().launcherToken === "throwy");
}

// Ciphertext from another OS account reads as signed out, not as a crash.
{
  fs.writeFileSync(
    SETTINGS_FILE,
    JSON.stringify({ launcherTokenEnc: Buffer.from("garbage").toString("base64") })
  );
  check("undecryptable token yields signed-out", !build(true).loadSettings().launcherToken);
}

// A corrupt or empty settings file must read as empty, not throw.
{
  fs.writeFileSync(SETTINGS_FILE, "{ not json");
  check("corrupt settings file yields {}", Object.keys(build(true).loadSettings()).length === 0);
  fs.writeFileSync(SETTINGS_FILE, "\"a string\"");
  check("non-object settings file yields {}", Object.keys(build(true).loadSettings()).length === 0);
}

/*
 * getApiBase re-checks the allowlist on every read. settings.json is a file on
 * disk, so a stored origin that was valid when written is not evidence it still
 * passes — these two pin that it is re-tested rather than trusted.
 */
{
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ apiBase: "https://evil.example" }));
  const rejecting = build(true, { isAllowedApiBase: (u) => u === "https://playbound.club" });
  check("disallowed stored apiBase falls back to the default", rejecting.getApiBase() === "https://playbound.club");

  fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ apiBase: "https://playbound.club/" }));
  const accepting = build(true);
  check("allowed stored apiBase is used, trailing slash trimmed", accepting.getApiBase() === "https://playbound.club");
}

// gamesRoot falls back when unset or blank.
{
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ gamesDir: "   " }));
  check("blank gamesDir falls back to the default", build(true).gamesRoot() === path.join(tmp, "Games"));
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ gamesDir: "D:\\Elsewhere" }));
  check("configured gamesDir is honoured", build(true).gamesRoot() === "D:\\Elsewhere");
}

let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? "OK  " : "FAIL"}  ${r.name}${r.ok || !r.extra ? "" : `  (${r.extra})`}`);
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed === 0 ? `\nAll ${results.length} checks passed.` : `\n${failed} of ${results.length} FAILED.`);
process.exit(failed === 0 ? 0 : 1);
