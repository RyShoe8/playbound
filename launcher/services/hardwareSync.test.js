"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { shouldSyncHardwareProfile } = require("./hardwareSync");

const synced = {
  launcherToken: "t",
  hardwareProfile: { cpu: {} },
  hardwareProfileSyncedAt: "2026-09-01T10:00:00.000Z",
  hardwareProfileSyncedFor: "me@example.com",
};

test("scans a PC that has never been synced", () => {
  assert.equal(shouldSyncHardwareProfile({ launcherToken: "t" }), true);
});

test("never re-scans a stored profile on its own, however old", () => {
  assert.equal(shouldSyncHardwareProfile(synced), false);
  assert.equal(shouldSyncHardwareProfile(synced, false, "me@example.com"), false);
});

test("Resync always scans", () => {
  assert.equal(shouldSyncHardwareProfile(synced, true), true);
});

test("a different account on this PC gets its own first sync", () => {
  assert.equal(shouldSyncHardwareProfile(synced, false, "friend@example.com"), true);
});

test("nothing to sync while signed out", () => {
  assert.equal(shouldSyncHardwareProfile({ ...synced, launcherToken: null }), false);
});
