"use strict";

const { chooseLanAddress } = require("./lanAddresses");

/** Same-account fallback when mDNS cannot cross a router or Windows firewall. */
function accountHosts(devices, ownDeviceId, interfaces, now = Date.now()) {
  return (Array.isArray(devices) ? devices : []).flatMap((device) => {
    if (!device || device.deviceId === ownDeviceId || !device.capabilities?.remotePlayHost) return [];
    const lastSeen = Date.parse(device.lastSeenAt || "");
    if (!Number.isFinite(lastSeen) || now - lastSeen > 150_000 || lastSeen > now + 30_000) return [];
    const address = chooseLanAddress(device.lanAddresses, interfaces);
    const port = Number(device.hostPort);
    if (!address || !Number.isInteger(port) || port < 1 || port > 65535) return [];
    return [{
      deviceId: device.deviceId,
      deviceName: device.name || "PlayBound PC",
      remotePlayHost: true,
      host: address,
      port,
      addresses: [address],
      source: "account-lan",
    }];
  });
}

function mergeHosts(mdnsHosts, accountLanHosts, ownDeviceId) {
  const merged = new Map();
  for (const host of accountLanHosts) merged.set(host.deviceId, host);
  for (const host of mdnsHosts) {
    if (host.deviceId === ownDeviceId || !host.remotePlayHost) continue;
    merged.set(host.deviceId, host);
  }
  return [...merged.values()];
}

module.exports = { accountHosts, mergeHosts };
