/**
 * PlayBound Remote LAN discovery — TXT record encode/decode (no real mDNS,
 * no network) and the service wrapper against a fake Bonjour instance.
 */

"use strict";

const assert = require("assert");
const { encodeTxt, decodeTxt, createDiscoveryService } = require("./discovery");

/* ── encodeTxt / decodeTxt round-trip ────────────────────────────────────── */

{
  const txt = encodeTxt({
    deviceId: "abc123",
    deviceName: "Ryan's Gaming PC",
    capabilities: { remotePlayHost: true, hardwareEncode: true },
  });
  assert.deepStrictEqual(txt, {
    deviceId: "abc123",
    deviceName: "Ryan's Gaming PC",
    remotePlayHost: "1",
    hardwareEncode: "1",
  });

  const decoded = decodeTxt(txt);
  assert.deepStrictEqual(decoded, {
    deviceId: "abc123",
    deviceName: "Ryan's Gaming PC",
    remotePlayHost: true,
    hardwareEncode: true,
  });
}

/* ── decodeTxt handles bonjour-service's Buffer-valued TXT records ──────── */

{
  const decoded = decodeTxt({
    deviceId: Buffer.from("xyz789"),
    deviceName: Buffer.from("Office PC"),
    remotePlayHost: Buffer.from("1"),
    hardwareEncode: Buffer.from("0"),
  });
  assert.deepStrictEqual(decoded, {
    deviceId: "xyz789",
    deviceName: "Office PC",
    remotePlayHost: true,
    hardwareEncode: false,
  });
}

/* ── A service with no deviceId is not a PlayBound device, however it looks ── */

{
  assert.strictEqual(decodeTxt(null), null);
  assert.strictEqual(decodeTxt({}), null);
  assert.strictEqual(decodeTxt({ deviceName: "Something" }), null);
}

/* ── decodeTxt falls back to a friendly name when deviceName is missing ─── */

{
  const decoded = decodeTxt({ deviceId: "abc" });
  assert.strictEqual(decoded.deviceName, "PlayBound PC");
}

/* ── createDiscoveryService against a fake Bonjour: advertising ─────────── */

{
  const stopped = [];
  const published = [];
  const fakeBonjour = {
    publish(opts) {
      published.push(opts);
      return { stop: () => stopped.push(opts.name) };
    },
    find() {
      throw new Error("not used in this test");
    },
    destroy() {},
  };
  const svc = createDiscoveryService({ createBonjour: () => fakeBonjour });

  svc.startAdvertising({ deviceId: "d1", deviceName: "PC1", port: 47990, capabilities: {} });
  assert.strictEqual(published.length, 1);
  assert.strictEqual(published[0].type, "playbound-remote");
  assert.strictEqual(published[0].txt.deviceId, "d1");

  // Idempotent: calling again while already advertising does not republish.
  svc.startAdvertising({ deviceId: "d1", deviceName: "PC1", port: 47990, capabilities: {} });
  assert.strictEqual(published.length, 1, "startAdvertising must be a no-op while already advertising");

  svc.stopAdvertising();
  assert.deepStrictEqual(stopped, ["PC1"]);

  // Stopping twice must not throw.
  assert.doesNotThrow(() => svc.stopAdvertising());
}

/* ── createDiscoveryService against a fake Bonjour: browsing ────────────── */

{
  const handlers = {};
  const fakeBrowser = {
    on(event, cb) {
      handlers[event] = cb;
    },
    stop() {},
  };
  const fakeBonjour = {
    publish() {
      throw new Error("not used in this test");
    },
    find() {
      return fakeBrowser;
    },
    destroy() {},
  };
  const svc = createDiscoveryService({ createBonjour: () => fakeBonjour });

  const found = [];
  const lost = [];
  svc.startBrowsing(
    (device) => found.push(device),
    (deviceId) => lost.push(deviceId)
  );

  handlers.up({
    txt: { deviceId: "host1", deviceName: "Ryan's Gaming PC", remotePlayHost: "1", hardwareEncode: "1" },
    host: "rgpc.local",
    port: 47990,
    addresses: ["192.168.1.50"],
  });
  assert.strictEqual(found.length, 1);
  assert.strictEqual(found[0].deviceId, "host1");
  assert.strictEqual(found[0].remotePlayHost, true);
  assert.deepStrictEqual(svc.listSeenDevices().map((d) => d.deviceId), ["host1"]);

  // A foreign service with no deviceId must never surface as a "found" device.
  handlers.up({ txt: {}, host: "unrelated.local", port: 9999, addresses: [] });
  assert.strictEqual(found.length, 1, "a non-PlayBound mDNS service must not be reported as found");

  handlers.down({ txt: { deviceId: "host1" } });
  assert.deepStrictEqual(lost, ["host1"]);
  assert.strictEqual(svc.listSeenDevices().length, 0, "a lost device must be removed from the seen list");
}

console.log("remote play discovery ok");
