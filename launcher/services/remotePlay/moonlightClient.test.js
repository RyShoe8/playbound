/**
 * Moonlight client wrapper — stream-argument building and process lifecycle
 * against a fake `spawnFn`/`resolveDir` (no real Moonlight binary).
 */

"use strict";

const assert = require("assert");
const { buildStreamArgs, createMoonlightClient } = require("./moonlightClient");

/* ── buildStreamArgs ──────────────────────────────────────────────────────── */

{
  const args = buildStreamArgs({ host: "192.168.1.50", appName: "Dune Legacy" });
  assert.deepStrictEqual(args, [
    "--resolution",
    "1920x1080",
    "--fps",
    "60",
    "--display-mode",
    "windowed",
    "--quit-after",
    "stream",
    "192.168.1.50",
    "Dune Legacy",
  ]);
}

{
  const args = buildStreamArgs({
    host: "192.168.1.50",
    appName: "Game",
    resolution: "1280x720",
    fps: 30,
    displayMode: "fullscreen",
  });
  assert.ok(args.includes("1280x720"));
  assert.ok(args.includes("30"));
  assert.ok(args.includes("fullscreen"));
  assert.ok(args.includes("--display-mode"));
  assert.ok(args.includes("--quit-after"));
}

/* ── createMoonlightClient: missing binary reports "needs repair" ───────── */

{
  const client = createMoonlightClient({
    resolveDir: () => null,
    spawnFn: () => {
      throw new Error("must not spawn");
    },
  });
  const result = client.startStream({ host: "192.168.1.50", appName: "Game" });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.repair, true, "a missing binary must surface as a repairable state, not a bare error");
}

/* ── createMoonlightClient: starts, tracks streaming state, refuses a second stream ── */

{
  const spawnCalls = [];
  const handlers = {};
  const fakeChild = {
    killed: false,
    on(event, cb) {
      handlers[event] = cb;
    },
    kill() {
      this.killed = true;
    },
  };

  const client = createMoonlightClient({
    resolveDir: () => "/vendored/moonlight",
    spawnFn: (exe, args, opts) => {
      spawnCalls.push({ exe, args, opts });
      return fakeChild;
    },
  });

  let exitFired = false;
  const result = client.startStream({
    host: "192.168.1.50",
    appName: "Dune Legacy",
    onExit: () => {
      exitFired = true;
    },
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(client.isStreaming(), true);
  assert.match(spawnCalls[0].exe, /moonlight\.exe$/);

  const second = client.startStream({ host: "x", appName: "y" });
  assert.strictEqual(second.ok, false, "a second concurrent stream must be refused, not silently double-launched");

  // Simulate the process exiting on its own (game closed on host, stream ended).
  handlers.exit();
  assert.strictEqual(client.isStreaming(), false);
  assert.strictEqual(exitFired, true, "onExit must fire so the caller can return the player to PlayBound's UI");
}

/* ── createMoonlightClient: isHostPaired and pairHost ───────────────────── */

(async () => {
  const spawnCalls = [];
  const client = createMoonlightClient({
    resolveDir: () => "/vendored/moonlight",
    spawnFn: (exe, args) => {
      spawnCalls.push({ exe, args });
      const action = args[0];
      const handlers = {};
      const fake = {
        stdout: { on: () => {} },
        stderr: { on: () => {} },
        on(event, cb) {
          handlers[event] = cb;
          if (event === "exit") {
            // If action is "list", simulate paired (0)
            if (action === "list") {
              setTimeout(() => cb(0), 10);
            }
            // If action is "pair", simulate exit 0
            if (action === "pair") {
              setTimeout(() => cb(0), 10);
            }
          }
        },
        kill() {},
      };
      return fake;
    },
  });

  const isPaired = await client.isHostPaired({ host: "192.168.1.50" });
  assert.equal(isPaired, true);
  assert.ok(spawnCalls.some((c) => c.args[0] === "list" && c.args[1] === "192.168.1.50"));

  const pairResult = await client.pairHost({ host: "192.168.1.50", pin: "4321" });
  assert.equal(pairResult.ok, true);
  assert.ok(spawnCalls.some((c) => c.args[0] === "pair" && c.args[1] === "192.168.1.50" && c.args[3] === "4321"));

  console.log("moonlight client wrapper ok");
})();
