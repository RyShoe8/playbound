import dgram from "node:dgram";

const HEADER = Buffer.from([0xff, 0xff, 0xff, 0xff]);

/**
 * Collect one or more UDP reply packets until timeout or optional stop predicate.
 * @param {string} host
 * @param {number} port
 * @param {string} payload
 * @param {number} timeoutMs
 * @param {{ multi?: boolean, stopOn?: (msg: Buffer) => boolean }} [opts]
 * @returns {Promise<Buffer[]>}
 */
export function udpQueryPackets(host, port, payload, timeoutMs = 5000, opts = {}) {
  const multi = Boolean(opts.multi);
  const stopOn = opts.stopOn;
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket("udp4");
    const packet = Buffer.concat([HEADER, Buffer.from(payload)]);
    /** @type {Buffer[]} */
    const packets = [];
    let settled = false;

    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      if (err && packets.length === 0) reject(err);
      else resolve(packets);
    };

    const timer = setTimeout(() => {
      if (packets.length === 0) finish(new Error(`UDP timeout ${host}:${port}`));
      else finish(null);
    }, timeoutMs);

    socket.on("error", (err) => finish(err));

    socket.on("message", (msg) => {
      packets.push(msg);
      if (!multi) {
        finish(null);
        return;
      }
      if (stopOn && stopOn(msg)) finish(null);
    });

    socket.send(packet, port, host, (err) => {
      if (err) finish(err);
    });
  });
}

/**
 * @param {string} host
 * @param {number} port
 * @param {string} payload
 * @param {number} timeoutMs
 * @returns {Promise<Buffer>}
 */
export async function udpQuery(host, port, payload, timeoutMs = 5000) {
  const packets = await udpQueryPackets(host, port, payload, timeoutMs, { multi: false });
  if (!packets.length) throw new Error(`UDP timeout ${host}:${port}`);
  return packets[0];
}

/**
 * Master getservers may return multiple UDP datagrams; collect until timeout/EOT.
 * @param {string} host
 * @param {number} port
 * @param {string} payload
 * @param {number} timeoutMs
 * @returns {Promise<Buffer[]>}
 */
export function udpQueryMaster(host, port, payload, timeoutMs = 8000) {
  return udpQueryPackets(host, port, payload, timeoutMs, {
    multi: true,
    stopOn: (msg) => {
      const text = msg.toString("latin1");
      return text.includes("\\EOT") || text.includes("\x5cEOT");
    },
  });
}

/**
 * Skip known ASCII master-server tags (\empty, \full, \EOT).
 * @param {Buffer} msg
 * @param {number} i index of leading 0x5c
 * @returns {number} index after the tag, or -1 if not a known tag
 */
function skipAsciiMasterTag(msg, i) {
  const rest = msg.toString("latin1", i + 1, Math.min(msg.length, i + 1 + 8));
  if (rest.startsWith("EOT")) return i + 4;
  if (rest.startsWith("empty")) return i + 1 + 5;
  if (rest.startsWith("full")) return i + 1 + 4;
  return -1;
}

/**
 * Parse Quake3 / DarkPlaces getservers(Ext)Response binary address list.
 * Skips ASCII tags (\empty, \full, \EOT) that appear between binary host entries.
 * @param {Buffer} msg
 * @returns {{ host: string, port: number }[]}
 */
export function parseGetServersResponse(msg) {
  const text = msg.toString("latin1");
  let marker = text.indexOf("getserversExtResponse");
  let headerLen = "getserversExtResponse".length;
  if (marker < 0) {
    marker = text.indexOf("getserversResponse");
    headerLen = "getserversResponse".length;
  }
  if (marker < 0) return [];

  let i = marker + headerLen;
  /** @type {{ host: string, port: number }[]} */
  const servers = [];
  while (i + 7 <= msg.length) {
    if (msg[i] !== 0x5c) {
      i += 1;
      continue;
    }
    const afterTag = skipAsciiMasterTag(msg, i);
    if (afterTag >= 0) {
      i = afterTag;
      continue;
    }
    const host = `${msg[i + 1]}.${msg[i + 2]}.${msg[i + 3]}.${msg[i + 4]}`;
    const port = (msg[i + 5] << 8) | msg[i + 6];
    const octets = host.split(".").map(Number);
    const plausible =
      port > 0 &&
      port < 65536 &&
      octets.every((o) => o >= 0 && o <= 255) &&
      !(octets[0] === 0 && octets[1] === 0);
    if (plausible) {
      servers.push({ host, port });
    }
    i += 7;
  }
  return servers;
}

/**
 * @param {string} infoBody latin1 infoResponse body after header
 */
export function parseInfoKeys(infoBody) {
  const parts = infoBody.split("\\").filter(Boolean);
  /** @type {Record<string, string>} */
  const keys = {};
  for (let i = 0; i + 1 < parts.length; i += 2) {
    keys[parts[i]] = parts[i + 1];
  }
  return keys;
}

/** Strip Quake / DarkPlaces color codes from server names. */
export function stripQuakeColors(text) {
  return String(text || "")
    .replace(/\^x[0-9a-fA-F]{6}/g, "")
    .replace(/\^[0-9a-v]/g, "")
    .replace(/\^./g, "")
    .trim();
}

/**
 * @param {string} host
 * @param {number} port
 * @param {string} command
 * @param {string} responseMarker
 * @param {number} timeoutMs
 * @returns {Promise<Record<string, string> | null>}
 */
async function queryInfoKeys(host, port, command, responseMarker, timeoutMs) {
  try {
    const msg = await udpQuery(host, port, command, timeoutMs);
    const text = msg.toString("latin1");
    const idx = text.indexOf(responseMarker);
    if (idx < 0) return null;
    return parseInfoKeys(text.slice(idx + responseMarker.length));
  } catch {
    return null;
  }
}

/**
 * @param {Record<string, string> | null} info
 */
function hasUsefulInfo(info) {
  if (!info) return false;
  return Boolean(
    info.hostname ||
      info.sv_hostname ||
      info.host ||
      info.mapname ||
      info.map ||
      info.clients != null ||
      info.players != null ||
      info.sv_maxclients != null
  );
}

/**
 * @param {string} host
 * @param {number} port
 * @returns {Promise<Record<string, string> | null>}
 */
export async function getServerInfo(host, port) {
  // Prefer getstatus (richer keys on DarkPlaces / Daemon) and merge getinfo
  // so hostname/map that only appear on one response are not lost.
  const status = await queryInfoKeys(host, port, "getstatus", "statusResponse", 3500);
  const info = await queryInfoKeys(host, port, "getinfo", "infoResponse", 3500);

  /** @type {Record<string, string> | null} */
  let merged = null;
  if (hasUsefulInfo(status) || hasUsefulInfo(info)) {
    merged = { ...(status || {}), ...(info || {}) };
  }

  if (!hasUsefulInfo(merged)) {
    const challenged = await queryInfoKeys(host, port, "getinfo xxx", "infoResponse", 2500);
    if (hasUsefulInfo(challenged)) {
      merged = { ...(merged || {}), ...challenged };
    } else if (!merged) {
      return challenged;
    }
  }

  return hasUsefulInfo(merged) ? merged : merged || status || info;
}

/**
 * @template T
 * @param {T[]} items
 * @param {number} concurrency
 * @param {(item: T) => Promise<unknown>} fn
 */
export async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
