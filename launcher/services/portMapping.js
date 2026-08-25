/**
 * Inbound port reachability for peer-hosted games.
 *
 * A game hosted on a player's own machine is only joinable if inbound traffic
 * actually reaches it, which on a home connection means a NAT mapping and a
 * local firewall allowance. openraNat.js solved this for exactly one game by
 * flipping OpenRA's own `DiscoverNatDevices` setting — but that only works for
 * the handful of engines that implement UPnP themselves. Everything else needs
 * PlayBound to request the mapping on the game's behalf.
 *
 * Three mechanisms, tried in order of how widely they work:
 *   1. UPnP IGD  — SSDP discovery, then SOAP AddPortMapping. Most consumer
 *                  routers, when UPnP is enabled.
 *   2. NAT-PMP   — a few UDP bytes to the gateway. Apple routers and others.
 *   3. Firewall  — Windows only, and orthogonal: it governs whether the local
 *                  machine accepts the connection at all, so it is applied
 *                  regardless of whether a NAT mapping was obtained.
 *
 * Deliberately dependency-free. The protocol surface used here is small and
 * well specified, and adding a networking dependency to an Electron main
 * process is a supply-chain cost this does not need to carry.
 *
 * Every failure path is non-fatal by design: hosting on an open network, or
 * behind a router the player already port-forwarded by hand, must not be
 * blocked because an optional mapping attempt did not succeed.
 */

const dgram = require("dgram");
const http = require("http");
const os = require("os");
const { spawn, execFile } = require("child_process");
const fs = require("fs");
const { URL } = require("url");

const SSDP_ADDRESS = "239.255.255.250";
const SSDP_PORT = 1900;
const NAT_PMP_PORT = 5351;
const DISCOVERY_TIMEOUT_MS = 3000;
const SOAP_TIMEOUT_MS = 5000;
/** Renewed well before expiry; a lease that outlives the session strands a mapping. */
const DEFAULT_LEASE_SECONDS = 3600;

/* ────────────────────────────── pure helpers ────────────────────────────── */

/** LOCATION header from an SSDP response. Header names are case-insensitive. */
function parseSsdpLocation(response) {
  const match = /^location:\s*(.+)$/im.exec(String(response || ""));
  return match ? match[1].trim() : null;
}

/**
 * Find the WAN connection service in an IGD device description.
 *
 * A gateway advertises several services; only WANIPConnection and
 * WANPPPConnection accept AddPortMapping. Both spellings are matched because
 * DSL-style gateways expose the PPP variant.
 */
function parseWanService(xml) {
  const text = String(xml || "");
  const serviceBlocks = text.match(/<service>[\s\S]*?<\/service>/gi) || [];
  for (const block of serviceBlocks) {
    const type = /<serviceType>\s*([^<]+?)\s*<\/serviceType>/i.exec(block)?.[1];
    if (!type || !/WAN(IP|PPP)Connection:\d/i.test(type)) continue;
    const controlUrl = /<controlURL>\s*([^<]+?)\s*<\/controlURL>/i.exec(block)?.[1];
    if (!controlUrl) continue;
    return { serviceType: type, controlUrl };
  }
  return null;
}

/** Resolve a device-description controlURL, which is usually host-relative. */
function resolveControlUrl(locationUrl, controlUrl) {
  try {
    return new URL(controlUrl, locationUrl).toString();
  } catch {
    return null;
  }
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildSoapBody(serviceType, action, args) {
  const body = Object.entries(args)
    .map(([key, value]) => `<${key}>${escapeXml(value)}</${key}>`)
    .join("");
  return (
    '<?xml version="1.0"?>' +
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" ' +
    's:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body>' +
    `<u:${action} xmlns:u="${serviceType}">${body}</u:${action}>` +
    "</s:Body></s:Envelope>"
  );
}

/** Read one element's text out of a SOAP response. */
function parseSoapValue(xml, tag) {
  const match = new RegExp(`<${tag}[^>]*>\\s*([^<]*?)\\s*</${tag}>`, "i").exec(String(xml || ""));
  return match ? match[1] : null;
}

/** UPnP reports failures as a SOAP Fault with a numeric UPnPError code. */
function parseSoapError(xml) {
  const text = String(xml || "");
  if (!/<(s:)?Fault[\s>]/i.test(text)) return null;
  const code = parseSoapValue(text, "errorCode");
  const description = parseSoapValue(text, "errorDescription");
  return { code: code ? Number(code) : null, description: description || "UPnP request failed" };
}

/**
 * NAT-PMP port-mapping request (RFC 6886 §3.3): version, opcode, two reserved
 * bytes, internal port, suggested external port, requested lifetime.
 */
function buildNatPmpMapRequest({ internalPort, externalPort, protocol, lifetime }) {
  const buf = Buffer.alloc(12);
  buf.writeUInt8(0, 0);
  buf.writeUInt8(protocol === "tcp" ? 2 : 1, 1);
  buf.writeUInt16BE(0, 2);
  buf.writeUInt16BE(internalPort, 4);
  buf.writeUInt16BE(externalPort ?? internalPort, 6);
  buf.writeUInt32BE(lifetime ?? DEFAULT_LEASE_SECONDS, 8);
  return buf;
}

function parseNatPmpMapResponse(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 16) return null;
  const resultCode = buf.readUInt16BE(2);
  if (resultCode !== 0) return { ok: false, resultCode };
  return {
    ok: true,
    resultCode,
    internalPort: buf.readUInt16BE(8),
    externalPort: buf.readUInt16BE(10),
    lifetime: buf.readUInt32BE(12),
  };
}

/** RFC 6886 §3.2 — opcode 0 asks the gateway for its public address. */
function parseNatPmpExternalIp(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf.readUInt16BE(2) !== 0) return null;
  return `${buf[8]}.${buf[9]}.${buf[10]}.${buf[11]}`;
}

/** Private-range check; a "public" IP that is actually private helps nobody. */
function isPrivateIPv4(ip) {
  const parts = String(ip || "").split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  // CGNAT: a mapping here is not reachable from the public internet.
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

/** This machine's LAN address — the mapping's internal target. */
function localIPv4() {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family !== "IPv4" && entry.family !== 4) continue;
      if (entry.internal) continue;
      if (isPrivateIPv4(entry.address)) return entry.address;
    }
  }
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if ((entry.family === "IPv4" || entry.family === 4) && !entry.internal) return entry.address;
    }
  }
  return null;
}

/* ─────────────────────────────── UPnP IGD ──────────────────────────────── */

/** SSDP M-SEARCH for an Internet Gateway Device. Resolves null when none answers. */
function discoverGatewayLocation({ timeoutMs = DISCOVERY_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    let socket;
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      try {
        socket?.close();
      } catch {
        /* already closed */
      }
      resolve(value);
    };

    try {
      socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    } catch {
      resolve(null);
      return;
    }

    const timer = setTimeout(() => finish(null), timeoutMs);
    timer.unref?.();

    socket.on("error", () => finish(null));
    socket.on("message", (msg) => {
      const location = parseSsdpLocation(msg.toString("utf8"));
      if (location) {
        clearTimeout(timer);
        finish(location);
      }
    });

    const search =
      "M-SEARCH * HTTP/1.1\r\n" +
      `HOST: ${SSDP_ADDRESS}:${SSDP_PORT}\r\n` +
      'MAN: "ssdp:discover"\r\n' +
      "MX: 2\r\n" +
      "ST: urn:schemas-upnp-org:device:InternetGatewayDevice:1\r\n\r\n";

    socket.bind(() => {
      try {
        socket.send(Buffer.from(search), SSDP_PORT, SSDP_ADDRESS, (err) => {
          if (err) finish(null);
        });
      } catch {
        finish(null);
      }
    });
  });
}

function httpGet(url, timeoutMs = SOAP_TIMEOUT_MS) {
  return new Promise((resolve) => {
    let request;
    try {
      request = http.get(url, { timeout: timeoutMs }, (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          // A malicious or broken device must not be able to grow this without
          // bound; a device description is a few KB.
          if (data.length < 256 * 1024) data += chunk;
        });
        res.on("end", () => resolve(data));
      });
    } catch {
      resolve(null);
      return;
    }
    request.on("timeout", () => {
      request.destroy();
      resolve(null);
    });
    request.on("error", () => resolve(null));
  });
}

function soapRequest(controlUrl, serviceType, action, args, timeoutMs = SOAP_TIMEOUT_MS) {
  return new Promise((resolve) => {
    let target;
    try {
      target = new URL(controlUrl);
    } catch {
      resolve(null);
      return;
    }
    const body = buildSoapBody(serviceType, action, args);
    const request = http.request(
      {
        hostname: target.hostname,
        port: target.port || 80,
        path: `${target.pathname}${target.search}`,
        method: "POST",
        timeout: timeoutMs,
        headers: {
          "Content-Type": 'text/xml; charset="utf-8"',
          "Content-Length": Buffer.byteLength(body),
          SOAPAction: `"${serviceType}#${action}"`,
          Connection: "close",
        },
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          if (data.length < 256 * 1024) data += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode || 0, body: data }));
      }
    );
    request.on("timeout", () => {
      request.destroy();
      resolve(null);
    });
    request.on("error", () => resolve(null));
    request.end(body);
  });
}

/** Locate the gateway's WAN service, or null when there is no usable IGD. */
async function findUpnpService() {
  const location = await discoverGatewayLocation();
  if (!location) return null;
  const description = await httpGet(location);
  if (!description) return null;
  const service = parseWanService(description);
  if (!service) return null;
  const controlUrl = resolveControlUrl(location, service.controlUrl);
  if (!controlUrl) return null;
  return { controlUrl, serviceType: service.serviceType };
}

async function upnpAddMapping(service, { externalPort, internalPort, internalIp, protocol, description, leaseSeconds }) {
  const result = await soapRequest(service.controlUrl, service.serviceType, "AddPortMapping", {
    NewRemoteHost: "",
    NewExternalPort: externalPort,
    NewProtocol: protocol === "tcp" ? "TCP" : "UDP",
    NewInternalPort: internalPort,
    NewInternalClient: internalIp,
    NewEnabled: 1,
    NewPortMappingDescription: description,
    NewLeaseDuration: leaseSeconds,
  });
  if (!result) return { ok: false, error: "No response from gateway" };
  const fault = parseSoapError(result.body);
  if (fault) {
    /*
     * 725 (OnlyPermanentLeasesSupported) is common on cheaper gateways. It is
     * a real answer, not a hard failure, so retry once asking for a permanent
     * mapping rather than reporting the port unreachable.
     */
    if (fault.code === 725 && leaseSeconds !== 0) {
      return upnpAddMapping(service, {
        externalPort,
        internalPort,
        internalIp,
        protocol,
        description,
        leaseSeconds: 0,
      });
    }
    return { ok: false, error: `UPnP error ${fault.code ?? "?"}: ${fault.description}` };
  }
  if (result.status !== 200) return { ok: false, error: `Gateway returned HTTP ${result.status}` };
  return { ok: true };
}

async function upnpDeleteMapping(service, { externalPort, protocol }) {
  const result = await soapRequest(service.controlUrl, service.serviceType, "DeletePortMapping", {
    NewRemoteHost: "",
    NewExternalPort: externalPort,
    NewProtocol: protocol === "tcp" ? "TCP" : "UDP",
  });
  return Boolean(result && result.status === 200 && !parseSoapError(result.body));
}

async function upnpExternalIp(service) {
  const result = await soapRequest(service.controlUrl, service.serviceType, "GetExternalIPAddress", {});
  if (!result || parseSoapError(result.body)) return null;
  const ip = parseSoapValue(result.body, "NewExternalIPAddress");
  return ip && !isPrivateIPv4(ip) ? ip : null;
}

/* ─────────────────────────────── NAT-PMP ───────────────────────────────── */

/** Default gateway address, read from the OS routing table. */
function defaultGateway() {
  return new Promise((resolve) => {
    const done = (value) => resolve(value || null);
    const parse = (out) => {
      const text = String(out || "");
      if (process.platform === "win32") {
        // "0.0.0.0  0.0.0.0  192.168.1.1  192.168.1.50  25"
        const match = /\n\s*0\.0\.0\.0\s+0\.0\.0\.0\s+(\d+\.\d+\.\d+\.\d+)/.exec(text);
        return match?.[1] || null;
      }
      if (process.platform === "darwin") {
        return /gateway:\s*(\d+\.\d+\.\d+\.\d+)/.exec(text)?.[1] || null;
      }
      return /default\s+via\s+(\d+\.\d+\.\d+\.\d+)/.exec(text)?.[1] || null;
    };

    const [cmd, args] =
      process.platform === "win32"
        ? ["route", ["print", "-4", "0.0.0.0"]]
        : process.platform === "darwin"
          ? ["route", ["-n", "get", "default"]]
          : ["ip", ["route", "show", "default"]];

    try {
      execFile(cmd, args, { timeout: 4000, windowsHide: true }, (err, stdout) => {
        if (err) {
          done(null);
          return;
        }
        done(parse(stdout));
      });
    } catch {
      done(null);
    }
  });
}

function natPmpExchange(gatewayIp, payload, { timeoutMs = 2000 } = {}) {
  return new Promise((resolve) => {
    let socket;
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      try {
        socket?.close();
      } catch {
        /* already closed */
      }
      resolve(value);
    };
    try {
      socket = dgram.createSocket("udp4");
    } catch {
      resolve(null);
      return;
    }
    const timer = setTimeout(() => finish(null), timeoutMs);
    timer.unref?.();
    socket.on("error", () => finish(null));
    socket.on("message", (msg) => {
      clearTimeout(timer);
      finish(msg);
    });
    try {
      socket.send(payload, NAT_PMP_PORT, gatewayIp, (err) => {
        if (err) finish(null);
      });
    } catch {
      finish(null);
    }
  });
}

async function natPmpMap({ internalPort, externalPort, protocol, lifetime }) {
  const gateway = await defaultGateway();
  if (!gateway) return { ok: false, error: "No default gateway" };
  const response = await natPmpExchange(
    gateway,
    buildNatPmpMapRequest({ internalPort, externalPort, protocol, lifetime })
  );
  const parsed = parseNatPmpMapResponse(response);
  if (!parsed) return { ok: false, error: "No NAT-PMP response" };
  if (!parsed.ok) return { ok: false, error: `NAT-PMP result code ${parsed.resultCode}` };

  const ipResponse = await natPmpExchange(gateway, Buffer.from([0, 0]));
  const externalIp = parseNatPmpExternalIp(ipResponse);
  return { ok: true, externalPort: parsed.externalPort, externalIp };
}

/* ────────────────────────────── firewall ───────────────────────────────── */

/**
 * Allow inbound connections to the game on Windows.
 *
 * Orthogonal to NAT: without this the packets arrive and are dropped locally.
 * Adding a rule needs elevation on many machines, so failure is expected and
 * ignored — Windows also prompts the user directly the first time a program
 * listens, which covers the same ground.
 */
function ensureWindowsFirewall(exePath, ruleName) {
  if (process.platform !== "win32" || !exePath || !fs.existsSync(exePath)) return false;
  try {
    const child = spawn(
      "netsh",
      [
        "advfirewall",
        "firewall",
        "add",
        "rule",
        `name=${ruleName}`,
        "dir=in",
        "action=allow",
        `program=${String(exePath).replace(/"/g, "")}`,
        "enable=yes",
        "profile=any",
      ],
      { windowsHide: true, stdio: "ignore" }
    );
    child.on("error", () => {});
    return true;
  } catch {
    return false;
  }
}

/* ──────────────────────────────── public ───────────────────────────────── */

/** Mappings this process opened, so they can be released on quit. */
const activeMappings = new Map();

/**
 * Make a local port reachable from the internet.
 *
 * Never throws and never blocks hosting: a false `ok` means "we could not
 * confirm a mapping", which is not the same as "hosting will fail" — an open
 * network, or a router the player forwarded by hand, both land here.
 *
 * @returns {Promise<{ok: boolean, externalIp: string|null, externalPort: number,
 *   method: "upnp"|"nat-pmp"|null, firewall: boolean, error: string|null}>}
 */
async function openPort({ port, protocol = "udp", exePath = null, description = "PlayBound", leaseSeconds = DEFAULT_LEASE_SECONDS }) {
  const firewall = ensureWindowsFirewall(exePath, `PlayBound ${description}`.slice(0, 120));
  const internalIp = localIPv4();
  const result = {
    ok: false,
    externalIp: null,
    externalPort: port,
    method: null,
    firewall,
    error: null,
  };
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    result.error = "Invalid port";
    return result;
  }
  if (!internalIp) {
    result.error = "No local network address";
    return result;
  }

  const protocols = protocol === "both" ? ["udp", "tcp"] : [protocol === "tcp" ? "tcp" : "udp"];

  try {
    const service = await findUpnpService();
    if (service) {
      let allOk = true;
      let lastError = null;
      for (const proto of protocols) {
        const mapped = await upnpAddMapping(service, {
          externalPort: port,
          internalPort: port,
          internalIp,
          protocol: proto,
          description,
          leaseSeconds,
        });
        if (!mapped.ok) {
          allOk = false;
          lastError = mapped.error;
        }
      }
      if (allOk) {
        result.ok = true;
        result.method = "upnp";
        result.externalIp = await upnpExternalIp(service);
        activeMappings.set(`${port}:${protocol}`, { service, port, protocols });
        return result;
      }
      result.error = lastError;
    }
  } catch (err) {
    result.error = err?.message || String(err);
  }

  try {
    // NAT-PMP maps one protocol per request and has no "both"; the first
    // success is what the game's primary transport needs.
    for (const proto of protocols) {
      const mapped = await natPmpMap({ internalPort: port, externalPort: port, protocol: proto, lifetime: leaseSeconds });
      if (mapped.ok) {
        result.ok = true;
        result.method = "nat-pmp";
        result.externalPort = mapped.externalPort || port;
        result.externalIp = mapped.externalIp || null;
        result.error = null;
        return result;
      }
      result.error = mapped.error;
    }
  } catch (err) {
    result.error = result.error || err?.message || String(err);
  }

  return result;
}

/** Release a mapping opened by openPort. Best-effort; a lease expires anyway. */
async function closePort({ port, protocol = "udp" }) {
  const key = `${port}:${protocol}`;
  const entry = activeMappings.get(key);
  if (!entry) return false;
  activeMappings.delete(key);
  let ok = true;
  for (const proto of entry.protocols) {
    // eslint-disable-next-line no-await-in-loop
    const removed = await upnpDeleteMapping(entry.service, { externalPort: entry.port, protocol: proto });
    if (!removed) ok = false;
  }
  return ok;
}

/** Release everything this process opened — call on quit. */
async function closeAllPorts() {
  const keys = [...activeMappings.keys()];
  for (const key of keys) {
    const [portText, protocol] = key.split(":");
    // eslint-disable-next-line no-await-in-loop
    await closePort({ port: Number(portText), protocol });
  }
}

module.exports = {
  openPort,
  closePort,
  closeAllPorts,
  ensureWindowsFirewall,
  localIPv4,
  // Exported for tests.
  parseSsdpLocation,
  parseWanService,
  resolveControlUrl,
  buildSoapBody,
  parseSoapValue,
  parseSoapError,
  buildNatPmpMapRequest,
  parseNatPmpMapResponse,
  parseNatPmpExternalIp,
  isPrivateIPv4,
  findUpnpService,
  defaultGateway,
};
