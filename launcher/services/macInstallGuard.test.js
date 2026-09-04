/**
 * Whether a Mac can install a recipe at all.
 *
 * resolveDownload refuses a direct-installer or direct-exe whose only URL ends
 * in .exe or .msi — it does not hand those to the Wine runner, it throws. So a
 * game claiming macOS with no urlMac cannot be installed there, however good
 * the compatibility runner is. Linux has no such guard and does reach Wine,
 * which is why the two platforms fail differently.
 *
 * Run: node services/macInstallGuard.test.js
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

/** The guard, lifted from resolveDownload rather than reimplemented. */
function loadGuard() {
  const src = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
  const anchor = "      process.platform === \"darwin\" &&";
  const at = src.indexOf(anchor);
  assert.notEqual(at, -1, "the macOS installer guard has moved — update this test");
  const start = src.lastIndexOf("    if (", at);
  const end = src.indexOf("    }", src.indexOf("throw new Error", at)) + 5;
  const body = src.slice(start, end);

  return (entry, platform) => {
    const effectiveUrl =
      platform === "darwin" && entry.urlMac
        ? entry.urlMac
        : platform === "linux" && entry.urlLinux
          ? entry.urlLinux
          : entry.url;
    try {
      new Function("entry", "process", "effectiveUrl", body)(entry, { platform }, effectiveUrl);
      return { blocked: false, url: effectiveUrl };
    } catch (err) {
      return { blocked: true, message: err.message };
    }
  };
}

const guard = loadGuard();

/** The recipes as actually shipped, so this tracks the catalog and not a copy. */
function recipe(slug) {
  const src = fs.readFileSync(
    path.join(__dirname, "..", "..", "platform", "src", "lib", "data", "launcherInstall.ts"),
    "utf8"
  );
  const at = src.indexOf(`\n  "${slug}": {`) >= 0 ? src.indexOf(`\n  "${slug}": {`) : src.indexOf(`\n  ${slug}: {`);
  assert.ok(at > 0, `no recipe for ${slug}`);
  const block = src.slice(at, src.indexOf("\n  },", at));
  const grab = (key) => {
    const m = new RegExp(`\\b${key}:\\s*\\n?\\s*"([^"]+)"`).exec(block);
    return m && m[1];
  };
  return { kind: grab("kind"), url: grab("url"), urlMac: grab("urlMac"), urlLinux: grab("urlLinux") };
}

test("a Windows-only installer is refused on a Mac", () => {
  const r = guard({ kind: "direct-installer", url: "https://x.test/setup.exe" }, "darwin");
  assert.equal(r.blocked, true);
  assert.match(r.message, /only ships a Windows installer/i);
});

test("the same recipe is not refused on Linux, where Wine takes it", () => {
  const r = guard({ kind: "direct-installer", url: "https://x.test/setup.exe" }, "linux");
  assert.equal(r.blocked, false);
});

test("a zip is never refused — the guard is about installers", () => {
  // Xonotic and OpenArena ship one cross-platform zip and need no urlMac.
  const r = guard({ kind: "direct-zip", url: "https://x.test/game.zip" }, "darwin");
  assert.equal(r.blocked, false);
});

test("the three games this was added for now install on a Mac", () => {
  for (const slug of ["0ad", "old-school-runescape", "albion-online"]) {
    const entry = recipe(slug);
    const r = guard(entry, "darwin");
    assert.equal(r.blocked, false, `${slug} is still refused on macOS`);
    assert.ok(entry.urlMac, `${slug} has no urlMac`);
    assert.doesNotMatch(r.url, /\.(exe|msi)$/i, `${slug} would hand a Windows installer to a Mac`);
  }
});

test("each of them still gets the Windows installer on Windows", () => {
  for (const slug of ["0ad", "old-school-runescape", "albion-online"]) {
    const r = guard(recipe(slug), "win32");
    assert.equal(r.blocked, false);
    assert.match(r.url, /\.(exe|msi)$/i, `${slug} lost its Windows installer`);
  }
});
