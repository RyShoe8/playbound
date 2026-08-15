/*
 * Encryption-at-rest for the launcher token.
 *
 * loadSettings/saveSettings live in main.js, which cannot be required outside
 * Electron, so the two functions are lifted out of the real source and run
 * against a stubbed keyring. That keeps the test honest — it exercises the
 * shipped code rather than a re-typed copy of it — at the cost of depending on
 * their shape, which the extract() guard below reports clearly if it changes.
 *
 * Run with: npm run test:settings
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const MAIN = path.join(__dirname, "..", "main.js");
const src = fs.readFileSync(MAIN, "utf8").replace(/\r\n/g, "\n");

function extract(name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) {
    throw new Error(`main.js no longer defines function ${name}() — update this test.`);
  }
  const end = src.indexOf("\n}\n", start);
  if (end < 0) throw new Error(`could not find the end of ${name}() in main.js`);
  return src.slice(start, end + 2);
}

const body = [extract("encryptionAvailable"), extract("loadSettings"), extract("saveSettings")].join("\n");

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

function build(available) {
  const factory = new Function(
    "fs",
    "path",
    "SETTINGS_FILE",
    "safeStorage",
    `${body}\nreturn { loadSettings, saveSettings };`
  );
  return factory(fs, path, SETTINGS_FILE, makeStorage(available));
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

let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? "OK  " : "FAIL"}  ${r.name}${r.ok || !r.extra ? "" : `  (${r.extra})`}`);
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed === 0 ? `\nAll ${results.length} checks passed.` : `\n${failed} of ${results.length} FAILED.`);
process.exit(failed === 0 ? 0 : 1);
