"use strict";

const net = require("net");

function ipNumber(address) {
  if (net.isIP(address) !== 4) return null;
  return address.split(".").reduce((value, octet) => (value << 8) | Number(octet), 0) >>> 0;
}

function isPrivateIPv4(address) {
  const n = ipNumber(address);
  if (n == null) return false;
  return (n >>> 24) === 10 || (n >>> 20) === 0xac1 || (n >>> 16) === 0xc0a8;
}

function physicalLanInterfaces(interfaces) {
  const all = interfaces || require("os").networkInterfaces();
  const results = [];
  for (const [name, entries] of Object.entries(all)) {
    if (/vethernet|wsl|virtual|vmware|vbox|docker|hyper-v|netbird|tailscale|zerotier|loopback/i.test(name)) continue;
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal && isPrivateIPv4(entry.address)) results.push(entry);
    }
  }
  return results;
}

function ownLanAddresses(interfaces) {
  return [...new Set(physicalLanInterfaces(interfaces).map((entry) => entry.address))];
}

function sameSubnet(address, own) {
  const target = ipNumber(address);
  const local = ipNumber(own.address);
  const mask = ipNumber(own.netmask);
  return target != null && local != null && mask != null && (target & mask) === (local & mask);
}

function chooseLanAddress(candidates, interfaces) {
  const addresses = (Array.isArray(candidates) ? candidates : []).filter(isPrivateIPv4);
  const own = physicalLanInterfaces(interfaces);
  return addresses.find((address) => own.some((entry) => sameSubnet(address, entry))) || null;
}

module.exports = { isPrivateIPv4, ownLanAddresses, chooseLanAddress };
