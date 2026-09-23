/**
 * Sunshine host wrapper — config generation and process lifecycle against a
 * fake `spawnFn`/`resolveDir` (no real Sunshine binary, no real process).
 */

"use strict";

const assert = require("assert");
const os = require("os");
const path = require("path");
const fs = require("fs");
const { generateSunshineConfig, createSunshineHost } = require("./sunshineHost");

/* ── generateSunshineConfig ───────────────────────────────────────────────── */

{
  const conf = generateSunshineConfig({ port: 47989, pin: "1234", deviceName: "Ryan's Gaming PC" });
  assert.match(conf, /port = 47989/);
  assert.match(conf, /pin = 1234/);
  assert.match(conf, /sunshine_name = Ryan's Gaming PC/);
}

/* ── createSunshineHost: missing binary is reported, never crashes ──────── */

{
  const host = createSunshineHost({ resolveDir: () => null, spawnFn: () => { throw new Error("must not spawn"); } });
  const result = host.start({ port: 1, pin: "1", deviceName: "PC", configDir: os.tmpdir() });
  assert.strictEqual(result.ok, false);
  assert.match(result.reason, /missing/i);
  assert.strictEqual(host.isRunning(), false);
}

/* ── createSunshineHost: starts, writes config, tracks running state ────── */

{
  const spawnCalls = [];
  const fakeChild = { killed: false, on: () => {}, kill() { this.killed = true; } };
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pb-sunshine-test-"));

  const host = createSunshineHost({
    resolveDir: () => tmpDir,
    spawnFn: (exe, args, opts) => {
      spawnCalls.push({ exe, args, opts });
      return fakeChild;
    },
  });

  const result = host.start({ port: 47989, pin: "5678", deviceName: "PC1", configDir: tmpDir });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(host.isRunning(), true);
  assert.strictEqual(spawnCalls.length, 1);
  assert.match(spawnCalls[0].exe, /sunshine\.exe$/);

  const confPath = path.join(tmpDir, "sunshine.conf");
  assert.ok(fs.existsSync(confPath), "starting must write sunshine.conf to configDir");
  assert.match(fs.readFileSync(confPath, "utf8"), /pin = 5678/);

  // Starting again while already running must not spawn a second process.
  const second = host.start({ port: 47989, pin: "5678", deviceName: "PC1", configDir: tmpDir });
  assert.strictEqual(second.alreadyRunning, true);
  assert.strictEqual(spawnCalls.length, 1);

  host.stop();
  assert.strictEqual(host.isRunning(), false);
  assert.strictEqual(fakeChild.killed, true);

  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log("sunshine host wrapper ok");
