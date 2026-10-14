"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createLocalDiagnosticsHandler, createLocalRestartHandler } = require("./localServerDiagnostics");
const id = "0123456789abcdef01234567";
test("only a verified local party leader can read local output", async () => {
  for (const access of [{ canEdit: false, controlKind: "local" }, { canEdit: true, controlKind: "vps-agent" }, { error: "Denied" }]) {
    const handler = createLocalDiagnosticsHandler({ launcherJson: async () => access, localServers: { get: () => { throw new Error("must not read"); } } });
    assert.match((await handler(null, id)).error, /Only the self-hosting/);
  }
});
test("invalid IDs and failed authorization never expose local logs", async () => {
  const handler = createLocalDiagnosticsHandler({ launcherJson: async () => { throw new Error("private auth details"); }, localServers: {} });
  assert.match((await handler(null, "../other")).error, /Invalid party/);
  assert.equal((await handler(null, id)).error, "Could not verify access to this local server");
});
test("returns a bounded local-only snapshot for the host", async () => {
  const handler = createLocalDiagnosticsHandler({ launcherJson: async () => ({ canEdit: true, controlKind: "local" }), localServers: { get: () => ({ startedAt: 42, child: { exitCode: null, signalCode: null }, logs: Array.from({ length: 200 }, (_, n) => `line ${n}`) }) } });
  const result = await handler(null, id);
  assert.equal(result.running, true);
  assert.equal(result.lines.length, 100);
  assert.equal(result.startedAt, 42);
});

test("restart bridge only submits a fixed typed action to the party API", async () => {
  const calls = [];
  const handler = createLocalRestartHandler({ launcherJson: async (...args) => { calls.push(args); return { outcome: "queued" }; } });
  assert.match((await handler(null, "../other")).error, /Invalid party/);
  assert.equal(calls.length, 0);
  assert.equal((await handler(null, id)).outcome, "queued");
  assert.deepEqual(calls, [[`/api/parties/${id}/server-action`, { method: "POST", body: { action: "restart" } }]]);
});
