/**
 * Which download a fixed-URL recipe hands to each platform.
 *
 * `url` is the Windows build; `urlMac` and `urlLinux` override it when the
 * launcher is running there. A recipe that carries only `url` gives every
 * platform the Windows zip — which is what shipped for Meteorite until its
 * mac and Linux builds were mirrored, and is still what a mac user gets from
 * any recipe that has not been given the other two.
 *
 * These run the selection out of main.js rather than a copy of it.
 *
 * Run: node services/platformUrl.test.js
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

/**
 * The platform branch, lifted from resolveDownload.
 *
 * Extracted by its own comment anchor rather than a line number, so this fails
 * loudly if the block is renamed instead of silently testing nothing.
 */
function loadSelector() {
  const src = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
  const start = src.indexOf("    let effectiveUrl = entry.url;");
  assert.notEqual(start, -1, "the effectiveUrl block has moved — update this test");
  const end = src.indexOf("if (!effectiveUrl)", start);
  assert.ok(end > start, "could not bound the platform branch");
  const body = src.slice(start, end);

  return (entry, platform, arch = "x64") =>
    new Function("entry", "process", `${body} return effectiveUrl;`)(entry, { platform, arch });
}

const pick = loadSelector();

const WIN = "https://cdn.example/meteorite-win.zip";
const MAC = "https://cdn.example/meteorite-mac.zip";
const LINUX = "https://cdn.example/meteorite-linux.zip";

test("each platform gets its own build when all three are configured", () => {
  const entry = { url: WIN, urlMac: MAC, urlLinux: LINUX };
  assert.equal(pick(entry, "win32"), WIN);
  assert.equal(pick(entry, "darwin"), MAC);
  assert.equal(pick(entry, "linux"), LINUX);
});

test("a Windows-only recipe hands the Windows build to everyone", () => {
  /*
   * Not a bug in the selector — it is the shape of a recipe that was never
   * given the other two, and the reason this needs auditing across the
   * catalog rather than fixing one game at a time.
   */
  const entry = { url: WIN };
  assert.equal(pick(entry, "darwin"), WIN);
  assert.equal(pick(entry, "linux"), WIN);
});

test("a missing platform falls back rather than resolving to nothing", () => {
  // Mac configured, Linux not: Linux still gets a download instead of an error.
  const entry = { url: WIN, urlMac: MAC };
  assert.equal(pick(entry, "linux"), WIN);
  assert.equal(pick(entry, "darwin"), MAC);
});

test("an empty override is ignored, not treated as a URL", () => {
  const entry = { url: WIN, urlMac: "", urlLinux: null };
  assert.equal(pick(entry, "darwin"), WIN);
  assert.equal(pick(entry, "linux"), WIN);
});

test("an Intel Mac gets the Intel slice, Apple Silicon gets the default", () => {
  /*
   * 0 A.D. ships macos-aarch64.dmg and macos-x86_64.dmg. With one urlMac an
   * Intel Mac was handed the aarch64 build and could not run it.
   */
  const entry = { url: WIN, urlMac: "https://cdn.example/x-aarch64.dmg", urlMacX64: "https://cdn.example/x-x86_64.dmg" };
  assert.equal(pick(entry, "darwin", "arm64"), "https://cdn.example/x-aarch64.dmg");
  assert.equal(pick(entry, "darwin", "x64"), "https://cdn.example/x-x86_64.dmg");
  // Non-Mac platforms are untouched by the arch branch.
  assert.equal(pick(entry, "win32", "x64"), WIN);
});

test("a recipe with only urlMac still serves every Mac, as before", () => {
  const entry = { url: WIN, urlMac: MAC };
  assert.equal(pick(entry, "darwin", "arm64"), MAC);
  assert.equal(pick(entry, "darwin", "x64"), MAC);
});

test("Freeciv hands Linux the AppImage and Windows the setup exe", () => {
  /*
   * The AppImage is the game, not an installer, so the install path has a
   * branch for it — see the .appimage check in main.js. Without urlLinux this
   * recipe gave Linux a Windows setup .exe to run under Wine.
   */
  const src = fs.readFileSync(
    path.join(__dirname, "..", "..", "platform", "src", "lib", "data", "launcherInstall.ts"),
    "utf8"
  );
  const at = src.indexOf("\n  freeciv: {");
  assert.ok(at > 0, "no freeciv recipe found");
  const block = src.slice(at, src.indexOf("\n  },", at));
  const grab = (key) => (new RegExp(`\\b${key}:\\s*\\n?\\s*"([^"]+)"`).exec(block) || [])[1];
  const entry = { url: grab("url"), urlLinux: grab("urlLinux") };

  assert.match(pick(entry, "linux"), /\.AppImage$/i);
  assert.match(pick(entry, "win32"), /\.exe$/i);
});

test("Meteorite's shipped recipe resolves a distinct build per platform", () => {
  // The real values, read from the catalog recipe this was added for.
  const recipe = fs.readFileSync(
    path.join(__dirname, "..", "..", "platform", "src", "lib", "data", "launcherInstall.ts"),
    "utf8"
  );
  const block = recipe.slice(recipe.indexOf("  meteorite: {"));
  const grab = (key) => {
    const m = new RegExp(`${key}:\\s*\\n?\\s*"([^"]+)"`).exec(block);
    return m && m[1];
  };
  const entry = { url: grab("url"), urlMac: grab("urlMac"), urlLinux: grab("urlLinux") };

  assert.ok(entry.url && entry.urlMac && entry.urlLinux, "all three platforms must be configured");
  const picked = new Set([
    pick(entry, "win32"),
    pick(entry, "darwin"),
    pick(entry, "linux"),
  ]);
  assert.equal(picked.size, 3, "each platform must resolve to a different file");
  assert.match(pick(entry, "darwin"), /mac/);
  assert.match(pick(entry, "linux"), /linux/);
  assert.match(pick(entry, "win32"), /win/);
});
