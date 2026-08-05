import net from "node:net";
import tls from "node:tls";
import zlib from "node:zlib";
import { promisify } from "node:util";
import { MAX_SERVERS } from "./types.js";

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const HOSTS = ["server.wesnoth.org", "server2.wesnoth.org"];
const PORT = 15000;
const SESSION_MS = 12_000;
const DEFAULT_VERSION = process.env.WESNOTH_CLIENT_VERSION || "1.18.0";

/**
 * @param {string} [host]
 * @returns {import('./types.js').GameServer[]}
 */
function lobbyPointer(host = HOSTS[0]) {
  return [
    {
      id: "wesnoth:lobby",
      name: "Battle for Wesnoth Multiplayer Lobby",
      host,
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
 * @param {string} text
 */
function escapeWml(text) {
  return String(text ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, " ");
}

/**
 * @param {string} tag
 * @param {Record<string, string | number | boolean | undefined | null>} attrs
 */
function wmlTag(tag, attrs = {}) {
  let body = `[${tag}]\n`;
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === "") continue;
    body += `${key}="${escapeWml(value)}"\n`;
  }
  body += `[/${tag}]\n`;
  return body;
}

/**
 * @param {string} block
 * @param {string} key
 */
function attr(block, key) {
  const quoted = block.match(new RegExp(`${key}\\s*=\\s*_?"([^"]*)"`, "i"));
  if (quoted) return quoted[1];
  const bare = block.match(new RegExp(`${key}\\s*=\\s*([^\\s\\n\\[]+)`, "i"));
  return bare ? bare[1].replace(/^_?"?|"$/g, "") : null;
}

/**
 * @param {string} block
 * @param {string} childTag
 */
function childBlock(block, childTag) {
  const re = new RegExp(`\\[${childTag}\\]([\\s\\S]*?)\\[\\/${childTag}\\]`, "i");
  const m = block.match(re);
  return m ? m[1] : null;
}

/**
 * Continuously buffered wesnothd stream (length-prefixed gzip WML).
 */
class WesnothConn {
  /**
   * @param {import('node:net').Socket | import('node:tls').TLSSocket} socket
   * @param {boolean} usingTls
   */
  constructor(socket, usingTls) {
    this.socket = socket;
    this.usingTls = usingTls;
    /** @type {Buffer} */
    this.buf = Buffer.alloc(0);
    /** @type {{ resolve: (v: Buffer) => void, reject: (e: Error) => void, n: number, timer: NodeJS.Timeout }[]} */
    this.waiters = [];
    this.closed = false;

    socket.on("data", (chunk) => {
      this.buf = Buffer.concat([this.buf, chunk]);
      this.#drain();
    });
    socket.on("error", (err) => this.#failAll(err));
    socket.on("close", () => {
      this.closed = true;
      this.#failAll(new Error("socket closed"));
    });
  }

  #drain() {
    while (this.waiters.length && this.buf.length >= this.waiters[0].n) {
      const w = this.waiters.shift();
      if (!w) break;
      clearTimeout(w.timer);
      const out = this.buf.subarray(0, w.n);
      this.buf = this.buf.subarray(w.n);
      w.resolve(out);
    }
  }

  /**
   * @param {Error} err
   */
  #failAll(err) {
    while (this.waiters.length) {
      const w = this.waiters.shift();
      if (!w) break;
      clearTimeout(w.timer);
      w.reject(err);
    }
  }

  /**
   * @param {number} n
   * @param {number} timeoutMs
   * @returns {Promise<Buffer>}
   */
  readExact(n, timeoutMs) {
    if (this.closed) return Promise.reject(new Error("socket closed"));
    if (this.buf.length >= n) {
      const out = this.buf.subarray(0, n);
      this.buf = this.buf.subarray(n);
      return Promise.resolve(out);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w.timer === timer);
        if (idx >= 0) this.waiters.splice(idx, 1);
        reject(new Error(`read timeout (${n} bytes)`));
      }, timeoutMs);
      this.waiters.push({ resolve, reject, n, timer });
    });
  }

  /**
   * @param {string} wml
   */
  async sendFrame(wml) {
    const gz = await gzip(Buffer.from(wml, "utf8"));
    const header = Buffer.alloc(4);
    header.writeUInt32BE(gz.length, 0);
    await new Promise((resolve, reject) => {
      this.socket.write(Buffer.concat([header, gz]), (err) =>
        err ? reject(err) : resolve(undefined)
      );
    });
  }

  /**
   * @param {number} timeoutMs
   */
  async readFrame(timeoutMs) {
    const lenBuf = await this.readExact(4, timeoutMs);
    const len = lenBuf.readUInt32BE(0);
    if (len <= 0 || len > 8 * 1024 * 1024) {
      throw new Error(`invalid frame length ${len}`);
    }
    const payload = await this.readExact(len, timeoutMs);
    return (await gunzip(payload)).toString("utf8");
  }

  destroy() {
    try {
      this.socket.destroy();
    } catch {
      /* ignore */
    }
  }
}

/**
 * @param {string} host
 * @param {number} port
 * @param {0 | 1} mode 0=cleartext, 1=TLS request
 * @returns {Promise<WesnothConn>}
 */
function connectMode(host, port, mode) {
  return new Promise((resolve, reject) => {
    const raw = net.createConnection({ host, port });
    let settled = false;

    const fail = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        raw.destroy();
      } catch {
        /* ignore */
      }
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    const timer = setTimeout(() => fail(new Error("connect/handshake timeout")), 8_000);

    raw.once("error", fail);
    raw.once("connect", () => {
      const req = Buffer.alloc(4);
      req.writeUInt32BE(mode, 0);
      raw.write(req);

      /** @type {Buffer[]} */
      const chunks = [];
      let got = 0;

      const onData = (chunk) => {
        chunks.push(chunk);
        got += chunk.length;
        if (got < 4) return;
        raw.off("data", onData);
        const buf = Buffer.concat(chunks);
        const resp = buf.subarray(0, 4);
        const rest = buf.subarray(4);
        const code = resp.readUInt32BE(0);

        if (mode === 1 && code === 0) {
          const secure = tls.connect({ socket: raw, servername: host });
          secure.once("error", fail);
          secure.once("secureConnect", () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            const conn = new WesnothConn(secure, true);
            if (rest.length) {
              // Bytes after the TLS marker belong inside the TLS stream — for
              // TLS upgrade those must not be injected. Discard leftovers on
              // the clear socket (should be empty).
            }
            resolve(conn);
          });
          return;
        }

        if (mode === 1 && code === 0xffffffff) {
          // TLS unavailable — hand off cleartext with leftover bytes.
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          const conn = new WesnothConn(raw, false);
          if (rest.length) conn.buf = Buffer.concat([conn.buf, rest]);
          resolve(conn);
          return;
        }

        if (mode === 0) {
          // Legacy socket-number reply — continue cleartext.
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          const conn = new WesnothConn(raw, false);
          if (rest.length) conn.buf = Buffer.concat([conn.buf, rest]);
          resolve(conn);
          return;
        }

        fail(new Error(`unexpected handshake response ${code} (mode ${mode})`));
      };

      raw.on("data", onData);
    });
  });
}

/**
 * @param {string} host
 * @param {number} port
 * @param {boolean} wantsAuth
 */
async function connectBest(host, port, wantsAuth) {
  try {
    const conn = await connectMode(host, port, 1);
    if (wantsAuth && !conn.usingTls) {
      conn.destroy();
      throw new Error("Wesnoth credentialed login requires TLS");
    }
    return conn;
  } catch (err) {
    if (wantsAuth) throw err;
    return connectMode(host, port, 0);
  }
}

/**
 * @param {string} wml
 * @param {string} host
 * @returns {import('./types.js').GameServer[]}
 */
function gamesFromWml(wml, host) {
  /** @type {import('./types.js').GameServer[]} */
  const servers = [];
  const gameRe = /\[game\]([\s\S]*?)\[\/game\]/gi;
  let m;
  while ((m = gameRe.exec(wml)) !== null && servers.length < MAX_SERVERS) {
    const block = m[1];
    const id = attr(block, "id");
    const name = attr(block, "name") || attr(block, "title") || "Wesnoth game";
    const map =
      attr(block, "mp_scenario") ||
      attr(block, "scenario") ||
      attr(block, "map_name") ||
      null;
    const era = attr(block, "mp_era") || null;

    const slotData = childBlock(block, "slot_data");
    let maxPlayers = null;
    let vacant = NaN;
    if (slotData) {
      maxPlayers = Number(attr(slotData, "max") || 0) || null;
      vacant = Number(attr(slotData, "vacant") || 0);
    } else {
      const slotsRaw = attr(block, "slots");
      if (slotsRaw && slotsRaw.includes("/")) {
        const [v, mx] = slotsRaw.split("/");
        vacant = Number(v);
        maxPlayers = Number(mx) || null;
      } else {
        maxPlayers = Number(slotsRaw || 0) || null;
        vacant = Number(attr(block, "vacant_slots") || attr(block, "empty") || NaN);
      }
    }

    const players =
      maxPlayers != null && Number.isFinite(vacant) ? Math.max(0, maxPlayers - vacant) : 0;

    const passworded =
      /password\s*=\s*"?yes"?/i.test(block) || Boolean(attr(block, "password"));

    servers.push({
      id: `wesnoth:${id || name}:${servers.length}`,
      name,
      host,
      port: PORT,
      players,
      maxPlayers,
      map,
      gameType: era || "wesnoth-lobby",
      location: null,
      protected: passworded,
    });
  }

  servers.sort((a, b) => (b.players ?? -1) - (a.players ?? -1) || a.name.localeCompare(b.name));
  return servers.slice(0, MAX_SERVERS);
}

/**
 * @param {string} host
 * @param {number} port
 * @param {{ username?: string, password?: string } | null} creds
 * @returns {Promise<import('./types.js').GameServer[] | null>}
 */
async function pollOne(host, port, creds) {
  const wantsAuth = Boolean(creds?.username && creds?.password);
  const conn = await connectBest(host, port, wantsAuth);

  const username =
    creds?.username ||
    process.env.WESNOTH_LOBBY_USER ||
    `PlayBound_${Math.random().toString(36).slice(2, 8)}`;
  const password = creds?.password || process.env.WESNOTH_LOBBY_PASS || "";

  /** @type {import('./types.js').GameServer[]} */
  let games = [];
  let joined = false;
  let passwordSent = false;
  /** @type {{ host: string, port: number } | null} */
  let redirect = null;
  const started = Date.now();

  try {
    while (Date.now() - started < SESSION_MS) {
      const remaining = Math.max(1_000, SESSION_MS - (Date.now() - started));
      const frame = await conn.readFrame(remaining);

      if (/\[redirect\]/i.test(frame)) {
        const block = childBlock(frame, "redirect") || frame;
        redirect = {
          host: attr(block, "host") || host,
          port: Number(attr(block, "port") || port) || port,
        };
        break;
      }

      if (/\[reject\]/i.test(frame)) {
        throw new Error("Wesnoth server rejected client version");
      }

      // Version query (often the first tagged payload).
      if (/\[version\]/i.test(frame) && !/\[mustlogin\]/i.test(frame) && !/\[login\]/i.test(frame)) {
        await conn.sendFrame(
          wmlTag("version", {
            version: DEFAULT_VERSION,
            client_source: "PlayBound",
          })
        );
        continue;
      }

      if (/\[mustlogin\]/i.test(frame)) {
        // First attempt: username only (server may then password_request).
        await conn.sendFrame(wmlTag("login", { username }));
        continue;
      }

      if (/\[error\]/i.test(frame)) {
        const block = childBlock(frame, "error") || frame;
        const needsPass = Boolean(attr(block, "password_request"));
        if (needsPass && password && conn.usingTls && !passwordSent) {
          passwordSent = true;
          await conn.sendFrame(wmlTag("login", { username, password }));
          continue;
        }
        const message = attr(block, "message") || "login error";
        throw new Error(`Wesnoth login failed: ${message}`);
      }

      if (/\[join_lobby\]/i.test(frame)) {
        joined = true;
        await conn.sendFrame(wmlTag("refresh_lobby", {}));
      }

      if (/\[gamelist\]/i.test(frame) || /\[game\]/i.test(frame) || /\[gamelist_diff\]/i.test(frame)) {
        const parsed = gamesFromWml(frame, host);
        if (parsed.length >= games.length) games = parsed;
        if (joined && games.length > 0) {
          await new Promise((r) => setTimeout(r, 600));
          break;
        }
      }
    }
  } finally {
    conn.destroy();
  }

  if (redirect) {
    return pollOne(redirect.host, redirect.port, creds);
  }

  if (games.length) return games;
  if (joined) return lobbyPointer(host);
  return null;
}

/**
 * Wesnoth multiplayer lobby poller (wesnothd WML-over-TCP).
 * With CMS/env credentials, completes TLS login and returns live [game] rows.
 *
 * @param {{ username?: string, password?: string } | null} [creds]
 * @returns {Promise<import('./types.js').GameServer[]>}
 */
export async function pollWesnoth(creds = null) {
  const authUser = creds?.username || process.env.WESNOTH_LOBBY_USER || "";
  const authPass = creds?.password || process.env.WESNOTH_LOBBY_PASS || "";
  const auth = authUser && authPass ? { username: authUser, password: authPass } : null;

  for (const host of HOSTS) {
    try {
      const servers = await pollOne(host, PORT, auth);
      if (servers && servers.length) return servers;
    } catch (err) {
      console.warn(`[wesnoth] ${host} failed:`, err instanceof Error ? err.message : err);
    }
  }

  return lobbyPointer();
}
