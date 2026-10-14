"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { createLocalServers } = require("./localServer");
function fixture() {
  const children = [], exits = [];
  const servers = createLocalServers({
    spawnProcess: () => {
      const child = new EventEmitter();
      child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
      child.kill = () => {}; child.pid = children.length + 1;
      children.push(child); return child;
    },
    onExit: (...args) => exits.push(args),
  });
  const start = () => servers.start("party", { exe: "fixture-server", hostLaunch: { argsTemplate: ["--server"] }, revision: children.length, settings: { password: "private-value" } });
  return { servers, start, children, exits };
}
test("a replaced server's exit never marks its replacement offline", () => {
  const f = fixture(); f.start(); f.start();
  f.children[0].emit("exit", 1);
  assert.equal(f.servers.get("party").child, f.children[1]);
  assert.deepEqual(f.exits, []);
  f.children[1].emit("exit", 1);
  assert.equal(f.servers.get("party"), null);
  assert.equal(f.exits.length, 1);
});
test("spawn errors are handled once rather than crashing the launcher", () => {
  const f = fixture(); f.start();
  f.children[0].emit("error", new Error("private executable path"));
  f.children[0].emit("exit", 1);
  assert.equal(f.exits.length, 1);
  assert.match(f.exits[0][2], /Could not start/);
  assert.doesNotMatch(f.exits[0][2], /private executable/);
});
test("both output pipes drain into bounded redacted local diagnostics", () => {
  const f = fixture(); f.start();
  const child = f.children[0];
  assert.equal(child.stdout.listenerCount("data"), 1);
  assert.equal(child.stderr.listenerCount("data"), 1);
  child.stdout.emit("data", "password=private-");
  child.stdout.emit("data", "value\n");
  child.stderr.emit("data", "gslt=another-private-token\n");
  assert.deepEqual(f.servers.get("party").logs, ["password=[redacted]", "gslt=[redacted]"]);
  child.stdout.emit("data", "x".repeat(10_000));
  child.stdout.emit("data", "\n");
  assert.equal(f.servers.get("party").logs.at(-1), "[output line omitted: too long]");
  child.stderr.emit("data", Array.from({ length: 200 }, (_, n) => `line ${n}\n`).join(""));
  assert.equal(f.servers.get("party").logs.length, 100);
  assert.equal(f.servers.get("party").logs.at(-1), "line 199");
});
