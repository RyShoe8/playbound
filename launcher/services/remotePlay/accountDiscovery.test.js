"use strict";

const assert = require("assert");
const { accountHosts, mergeHosts } = require("./accountDiscovery");

const now = Date.now();
const interfaces = { "Wi-Fi": [{ family: "IPv4", address: "192.168.1.20", netmask: "255.255.255.0", internal: false }] };
const host = { deviceId: "desktop", name: "Gaming PC", capabilities: { remotePlayHost: true }, lastSeenAt: new Date(now - 10_000).toISOString(), lanAddresses: ["172.22.96.1", "192.168.1.30"], hostPort: 47998 };
assert.deepStrictEqual(accountHosts([host], "laptop", interfaces, now).map((h) => h.host), ["192.168.1.30"]);
assert.deepStrictEqual(accountHosts([host], "desktop", interfaces, now), []);
assert.deepStrictEqual(accountHosts([{ ...host, lastSeenAt: new Date(now - 300_000).toISOString() }], "laptop", interfaces, now), []);
assert.deepStrictEqual(accountHosts([{ ...host, lanAddresses: ["192.168.2.30"] }], "laptop", interfaces, now), []);
const fallback = accountHosts([host], "laptop", interfaces, now);
const mdns = { ...fallback[0], source: "mdns" };
assert.deepStrictEqual(mergeHosts([mdns], fallback, "laptop"), [mdns]);
console.log("remote play account LAN fallback ok");
