/**
 * Every network call the home page blocks on must have a deadline.
 *
 * loadPlayableRows awaits Promise.allSettled over seven IPC calls before it
 * paints a single row, so the slowest one sets how long the page takes. Node's
 * fetch has no response deadline: a connection that opens and then stalls — a
 * captive portal, a dropped VPN, a half-open socket after sleep — never
 * settles, and the home page waits for it indefinitely.
 *
 * apiFetch was written for exactly this on the game page ("one stall left it
 * on Loading game details… indefinitely") and then used at 7 of 79 fetch call
 * sites. get-server-index and get-friends were not among them, which is what
 * made the home page slow to load, sometimes.
 *
 * Run: node services/homePathDeadlines.test.js
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const MAIN = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");

/** One IPC handler's own body, brace-matched so it cannot read into the next. */
function handlerBody(channel) {
  const start = MAIN.indexOf(`ipcMain.handle("${channel}"`);
  assert.notEqual(start, -1, `no handler for "${channel}" — has the channel been renamed?`);
  let i = MAIN.indexOf("{", MAIN.indexOf("(", start));
  let depth = 0;
  for (; i < MAIN.length; i += 1) {
    if (MAIN[i] === "{") depth += 1;
    else if (MAIN[i] === "}") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  return MAIN.slice(start, i + 1);
}

/** How a body reaches the network, and whether that route is bounded. */
function deadlineOf(body) {
  if (/AbortSignal\.timeout\(/.test(body)) return "own signal";
  if (/apiFetch\(/.test(body)) return "apiFetch";
  if (/launcherJson\(/.test(body)) return "launcherJson";
  if (/\bfetch\(/.test(body)) return null; // bare fetch: unbounded
  return "no network";
}

/* The seven calls loadPlayableRows awaits, plus the shortlist lookup. */
const HOME_PATH = [
  "get-installed",
  "get-recently-played",
  "get-server-index",
  "get-friends",
  "get-parties",
  "get-lfg",
  "find-best-server",
];

for (const channel of HOME_PATH) {
  test(`${channel} cannot hang the home page`, () => {
    const how = deadlineOf(handlerBody(channel));
    assert.ok(how, `${channel} uses a bare fetch — the home page waits on it with no deadline`);
  });
}

test("launcherJson is bounded, since the home page reaches the network through it", () => {
  const at = MAIN.indexOf("async function launcherJson(");
  assert.notEqual(at, -1, "launcherJson has been renamed");
  const body = MAIN.slice(at, MAIN.indexOf("\n}", at));
  assert.match(body, /apiFetch\(/, "launcherJson went back to a bare fetch");
  assert.doesNotMatch(body, /await fetch\(/, "launcherJson still has an unbounded call");
});

test("apiFetch still applies a default deadline and still yields to an explicit one", () => {
  const at = MAIN.indexOf("async function apiFetch(");
  assert.notEqual(at, -1, "apiFetch has been renamed");
  const body = MAIN.slice(at, MAIN.indexOf("\n}", at));
  // A caller that brings its own signal keeps it; everyone else gets the default.
  assert.match(body, /if \(init\.signal\) return fetch\(url, init\);/);
  assert.match(body, /AbortSignal\.timeout\(timeoutMs\)/);
  assert.match(MAIN, /const API_TIMEOUT_MS = \d+/);
});

test("the default deadline stays within what a person will wait", () => {
  const m = /const API_TIMEOUT_MS = (\d[\d_]*)/.exec(MAIN);
  const ms = Number(m[1].replace(/_/g, ""));
  assert.ok(ms >= 3000, `${ms}ms is too tight — a slow connection would fail normal use`);
  assert.ok(ms <= 15000, `${ms}ms is longer than a page load should ever block`);
});
