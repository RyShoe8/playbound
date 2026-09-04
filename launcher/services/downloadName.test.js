/**
 * What a fixed-URL download gets called on disk.
 *
 * The name is not cosmetic — every install branch dispatches on its extension.
 * `fileName` in a recipe describes the Windows build, so when a per-platform
 * override swaps the URL the name has to follow, or Linux downloads 7KAA's
 * .tar.gz, saves it as 7kaa-install-2.15.7-win32.exe, and gets handed to the
 * installer branch that opens it at the desktop and waits forever.
 *
 * SourceForge makes it harder than a basename: it serves
 * .../7kaa-2.15.7-linux-x86-64.tar.gz/download, so the basename is "download"
 * and the filename is the segment before it.
 *
 * Run: node services/downloadName.test.js
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

/** The naming block, lifted from resolveDownload rather than copied. */
function loadNamer() {
  const src = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
  const start = src.indexOf("    const overridden = effectiveUrl !== entry.url;");
  assert.notEqual(start, -1, "the naming block has moved — update this test");
  const end = src.indexOf("return { url: effectiveUrl, name,", start);
  assert.ok(end > start, "could not bound the naming block");
  const body = src.slice(start, end);

  return (entry, effectiveUrl) =>
    new Function(
      "entry",
      "effectiveUrl",
      "path",
      "URL",
      `${body} return name;`
    )(entry, effectiveUrl, path, URL);
}

const nameFor = loadNamer();

const SEVEN_KAA = {
  slug: "seven-kingdoms-ancient-adversaries",
  fileName: "7kaa-install-2.15.7-win32.exe",
  url: "https://sourceforge.net/projects/skfans/files/7KAA%202.15.7/7kaa-install-2.15.7-win32.exe/download",
};
const SEVEN_KAA_LINUX =
  "https://sourceforge.net/projects/skfans/files/7KAA%202.15.7/7kaa-2.15.7-linux-x86-64.tar.gz/download";

test("Windows keeps the recipe's own fileName", () => {
  assert.equal(nameFor(SEVEN_KAA, SEVEN_KAA.url), "7kaa-install-2.15.7-win32.exe");
});

test("a Linux override is named from the URL, not from the Windows fileName", () => {
  /*
   * The regression. Before this, `name` stayed the .exe because it merely
   * contained a dot, and the tarball was installed as though it were a setup
   * program.
   */
  assert.equal(nameFor(SEVEN_KAA, SEVEN_KAA_LINUX), "7kaa-2.15.7-linux-x86-64.tar.gz");
});

test("the resulting name is what the install branches dispatch on", () => {
  const name = nameFor(SEVEN_KAA, SEVEN_KAA_LINUX);
  assert.match(name, /\.tar\.gz$/, "must extract, not openPath");
  assert.doesNotMatch(name, /\.exe$/i);
});

test("a percent-encoded path segment is decoded", () => {
  const entry = { slug: "x", fileName: "setup.exe", url: "https://ex/setup.exe" };
  assert.equal(
    nameFor(entry, "https://ex/files/My%20Game%201.0/my-game-linux.tar.xz/download"),
    "my-game-linux.tar.xz"
  );
});

test("a plain override URL still uses its basename", () => {
  const entry = { slug: "meteorite", fileName: "meteorite-win.zip", url: "https://cdn/meteorite-win.zip" };
  assert.equal(nameFor(entry, "https://cdn/meteorite-linux.zip"), "meteorite-linux.zip");
  assert.equal(nameFor(entry, "https://cdn/Meteorite-mac.zip"), "Meteorite-mac.zip");
});

test("scanning from the end picks the file, not an earlier archive-shaped folder", () => {
  const entry = { slug: "x", fileName: "a.exe", url: "https://ex/a.exe" };
  assert.equal(
    nameFor(entry, "https://ex/releases/game-1.0.zip/linux/game-1.0-linux.tar.gz/download"),
    "game-1.0-linux.tar.gz"
  );
});

test("an unusable override URL falls back rather than resolving to nothing", () => {
  const entry = { slug: "x", fileName: "x-setup.exe", url: "https://ex/x-setup.exe" };
  const got = nameFor(entry, "https://ex/download");
  assert.ok(got && got.includes("."), "a name is always produced");
});

test("a recipe with no fileName at all still gets named", () => {
  const entry = { slug: "x", url: "https://ex/thing.zip" };
  assert.equal(nameFor(entry, "https://ex/thing.zip"), "thing.zip");
});
