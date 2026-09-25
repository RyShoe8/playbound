/**
 * Player counts for managed rooms, asked of each server on its local port.
 *
 * Every function resolves to { players, maxPlayers } or null. null means
 * "unknown" and must never be read as an empty server: rotation only retires
 * servers confirmed empty.
 */
import dgram from "node:dgram";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { queryA2sOccupancy } from "./a2sQuery.js";

const TIMEOUT_MS = 2500;

function validCount(n) {
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function validMax(n) {
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Send one UDP datagram to 127.0.0.1:port and resolve with the first reply (or null). */
function udpRequest(port, payload, { timeoutMs = TIMEOUT_MS, accept = () => true } = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) return Promise.resolve(null);
  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket.close(); } catch { /* already closed */ }
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    socket.on("error", () => finish(null));
    socket.on("message", (packet) => { if (accept(packet)) finish(packet); });
    socket.send(payload, port, "127.0.0.1", (error) => { if (error) finish(null); });
  });
}

/* ── Quake 3 family: getstatus ─────────────────────────────────────────── */

const Q3_GETSTATUS = Buffer.concat([Buffer.from([0xff, 0xff, 0xff, 0xff]), Buffer.from("getstatus\n")]);
// MOHAA (and OpenMOHAA) put a direction byte after the 0xFF header: 0x02 on
// requests, 0x01 on replies. Without it the server ignores the query.
const MOHAA_GETSTATUS = Buffer.concat([Buffer.from([0xff, 0xff, 0xff, 0xff, 0x02]), Buffer.from("getstatus\n")]);

function q3Body(packet) {
  const body = packet.subarray(4);
  return body[0] === 0x01 ? body.subarray(1) : body;
}

/**
 * Parse a Quake 3-style statusResponse: an info string of \key\value pairs,
 * then one line per client ("score ping \"name\""). Bots report ping 0 in
 * ioquake3 and DarkPlaces, so they are not counted as players.
 */
export function parseQuake3Status(packet) {
  if (!Buffer.isBuffer(packet) || packet.length < 20 || packet.readInt32LE(0) !== -1) return null;
  const text = q3Body(packet).toString("latin1");
  if (!/^statusResponse/i.test(text)) return null;
  const lines = text.split("\n");
  const info = lines[1] || "";
  const parts = info.split("\\");
  const vars = {};
  for (let i = 1; i + 1 < parts.length; i += 2) vars[parts[i].toLowerCase()] = parts[i + 1];
  let players = 0;
  for (const line of lines.slice(2)) {
    const m = line.match(/^\s*-?\d+\s+(-?\d+)/);
    if (!m) continue;
    if (Number(m[1]) > 0) players++;
  }
  const max = Number(vars.sv_maxclients);
  return { players, maxPlayers: validMax(max) };
}

export async function queryQuake3(port, { mohaa = false } = {}) {
  const packet = await udpRequest(port, mohaa ? MOHAA_GETSTATUS : Q3_GETSTATUS, {
    accept: (p) => p.length > 4 && p.readInt32LE(0) === -1 && /^statusResponse/i.test(q3Body(p).subarray(0, 16).toString("latin1")),
  });
  return packet ? parseQuake3Status(packet) : null;
}

/* ── Mindustry: discovery ping ─────────────────────────────────────────── */

/** Mindustry's host info: UTF strings are a length byte then bytes; ints are big-endian. */
export function parseMindustryPing(packet) {
  if (!Buffer.isBuffer(packet) || packet.length < 12) return null;
  let o = 0;
  const str = () => {
    if (o >= packet.length) throw new Error("short");
    const len = packet[o++];
    const s = packet.subarray(o, o + len).toString("utf8");
    o += len;
    return s;
  };
  const int = () => {
    if (o + 4 > packet.length) throw new Error("short");
    const v = packet.readInt32BE(o);
    o += 4;
    return v;
  };
  try {
    str(); // name
    str(); // map
    const players = int();
    int(); // wave
    int(); // version
    str(); // version type
    o += 1; // gamemode
    const limit = int();
    return { players: validCount(players), maxPlayers: limit > 0 ? limit : null };
  } catch {
    return null;
  }
}

export async function queryMindustry(port) {
  const packet = await udpRequest(port, Buffer.from([0xfe, 0x01]));
  const parsed = packet ? parseMindustryPing(packet) : null;
  return parsed && parsed.players !== null ? parsed : null;
}

/* ── AssaultCube: info query on port + 1 ───────────────────────────────── */

/** Cube 2-era compressed int: one byte, or 0x80 + int16 LE, or 0x81 + int32 LE. */
function cubeInt(buf, state) {
  if (state.o >= buf.length) throw new Error("short");
  const c = buf.readInt8(state.o++);
  if (c === -128) { const v = buf.readInt16LE(state.o); state.o += 2; return v; }
  if (c === -127) { const v = buf.readInt32LE(state.o); state.o += 4; return v; }
  return c;
}

function cubeString(buf, state) {
  const end = buf.indexOf(0, state.o);
  if (end < 0) throw new Error("short");
  const s = buf.subarray(state.o, end).toString("latin1");
  state.o = end + 1;
  return s;
}

/**
 * Reply to a plain ping: echoed millis, protocol, mode, numclients,
 * minutes remaining, map, description, maxclients.
 */
export function parseAssaultCubeInfo(packet) {
  if (!Buffer.isBuffer(packet) || packet.length < 6) return null;
  const state = { o: 0 };
  try {
    cubeInt(packet, state); // echoed millis
    cubeInt(packet, state); // protocol
    cubeInt(packet, state); // mode
    const players = cubeInt(packet, state);
    cubeInt(packet, state); // minutes remaining
    cubeString(packet, state); // map
    cubeString(packet, state); // description
    const max = cubeInt(packet, state);
    return validCount(players) === null ? null : { players, maxPlayers: validMax(max) };
  } catch {
    return null;
  }
}

export async function queryAssaultCube(port) {
  const packet = await udpRequest(port + 1, Buffer.from([0x01]));
  return packet ? parseAssaultCubeInfo(packet) : null;
}

/* ── OpenTTD: TCP game info ────────────────────────────────────────────── */

/**
 * PACKET_SERVER_GAME_INFO. Version-1 fields always come last: use_password,
 * clients_max, clients_on, spectators_on, map_width(u16), map_height(u16),
 * landscape, dedicated — so they are read from the end, whatever newer
 * versions add before them.
 */
export function parseOpenTtdGameInfo(packet) {
  if (!Buffer.isBuffer(packet) || packet.length < 16) return null;
  const size = packet.readUInt16LE(0);
  if (packet[2] !== 6 || size > packet.length || size < 16) return null;
  const end = size;
  const clientsMax = packet[end - 9];
  const clientsOn = packet[end - 8];
  if (clientsOn > clientsMax && clientsMax > 0) return null;
  return { players: clientsOn, maxPlayers: validMax(clientsMax) };
}

function tcpRequest(port, payload, { host = "127.0.0.1", until = () => false } = {}) {
  return new Promise((resolve) => {
    let data = Buffer.alloc(0);
    let done = false;
    const socket = net.connect(port, host, () => socket.write(payload));
    const finish = () => { if (done) return; done = true; clearTimeout(timer); socket.destroy(); resolve(data.length ? data : null); };
    const timer = setTimeout(finish, TIMEOUT_MS);
    socket.on("data", (chunk) => { data = Buffer.concat([data, chunk]); if (until(data)) finish(); });
    socket.on("error", finish);
    socket.on("close", finish);
  });
}

export async function queryOpenTtd(port) {
  const reply = await tcpRequest(port, Buffer.from([0x03, 0x00, 0x07]), {
    until: (d) => d.length >= 2 && d.length >= d.readUInt16LE(0),
  });
  return reply ? parseOpenTtdGameInfo(reply) : null;
}

/* ── BZFlag: handshake + MsgQueryGame ──────────────────────────────────── */

/**
 * After "BZFS0221\0", the MsgQueryGame reply ("qg"): u16 len, u16 code, then
 * big-endian u16 gameType, options, maxPlayers, maxShots, and six team sizes
 * (rogue, red, green, blue, purple, observer) which sum to players online.
 */
export function parseBzflagQueryGame(buf) {
  if (!Buffer.isBuffer(buf)) return null;
  const at = buf.indexOf(Buffer.from([0x71, 0x67]), 0);
  if (at < 2 || at + 2 + 22 > buf.length) return null;
  const body = at + 2;
  const maxPlayers = buf.readUInt16BE(body + 4);
  let players = 0;
  for (let i = 0; i < 6; i++) players += buf.readUInt16BE(body + 8 + i * 2);
  return { players, maxPlayers: validMax(maxPlayers) };
}

export async function queryBzflag(port) {
  const reply = await tcpRequest(port, Buffer.concat([Buffer.from("BZFLAG\r\n\r\n"), Buffer.from([0, 0, 0x71, 0x67])]), {
    until: (d) => { const at = d.indexOf(Buffer.from([0x71, 0x67])); return at >= 2 && d.length >= at + 24; },
  });
  return reply ? parseBzflagQueryGame(reply) : null;
}

/* ── Teeworlds 0.7: token handshake, then gie3 ─────────────────────────── */

/** Teeworlds' packed int: 6 data bits + sign in the first byte, 7 per continuation byte. */
function twInt(buf, state) {
  let b = buf[state.o++];
  const sign = (b >> 6) & 1;
  let v = b & 0x3f;
  let shift = 6;
  while (b & 0x80) {
    b = buf[state.o++];
    v |= (b & 0x7f) << shift;
    shift += 7;
  }
  return sign ? ~v : v;
}

function twString(buf, state) {
  const end = buf.indexOf(0, state.o);
  if (end < 0) throw new Error("short");
  const s = buf.subarray(state.o, end).toString("utf8");
  state.o = end + 1;
  return s;
}

/**
 * "inf3" reply: token, version, name, hostname, map, gametype (strings),
 * flags, skill level, then num players, max players, num clients, max clients.
 */
export function parseTeeworldsInfo(data) {
  const at = data.indexOf(Buffer.from("inf3"));
  if (at < 0) return null;
  const state = { o: at + 4 };
  try {
    twInt(data, state); // token
    for (let i = 0; i < 5; i++) twString(data, state); // version, name, hostname, map, gametype
    twInt(data, state); // flags
    twInt(data, state); // skill
    const players = twInt(data, state);
    const maxPlayers = twInt(data, state);
    return validCount(players) === null ? null : { players, maxPlayers: validMax(maxPlayers) };
  } catch {
    return null;
  }
}

export async function queryTeeworlds(port) {
  if (!Number.isInteger(port)) return null;
  const myToken = Buffer.from([0x13, 0x37, 0x42, 0x24]);
  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    let settled = false;
    const finish = (v) => { if (settled) return; settled = true; clearTimeout(timer); try { socket.close(); } catch { /* closed */ } resolve(v); };
    const timer = setTimeout(() => finish(null), TIMEOUT_MS * 2);
    socket.on("error", () => finish(null));
    socket.on("message", (m) => {
      // Control packet carrying the server's token: flags, ack, chunks, token(4), ctrl=5, token(4).
      if ((m[0] & 0x04) && m.length >= 12 && m[7] === 5) {
        const serverToken = m.subarray(8, 12);
        const req = Buffer.concat([
          Buffer.from([0x21]), serverToken, myToken,
          Buffer.from([0xff, 0xff, 0xff, 0xff]), Buffer.from("gie3"), Buffer.from([0x01]),
        ]);
        socket.send(req, port, "127.0.0.1");
        return;
      }
      const parsed = parseTeeworldsInfo(m);
      if (parsed) finish(parsed);
    });
    // Token request: control flag, no ack, no chunks, NET_TOKEN_NONE, ctrl 5 + our token, padded to 512.
    const tokenRequest = Buffer.alloc(7 + 1 + 4 + 507);
    Buffer.from([0x04, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff, 0x05]).copy(tokenRequest, 0);
    myToken.copy(tokenRequest, 8);
    socket.send(tokenRequest, port, "127.0.0.1");
  });
}

/* ── Veloren: Prometheus metrics (loopback, game port + 1) ─────────────── */

/**
 * veloren-server-cli serves Prometheus metrics on 127.0.0.1:14005 by
 * default, including `players_connected`. (Its UDP query server did not
 * answer the documented request on the VPS build, so metrics are used.)
 * The cap comes from the server's settings.ron `max_players`.
 */
export function parseVelorenMetrics(text) {
  const m = String(text || "").match(/^players_connected\s+(\d+)/m);
  return m ? validCount(Number(m[1])) : null;
}

export async function queryVeloren(gamePort, { settingsFile = null } = {}) {
  try {
    const res = await fetch(`http://127.0.0.1:${gamePort + 1}/metrics`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    const players = parseVelorenMetrics(await res.text());
    if (players === null) return null;
    let maxPlayers = null;
    if (settingsFile) {
      try {
        const cap = fs.readFileSync(settingsFile, "utf8").match(/max_players:\s*(\d+)/);
        if (cap) maxPlayers = validMax(Number(cap[1]));
      } catch { /* cap unknown */ }
    }
    return { players, maxPlayers };
  } catch {
    return null;
  }
}

/* ── SuperTuxKart: LAN discovery ("stk-server" on 2757) ────────────────── */

/**
 * Reply: u32 server version, u8-length name, u8 max players, u8 connected
 * players, u16 game port, … The discovery port is shared by every STK server
 * on the host, so a reply only counts when its game port is this room's.
 */
export function parseStkDiscovery(m, expectedPort) {
  if (!Buffer.isBuffer(m) || m.length < 9) return null;
  const nameLen = m[4];
  const o = 5 + nameLen;
  if (o + 4 > m.length) return null;
  const maxPlayers = m[o];
  const players = m[o + 1];
  const port = m.readUInt16BE(o + 2);
  if (expectedPort && port !== expectedPort) return null;
  return { players, maxPlayers: validMax(maxPlayers) };
}

export async function querySuperTuxKart(roomPort) {
  const packet = await udpRequest(2757, Buffer.concat([Buffer.from([10]), Buffer.from("stk-server")]));
  return packet ? parseStkDiscovery(packet, roomPort) : null;
}

/* ── FlightGear (fgms): telnet status on game port + 1 ─────────────────── */

export function parseFgmsStatus(text) {
  const m = String(text || "").match(/#\s*(\d+)\s+pilot\(s\)\s+online/i);
  return m ? { players: Number(m[1]), maxPlayers: null } : null;
}

export async function queryFlightGear(port) {
  const reply = await tcpRequest(port + 1, Buffer.from("\n"), {
    until: (d) => /pilot\(s\) online/i.test(d.toString("latin1")),
  });
  return reply ? parseFgmsStatus(reply.toString("latin1")) : null;
}

/* ── TCP games without a query protocol: count connected clients ───────── */

/**
 * Established TCP connections whose local port is the room's port, from the
 * kernel's own tables. Each connected player holds one, so for TCP-based
 * games (Freeciv, Wesnoth, TripleA, Hedgewars, Warzone, YSoccer) this is the
 * player count without speaking the game's protocol. Loopback peers are
 * excluded so local probes are never counted as players.
 */
export function countEstablishedTcp(tables, port) {
  const hexPort = port.toString(16).toUpperCase().padStart(4, "0");
  let count = 0;
  let listening = false;
  for (const table of tables) {
    for (const line of String(table || "").split("\n").slice(1)) {
      const cols = line.trim().split(/\s+/);
      if (cols.length < 4) continue;
      const [local, remote, state] = [cols[1], cols[2], cols[3]];
      if (!local.endsWith(`:${hexPort}`)) continue;
      if (state === "0A") { listening = true; continue; } // LISTEN
      if (state !== "01") continue; // ESTABLISHED
      const remoteIp = remote.split(":")[0];
      if (remoteIp === "0100007F" || /^0{24}01000000$/.test(remoteIp) || /^0{20}FFFF00000100007F$/i.test(remoteIp)) continue;
      count++;
    }
  }
  // No listener means the server is not up: unknown, never "empty".
  return listening ? count : null;
}

export function queryTcpClients(port) {
  if (!Number.isInteger(port)) return null;
  try {
    const tables = ["/proc/net/tcp", "/proc/net/tcp6"].map((f) => {
      try { return fs.readFileSync(f, "utf8"); } catch { return ""; }
    });
    if (!tables.some(Boolean)) return null;
    const players = countEstablishedTcp(tables, port);
    return players === null ? null : { players, maxPlayers: null };
  } catch {
    return null;
  }
}

/* ── Zandronum (Freedoom): launcher protocol ───────────────────────────── */

/*
 * Replies are Huffman-coded with Skulltag's fixed tree (src/huffman/huffman.cpp,
 * "compatible_huffman_tree"), bits read MSB-first after reversing each byte.
 * A first byte of 0xFF means "not encoded", which is also how requests are
 * sent here, so no encoder is needed.
 */
const ZAN_TREE = [0,0,0,1,128,0,0,0,3,38,34,2,1,80,3,110,144,67,0,2,1,74,3,243,142,37,2,3,124,58,182,0,0,1,36,0,3,221,131,3,245,163,1,35,3,113,85,0,1,41,1,77,3,199,130,0,1,206,3,185,153,3,70,118,0,3,3,5,0,0,1,24,0,2,3,198,190,63,2,3,139,186,75,0,1,44,2,3,240,218,56,3,40,39,0,0,2,2,3,244,247,81,65,0,3,9,125,3,68,60,0,0,1,25,3,191,138,3,86,17,0,1,23,3,220,178,2,3,165,194,14,1,0,2,2,0,0,2,1,208,3,150,157,181,1,222,2,3,216,230,211,0,2,2,3,252,141,10,42,0,2,3,134,135,104,1,103,3,187,225,95,32,0,0,0,0,0,0,1,57,1,61,3,183,237,0,0,3,233,234,3,246,203,2,3,250,147,79,1,129,0,1,7,3,143,136,1,20,3,179,148,0,0,0,3,28,106,3,101,87,1,66,0,3,180,219,3,227,241,0,1,26,1,251,3,229,214,3,54,69,0,0,0,0,0,3,231,212,3,156,176,3,93,83,0,3,96,253,3,30,13,0,0,2,3,175,254,94,3,159,27,2,1,8,3,204,226,78,0,0,0,3,107,88,1,31,3,137,169,2,2,3,215,145,6,4,1,127,0,1,99,3,209,217,0,3,213,238,3,177,170,1,132,0,0,0,2,3,22,12,114,2,2,3,158,197,97,45,0,1,46,1,112,3,174,249,0,3,224,102,2,3,171,151,193,0,0,0,3,15,16,3,2,168,1,49,3,91,146,0,1,48,3,173,29,0,3,19,126,3,92,242,0,0,0,0,0,0,3,205,192,2,3,235,149,255,2,3,223,184,248,0,0,3,108,236,3,111,90,2,3,117,115,71,0,0,3,11,50,0,3,188,119,1,122,3,167,162,1,160,1,133,3,123,21,0,0,2,1,59,2,3,155,154,98,43,0,3,76,51,2,3,201,116,72,2,0,2,3,109,100,121,2,3,195,232,18,1,0,2,0,1,164,2,3,120,189,73,0,1,196,3,239,210,3,64,62,89,0,0,1,33,2,3,228,161,55,2,3,84,152,47,0,0,2,3,207,172,140,3,82,166,0,3,53,105,1,52,3,202,200];

function buildZanTree() {
  let i = 0;
  const build = () => {
    const desc = ZAN_TREE[i++];
    const node = [null, null];
    for (let b = 0; b < 2; b++) {
      if ((desc & (1 << b)) === 0) node[b] = build();
      else node[b] = { value: ZAN_TREE[i++] };
    }
    return node;
  };
  return build();
}
let zanRoot = null;

function reverseByte(b) {
  let r = 0;
  for (let i = 0; i < 8; i++) { r = (r << 1) | (b & 1); b >>= 1; }
  return r;
}

export function zandronumDecode(input) {
  if (!Buffer.isBuffer(input) || input.length < 1) return null;
  if (input[0] === 0xff) return input.subarray(1);
  zanRoot ||= buildZanTree();
  let bits = ((input.length - 1) << 3) - input[0];
  const out = [];
  let node = zanRoot;
  for (let r = 1; r < input.length && bits > 0; r++) {
    let byte = reverseByte(input[r]);
    for (let k = 0; k < 8 && bits > 0; k++, bits--) {
      node = node[(byte >> 7) & 1];
      byte = (byte << 1) & 0xff;
      if (!node) return null;
      if (node.value !== undefined) { out.push(node.value); node = zanRoot; }
    }
  }
  return Buffer.from(out);
}

const SQF_MAXPLAYERS = 0x20;
const SQF_NUMPLAYERS = 0x80000;

/** Decoded reply: i32 5660023, i32 time, version string, i32 flags, u8 maxplayers, u8 numplayers. */
export function parseZandronumReply(data) {
  if (!Buffer.isBuffer(data) || data.length < 12 || data.readInt32LE(0) !== 5660023) return null;
  const end = data.indexOf(0, 8);
  if (end < 0 || end + 1 + 4 + 2 > data.length) return null;
  const flags = data.readInt32LE(end + 1);
  if ((flags & (SQF_MAXPLAYERS | SQF_NUMPLAYERS)) !== (SQF_MAXPLAYERS | SQF_NUMPLAYERS)) return null;
  const maxPlayers = data[end + 5];
  const players = data[end + 6];
  return { players, maxPlayers: validMax(maxPlayers) };
}

export async function queryZandronum(port) {
  const req = Buffer.alloc(1 + 12);
  req[0] = 0xff; // unencoded
  req.writeInt32LE(199, 1);
  req.writeInt32LE(SQF_MAXPLAYERS | SQF_NUMPLAYERS, 5);
  req.writeInt32LE(Date.now() & 0x7fffffff, 9);
  let packet = await udpRequest(port, req, { timeoutMs: 1200 });
  if (!packet) {
    packet = await udpRequest(port, req.subarray(1), { timeoutMs: 1200 });
  }
  const decoded = packet ? (packet[0] === 0xff ? packet.subarray(1) : zandronumDecode(packet)) : null;
  return decoded ? parseZandronumReply(decoded) : null;
}

/* ── BombSquad (Ballistica): host query V2 ─────────────────────────────── */

/**
 * BA_PACKET_HOST_QUERY_V2 (38) + 4-byte id + JSON → 39 + id + JSON with
 * "sz" (party size) and "szx" (max party size). A dedicated server counts
 * itself as a party member, so players = sz - 1 and the cap = szx - 1.
 */
export function parseBombSquadResponse(m) {
  if (!Buffer.isBuffer(m) || m.length < 6 || m[0] !== 39) return null;
  try {
    const info = JSON.parse(m.subarray(5).toString("utf8"));
    const size = validCount(info?.sz);
    if (size === null || size < 1) return null;
    const max = Number.isInteger(info?.szx) ? info.szx - 1 : null;
    return { players: size - 1, maxPlayers: validMax(max) };
  } catch {
    return null;
  }
}

export async function queryBombSquad(port) {
  const req = Buffer.concat([Buffer.from([38, 0x50, 0x42, 0x51, 0x31]), Buffer.from(JSON.stringify({ b: 22998, v: 1 }))]);
  const packet = await udpRequest(port, req, { accept: (p) => p[0] === 39 });
  return packet ? parseBombSquadResponse(packet) : null;
}

/* ── Space Station 14: HTTP status ─────────────────────────────────────── */

export async function querySpaceStation14(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/status`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    const data = await res.json();
    const players = validCount(data?.players);
    return players === null ? null : { players, maxPlayers: validMax(data?.soft_max_players) };
  } catch {
    return null;
  }
}

/* ── TES3MP: the PlayBound admin hook's online snapshot ────────────────── */

/**
 * playboundAdmin.lua writes playbound-online.json on its first tick and again
 * whenever the online set changes (it polls once a second), so while the
 * room's process is alive the file is the current player list.
 *
 * The max-player cap lives in the TES3MP server config, written to
 * `$HOME/.config/openmw/tes3mp-server.cfg` by prepareSpawn where `$HOME` is
 * `room.cwd`. Read the General → maximumPlayers value from that file so the
 * admin panel can show a real cap instead of "?".
 */
function tes3mpMaxPlayers(room) {
  if (!room?.cwd) return null;
  for (const base of [room.cwd, room.home || ""]) {
    if (!base) continue;
    try {
      const cfg = fs.readFileSync(path.join(base, ".config", "openmw", "tes3mp-server.cfg"), "utf8");
      const m = cfg.match(/maximumPlayers\s*=\s*(\d+)/);
      if (m) return validMax(Number(m[1]));
    } catch { /* try next */ }
  }
  return null;
}

export function queryTes3mp(room) {
  if (!room?.cwd) return null;
  for (const dir of [path.join(room.cwd, "server", "data"), path.join(room.home || "", "server", "data")]) {
    try {
      const doc = JSON.parse(fs.readFileSync(path.join(dir, "playbound-online.json"), "utf8"));
      if (Array.isArray(doc?.players)) return { players: doc.players.length, maxPlayers: tes3mpMaxPlayers(room) };
    } catch { /* try next */ }
  }
  return null;
}

/* ── Dispatch ──────────────────────────────────────────────────────────── */

const QUAKE3_GAMES = new Set([
  "xonotic", "openarena", "wolfenstein-enemy-territory", "unvanquished", "medal-of-honor-allied-assault",
]);
const A2S_GAMES = new Set(["counter-strike-2", "team-fortress-2"]);
// TCP games with no usable query protocol: counted by established connections.
const TCP_CLIENT_GAMES = new Set(["freeciv", "battle-for-wesnoth", "triplea", "hedgewars", "warzone-2100", "ysoccer"]);

/** Games this module can answer for, so the platform knows to ask. */
export const LOCAL_QUERY_GAMES = new Set([
  ...QUAKE3_GAMES, ...A2S_GAMES, "mindustry", "assaultcube", "space-station-14", "morrowind",
  "openttd", "bzflag", "teeworlds", "veloren", "supertuxkart", "flightgear", "freedoom", "bombsquad",
  ...TCP_CLIENT_GAMES,
]);

export async function queryRoomOccupancy(room) {
  if (!room || !Number.isInteger(room.port)) return null;
  const slug = room.gameSlug;
  if (A2S_GAMES.has(slug)) {
    const anyApp = slug !== "counter-strike-2";
    return (await queryA2sOccupancy(room.port, { anyApp })) ||
      (room.host ? queryA2sOccupancy(room.port, { anyApp, host: room.host }) : null);
  }
  if (QUAKE3_GAMES.has(slug)) return queryQuake3(room.port, { mohaa: slug === "medal-of-honor-allied-assault" });
  if (slug === "mindustry") return queryMindustry(room.port);
  if (slug === "assaultcube") return queryAssaultCube(room.port);
  if (slug === "space-station-14") return querySpaceStation14(room.port);
  if (slug === "morrowind") return queryTes3mp(room);
  if (slug === "openttd") return queryOpenTtd(room.port);
  if (slug === "bzflag") return queryBzflag(room.port);
  if (slug === "teeworlds") return queryTeeworlds(room.port);
  if (slug === "supertuxkart") return querySuperTuxKart(room.port);
  if (slug === "flightgear") return queryFlightGear(room.port);
  if (slug === "freedoom") return queryZandronum(room.port);
  if (slug === "bombsquad") return queryBombSquad(room.port);
  if (TCP_CLIENT_GAMES.has(slug)) return queryTcpClients(room.port);
  if (slug === "veloren") {
    return queryVeloren(room.port, {
      settingsFile: room.cwd ? path.join(room.cwd, "userdata", "server", "server_config", "settings.ron") : null,
    });
  }
  return null;
}
