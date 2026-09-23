"use strict";

const assert = require("assert");
const { isPrivateIPv4, ownLanAddresses, chooseLanAddress } = require("./lanAddresses");

const interfaces = {
  "vEthernet (WSL)": [{ family: "IPv4", address: "172.22.96.1", netmask: "255.255.240.0", internal: false }],
  "Wi-Fi": [{ family: "IPv4", address: "192.168.1.30", netmask: "255.255.255.0", internal: false }],
};
assert.deepStrictEqual(ownLanAddresses(interfaces), ["192.168.1.30"]);
assert.strictEqual(chooseLanAddress(["172.22.96.1", "192.168.1.40"], interfaces), "192.168.1.40");
assert.strictEqual(chooseLanAddress(["192.168.2.40"], interfaces), null);
assert.strictEqual(isPrivateIPv4("8.8.8.8"), false);
assert.strictEqual(isPrivateIPv4("172.16.0.1"), true);
assert.strictEqual(isPrivateIPv4("172.32.0.1"), false);
assert.strictEqual(isPrivateIPv4("192.168.1.30"), true);
console.log("remote play LAN address selection ok");
