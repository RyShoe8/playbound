import net from "node:net";
import zlib from "node:zlib";
import { promisify } from "node:util";
import { MAX_SERVERS } from "./types.js";

const gunzip = promisify(zlib.gunzip);
const HOSTS = ["server.wesnoth.org", "server2.wesnoth.org"];
const PORT = 15000;

/**
 * Minimal Wesnoth multiplayer lobby poller.
 * Connects as a guest and reads the initial gamelist WML if present.
 * On protocol mismatch, returns a single lobby pointer row so the title stays wired.
 * @returns {Promise<import('./types.js').GameServer[]>}
 */
export async function pollWesnoth() {
  for (const host of HOSTS) {
    try {
      const servers = await pollOne(host);
      if (servers) return servers;
    } catch {
      /* try next */
    }
  }
  // Fallback: browse-only pointer to the official lobby
  return [
    {
      id: "wesnoth:lobby",
      name: "Battle for Wesnoth Multiplayer Lobby",
      host: HOSTS[0],
      port: PORT,
      players: 0,
      maxPlayers: null,
      map: null,
      gameType: "wesnoth-lobby",
      location: null,
      protected: false,
    },
  ];
}

/**
 * @param {string} host
 * @returns {Promise<import('./types.js').GameServer[] | null>}
 */
function pollOne(host) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port: PORT });
    /** @type {Buffer[]} */
    const chunks = [];
    let settled = false;

    const finish = async (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      if (err) {
        reject(err);
        return;
      }
      try {
        const buf = Buffer.concat(chunks);
        const servers = await parseWesnothBuffer(buf, host);
        resolve(servers);
      } catch (e) {
        reject(e);
      }
    };

    const timer = setTimeout(() => finish(null), 8000);
    socket.on("error", (err) => finish(err));
    socket.on("data", (chunk) => {
      chunks.push(chunk);
      // After a bit of data, try parse
      if (Buffer.concat(chunks).length > 64) {
        // Give a short window for more packets
        setTimeout(() => finish(null), 1500);
      }
    });
    socket.on("connect", () => {
      // Connection itself may trigger version/handshake from server
    });
    socket.on("close", () => finish(null));
  });
}

/**
 * @param {Buffer} buf
 * @param {string} host
 */
async function parseWesnothBuffer(buf, host) {
  /** @type {import('./types.js').GameServer[]} */
  const servers = [];
  let text = "";
  try {
    // Try gzip body after optional 4-byte handshake
    let body = buf;
    if (buf.length > 4 && buf[0] === 0x1f && buf[1] === 0x8b) {
      body = buf;
    } else if (buf.length > 8) {
      // Sometimes length-prefixed gzip frames
      const maybe = buf.subarray(4);
      if (maybe[0] === 0x1f && maybe[1] === 0x8b) body = maybe;
    }
    if (body[0] === 0x1f && body[1] === 0x8b) {
      text = (await gunzip(body)).toString("utf8");
    } else {
      text = buf.toString("utf8");
    }
  } catch {
    text = buf.toString("latin1");
  }

  // Extract [game] ... [/game] blocks loosely
  const gameRe = /\[game\]([\s\S]*?)\[\/game\]/gi;
  let m;
  while ((m = gameRe.exec(text)) !== null && servers.length < MAX_SERVERS) {
    const block = m[1];
    const name = attr(block, "name") || attr(block, "title") || "Wesnoth game";
    const map = attr(block, "scenario") || attr(block, "map_name") || null;
    const slots = Number(attr(block, "slots") || 0);
    const vacant = Number(attr(block, "vacant_slots") || attr(block, "empty") || 0);
    const maxPlayers = slots > 0 ? slots : null;
    const players = maxPlayers != null ? Math.max(0, maxPlayers - (Number.isFinite(vacant) ? vacant : 0)) : 0;
    servers.push({
      id: `wesnoth:${name}:${servers.length}`,
      name,
      host,
      port: PORT,
      players,
      maxPlayers,
      map,
      gameType: "wesnoth-lobby",
      location: null,
      protected: /password\s*=\s*yes/i.test(block),
    });
  }

  if (servers.length === 0) {
    servers.push({
      id: `wesnoth:${host}`,
      name: "Battle for Wesnoth Multiplayer Lobby",
      host,
      port: PORT,
      players: 0,
      maxPlayers: null,
      map: null,
      gameType: "wesnoth-lobby",
      location: null,
      protected: false,
    });
  }

  servers.sort((a, b) => b.players - a.players || a.name.localeCompare(b.name));
  return servers.slice(0, MAX_SERVERS);
}

/**
 * @param {string} block
 * @param {string} key
 */
function attr(block, key) {
  const re = new RegExp(`${key}\\s*=\\s*_?"([^"]*)"`, "i");
  const m = block.match(re);
  if (m) return m[1];
  const re2 = new RegExp(`${key}\\s*=\\s*([^\\s\\n]+)`, "i");
  const m2 = block.match(re2);
  return m2 ? m2[1].replace(/^_?"?|"$/g, "") : null;
}
