/**
 * Which executable a locally hosted party actually starts.
 *
 * 0.3.26 started the game's own client with server arguments, because the
 * install record's exe was used instead of the dedicated binary the catalog
 * names. OpenRA's client came up, nothing bound the port, selfHostReady was
 * never set, and every other member's Join Game silently did nothing.
 *
 * Lifted out of main.js rather than reimplemented, so the test covers the code
 * that runs.
 *
 * Run: node services/localServerBinary.test.js
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function loadResolver(platform) {
  const src = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
  const start = src.indexOf("function resolveLocalServerBinary(");
  assert.notEqual(start, -1, "resolveLocalServerBinary not found in main.js");
  let i = src.indexOf("{", start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}" && --depth === 0) break;
  }
  const body = `
    ${src.slice(start, i + 1)}
    return resolveLocalServerBinary;
  `;
  return new Function("path", "fs", "process", body)(path, fs, { platform });
}

function fixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pb-server-bin-"));
  for (const rel of files) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, "");
  }
  return dir;
}

test("finds the dedicated binary the catalog names", () => {
  const dir = fixture(["OpenRA.exe", "OpenRA.Server"]);
  const resolve = loadResolver("linux");
  assert.equal(
    resolve(dir, { binaryHint: "OpenRA.Server" }),
    path.join(dir, "OpenRA.Server")
  );
});

test("does not settle for the game's own executable", () => {
  /*
   * The whole bug. A client started with Server.ListenPort= arguments looks
   * like it worked and hosts nothing, so returning null here is what lets the
   * caller fall back to the path that does work.
   */
  const dir = fixture(["OpenRA.exe"]);
  const resolve = loadResolver("win32");
  assert.equal(resolve(dir, { binaryHint: "OpenRA.Server" }), null);
});

test("adds .exe on Windows, since the catalog names the binary without it", () => {
  const dir = fixture(["teeworlds_srv.exe"]);
  assert.equal(
    loadResolver("win32")(dir, { binaryHint: "teeworlds_srv" }),
    path.join(dir, "teeworlds_srv.exe")
  );
  // The same install on Linux has no .exe and must not match a Windows guess.
  assert.equal(loadResolver("linux")(dir, { binaryHint: "teeworlds_srv" }), null);
});

test("looks one level down, where server binaries usually sit", () => {
  const dir = fixture(["bin/OpenRA.Server"]);
  assert.equal(
    loadResolver("linux")(dir, { binaryHint: "OpenRA.Server" }),
    path.join(dir, "bin", "OpenRA.Server")
  );
});

test("does not mistake a directory for a binary", () => {
  const dir = fixture(["OpenRA.Server/placeholder"]);
  assert.equal(loadResolver("linux")(dir, { binaryHint: "OpenRA.Server" }), null);
});

test("says no rather than throwing on nonsense", () => {
  // Called on every self-hosted launch; an exception here would break hosting
  // for games that simply ship no server.
  const resolve = loadResolver("win32");
  assert.equal(resolve(null, { binaryHint: "x" }), null);
  assert.equal(resolve("C:\\nope", {}), null);
  assert.equal(resolve("C:\\nope", null), null);
  assert.equal(resolve("C:\\definitely\\not\\here", { binaryHint: "x" }), null);
});
