"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const { test } = require("node:test");
const { createWindowsVigemProvider } = require("./windowsVigem");

function fakeHost({ reply = true } = {}) {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.exitCode = null;
  child.killed = false;
  child.kill = () => {
    child.killed = true;
    child.emit("exit", 0);
  };
  if (reply) {
    child.stdin.on("data", () => child.stdout.write('{"ok":true}\n'));
  }
  return child;
}

test("a closed controller-host pipe fails pending commands and permits a fresh host", async () => {
  const children = [];
  const provider = createWindowsVigemProvider({
    resolveDir: () => __dirname,
    spawnHost: () => {
      const child = fakeHost({ reply: children.length > 0 });
      children.push(child);
      return child;
    },
  });
  let exits = 0;
  provider.setExitHandler(() => { exits += 1; });

  const pending = provider.probe();
  const brokenPipe = Object.assign(new Error("write EPIPE"), { code: "EPIPE" });
  children[0].stdin.destroy(brokenPipe);
  assert.deepEqual(await pending, { ok: false, reason: "write EPIPE" });
  assert.equal(exits, 1);

  assert.deepEqual(await provider.probe(), { ok: true });
  assert.equal(children.length, 2);
  provider.dispose();
});

test("a write after the helper closes does not become an uncaught stream error", async () => {
  const children = [];
  const provider = createWindowsVigemProvider({
    resolveDir: () => __dirname,
    spawnHost: () => {
      const child = fakeHost();
      children.push(child);
      return child;
    },
  });
  assert.deepEqual(await provider.probe(), { ok: true });

  children[0].stdin.end();
  provider.sendKey(0x20, "down");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(await provider.probe(), { ok: true });
  assert.equal(children.length, 2);
  provider.dispose();
});
