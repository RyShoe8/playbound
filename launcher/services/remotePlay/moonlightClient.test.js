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
    "stream",
    "192.168.1.50",
    "Dune Legacy",
    "--resolution",
    "1920x1080",
    "--fps",
    "60",
    "--windowed",
  ]);
}

{
  const args = buildStreamArgs({ host: "192.168.1.50", appName: "Game", resolution: "1280x720", fps: 30 });
  assert.ok(args.includes("1280x720"));
  assert.ok(args.includes("30"));
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

console.log("moonlight client wrapper ok");
