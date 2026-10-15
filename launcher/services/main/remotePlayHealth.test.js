"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createRemotePlayHealth, confirmRemotePlaySession } = require("./remotePlayHealth");
test("outages back off, report once, and reset after recovery", () => {
  let time = 0; const reports = [];
  const health = createRemotePlayHealth({ now: () => time, report: phase => reports.push(phase) });
  health.failed("host_poll", "offline"); assert.equal(health.ready("host_poll"), false);
  time = 4000; assert.equal(health.ready("host_poll"), true);
  health.failed("host_poll", "offline"); time += 8000;
  health.failed("host_poll", "offline"); time += 16000;
  health.failed("host_poll", "offline"); assert.deepEqual(reports, ["host_poll"]);
  health.recovered("host_poll"); assert.equal(health.ready("host_poll"), true);
});
test("only definitive invalidity for the same token clears the account", async () => {
  let token = "old", cleared = 0;
  const deps = { token: "old", currentToken: () => token, expired: () => cleared++ };
  assert.equal(await confirmRemotePlaySession({ ...deps, validate: async () => ({ valid: true, transient: true }) }), "unknown");
  assert.equal(await confirmRemotePlaySession({ ...deps, validate: async () => { token = "new"; return { valid: false }; } }), "changed");
  assert.equal(cleared, 0); token = "old";
  assert.equal(await confirmRemotePlaySession({ ...deps, validate: async () => ({ valid: false }) }), "expired");
  assert.equal(cleared, 1);
});
