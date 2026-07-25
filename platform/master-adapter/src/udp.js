import dgram from "node:dgram";

const HEADER = Buffer.from([0xff, 0xff, 0xff, 0xff]);

/**
 * @param {string} host
 * @param {number} port
 * @param {string} payload
 * @param {number} timeoutMs
 * @returns {Promise<Buffer>}
 */
export function udpQuery(host, port, payload, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket("udp4");
    const packet = Buffer.concat([HEADER, Buffer.from(payload)]);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`UDP timeout ${host}:${port}`));
    }, timeoutMs);

    socket.on("error", (err) => {
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      reject(err);
    });

    socket.on("message", (msg) => {
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      resolve(msg);
    });

    socket.send(packet, port, host, (err) => {
      if (err) {
        clearTimeout(timer);
        try {
          socket.close();
        } catch {
          /* ignore */
        }
        reject(err);
      }
    });
  });
}

/**
 * Parse Quake3 / DarkPlaces getservers(Ext)Response binary address list.
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
    if (msg[i] !== 0x5c) break;
    // \EOT
    if (msg[i + 1] === 0x45 && msg[i + 2] === 0x4f && msg[i + 3] === 0x54) break;
    const host = `${msg[i + 1]}.${msg[i + 2]}.${msg[i + 3]}.${msg[i + 4]}`;
    const port = (msg[i + 5] << 8) | msg[i + 6];
    if (port > 0 && port < 65536) {
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

/**
 * @param {string} host
 * @param {number} port
 * @returns {Promise<Record<string, string> | null>}
 */
export async function getServerInfo(host, port) {
  try {
    const msg = await udpQuery(host, port, "getinfo", 2000);
    const text = msg.toString("latin1");
    const idx = text.indexOf("infoResponse");
    if (idx < 0) return null;
    return parseInfoKeys(text.slice(idx + "infoResponse".length));
  } catch {
    return null;
  }
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
