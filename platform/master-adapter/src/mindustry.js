import dgram from "node:dgram";
import { mapPool } from "./udp.js";
import { MAX_SERVERS } from "./types.js";

const LIST_URL =
  "https://raw.githubusercontent.com/Anuken/MindustryServerList/main/servers_v8.json";

/**
 * @param {Buffer} buf
 * @param {{ i: number }} cur
 */
function readString(buf, cur) {
  if (cur.i >= buf.length) return "";
  const len = buf[cur.i++] & 0xff;
  if (cur.i + len > buf.length) return "";
  const s = buf.subarray(cur.i, cur.i + len).toString("utf8");
  cur.i += len;
  return s;
}

/**
 * @param {Buffer} buf
 * @param {{ i: number }} cur
 */
function readInt(buf, cur) {
  if (cur.i + 4 > buf.length) return 0;
  const v = buf.readInt32BE(cur.i);
  cur.i += 4;
  return v;
}

/**
 * @param {Buffer} buf
 */
function parseMindustryInfo(buf) {
  const cur = { i: 0 };
  const name = readString(buf, cur);
  const map = readString(buf, cur);
  const players = readInt(buf, cur);
  const wave = readInt(buf, cur);
  const version = readInt(buf, cur);
  const versionType = readString(buf, cur);
  const gamemode = cur.i < buf.length ? buf[cur.i++] : 0;
  const playerLimit = readInt(buf, cur);
  const description = readString(buf, cur);
  const modeName = readString(buf, cur);
  return {
    name,
    map,
    players,
    wave,
    version,
    versionType,
    gamemode,
    playerLimit,
    description,
    modeName,
  };
}

/**
 * Raw UDP (no Quake header).
 * @param {string} host
 * @param {number} port
 * @param {Buffer} payload
 * @param {number} timeoutMs
 * @returns {Promise<Buffer>}
 */
function udpRaw(host, port, payload, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket("udp4");
    const timer = setTimeout(() => {
      try {
        socket.close();
      } catch {
        /* ignore */
      }
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

    socket.send(payload, port, host, (err) => {
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
 * @param {string} host
 * @param {number} port
 */
async function pingMindustry(host, port) {
  try {
    const msg = await udpRaw(host, port, Buffer.from([-2, 1]), 2000);
    return parseMindustryInfo(msg);
  } catch {
    return null;
  }
}

/**
 * @param {string} addr
 * @returns {{ host: string, port: number } | null}
 */
function parseAddr(addr) {
  const s = String(addr || "").trim();
  if (!s) return null;
  const idx = s.lastIndexOf(":");
  if (idx > 0) {
    const host = s.slice(0, idx);
    const port = Number(s.slice(idx + 1));
    if (host && Number.isFinite(port) && port > 0) return { host, port };
  }
  return { host: s, port: 6567 };
}

/** @returns {Promise<import('./types.js').GameServer[]>} */
export async function pollMindustry() {
  const res = await fetch(LIST_URL, {
    headers: { "user-agent": "PlayBound/1.0", accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`Mindustry server list returned ${res.status}`);
  const groups = await res.json();
  if (!Array.isArray(groups)) return [];

  /** @type {{ host: string, port: number, group: string }[]} */
  const targets = [];
  const seen = new Set();
  for (const g of groups) {
    const groupName = String(g?.name || "Mindustry");
    const addrs = Array.isArray(g?.address) ? g.address : [];
    for (const a of addrs) {
      const parsed = parseAddr(a);
      if (!parsed) continue;
      const key = `${parsed.host}:${parsed.port}`;
      if (seen.has(key)) continue;
      seen.add(key);
      targets.push({ ...parsed, group: groupName });
    }
  }

  const infos = await mapPool(targets.slice(0, 180), 24, async (t) => {
    const info = await pingMindustry(t.host, t.port);
    return { t, info };
  });

  /** @type {import('./types.js').GameServer[]} */
  const servers = [];
  for (const row of infos) {
    if (!row?.t) continue;
    const { t, info } = row;
    const id = `${t.host}:${t.port}`;
    if (info) {
      servers.push({
        id,
        name: info.name || t.group,
        host: t.host,
        port: t.port,
        players: Number(info.players) || 0,
        maxPlayers: info.playerLimit > 0 ? info.playerLimit : null,
        map: info.map || null,
        gameType: info.modeName || info.versionType || t.group,
        location: null,
        protected: false,
      });
    } else {
      servers.push({
        id,
        name: t.group,
        host: t.host,
        port: t.port,
        players: 0,
        maxPlayers: null,
        map: null,
        gameType: t.group,
        location: null,
        protected: false,
      });
    }
  }

  servers.sort((a, b) => (b.players ?? -1) - (a.players ?? -1) || a.name.localeCompare(b.name));
  return servers.slice(0, MAX_SERVERS);
}
