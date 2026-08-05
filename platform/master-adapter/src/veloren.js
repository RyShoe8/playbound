import dgram from "node:dgram";
import { lookup as dnsLookup } from "node:dns/promises";
import { MAX_SERVERS } from "./types.js";
import { mapPool } from "./udp.js";

const LIST_URL = "https://serverlist.veloren.net/v1/servers";
const VELOREN_HEADER = Buffer.from("veloren");
const MAX_RESPONSE_SIZE = 256;
const BATTLE_MODES = ["PvP", "PvE", "Per-player"];
const QUERY_TIMEOUT_MS = 6_000;

/**
 * Build a Veloren query datagram (version + request + pad + "veloren" trailer).
 * @param {bigint | number} p
 * @param {0 | 1} request 0=Init, 1=ServerInfo
 * @param {number} [protocolVersion]
 */
function buildRequest(p, request, protocolVersion = 0) {
  const content = Buffer.alloc(9);
  content.writeBigUInt64LE(BigInt(p), 0);
  content.writeUInt8(request, 8);

  // version (2) + content, padded to MAX_RESPONSE_SIZE, then header
  const body = Buffer.alloc(MAX_RESPONSE_SIZE);
  body.writeUInt16LE(protocolVersion & 0xffff, 0);
  content.copy(body, 2);
  return Buffer.concat([body, VELOREN_HEADER]);
}

/**
 * @param {Buffer} msg
 * @returns {{ kind: 'init', p: bigint, maxVersion: number } | { kind: 'info', players: number, maxPlayers: number, battlemode: number } | null}
 */
function parseResponse(msg) {
  if (!msg || msg.length < 3) return null;
  const disc = msg[0];
  if (disc === 1) {
    // Init { p: u64, max_supported_version: u16 }
    if (msg.length < 11) return null;
    return {
      kind: "init",
      p: msg.readBigUInt64LE(1),
      maxVersion: msg.readUInt16LE(9),
    };
  }
  if (disc === 0) {
    // Response(ServerInfo) — nested disc 0 + ServerInfo fields
    let offset = 1;
    if (msg.length > offset && msg[offset] === 0) offset += 1; // QueryServerResponse::ServerInfo
    // git_hash u32, git_timestamp i64, players_count u16, player_cap u16, battlemode u8
    if (msg.length < offset + 4 + 8 + 2 + 2 + 1) return null;
    offset += 4; // git_hash
    offset += 8; // git_timestamp
    const players = msg.readUInt16LE(offset);
    offset += 2;
    const maxPlayers = msg.readUInt16LE(offset);
    offset += 2;
    const battlemode = msg[offset];
    return { kind: "info", players, maxPlayers, battlemode };
  }
  return null;
}

/**
 * @param {string} host
 * @returns {Promise<string | null>}
 */
async function resolveIpv4(host) {
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return host;
  try {
    const res = await dnsLookup(host, { family: 4 });
    return res.address || null;
  } catch {
    return null;
  }
}

/**
 * @param {string} host IPv4 preferred
 * @param {number} port
 * @returns {Promise<{ players: number, maxPlayers: number, battlemode: number } | null>}
 */
function queryServerInfo(host, port) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    let settled = false;
    /** @type {bigint | null} */
    let challenge = null;
    let protocolVersion = 0;
    let attempts = 0;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      resolve(value);
    };

    const timer = setTimeout(() => finish(null), QUERY_TIMEOUT_MS);

    const send = (p, request) => {
      attempts += 1;
      if (attempts > 8) {
        finish(null);
        return;
      }
      const buf = buildRequest(p, request, protocolVersion);
      socket.send(buf, port, host, (err) => {
        if (err) finish(null);
      });
    };

    socket.on("error", () => finish(null));
    socket.on("message", (msg) => {
      const parsed = parseResponse(msg);
      if (!parsed) return;
      if (parsed.kind === "init") {
        challenge = parsed.p;
        if (Number.isFinite(parsed.maxVersion) && parsed.maxVersion >= 0) {
          protocolVersion = Math.min(parsed.maxVersion, 0xffff);
        }
        send(challenge, 1); // ServerInfo
        return;
      }
      if (parsed.kind === "info") {
        finish({
          players: parsed.players,
          maxPlayers: parsed.maxPlayers,
          battlemode: parsed.battlemode,
        });
      }
    });

    // First packet: Init with p=0 triggers challenge
    send(0, 0);
  });
}

/**
 * Official Veloren server list + UDP query_port enrichment.
 * @returns {Promise<import('./types.js').GameServer[]>}
 */
export async function pollVeloren() {
  const res = await fetch(LIST_URL, {
    headers: { "user-agent": "PlayBound-master-adapter/1.0", accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`Veloren serverlist returned ${res.status}`);
  const data = await res.json();
  const rows = Array.isArray(data?.servers) ? data.servers : [];

  // Lower concurrency — UDP drops under burst on some hosts.
  const infos = await mapPool(rows.slice(0, MAX_SERVERS), 6, async (row) => {
    if (!row.address || !row.port) return { row, info: null };
    const gamePort = Number(row.port);
    const listed = Number(row.query_port);
    const candidates = [];
    if (Number.isFinite(listed) && listed > 0) candidates.push(listed);
    if (!candidates.includes(14006)) candidates.push(14006);
    if (Number.isFinite(gamePort) && gamePort > 0) {
      const plus2 = gamePort + 2;
      if (!candidates.includes(plus2)) candidates.push(plus2);
    }

    const ipv4 = await resolveIpv4(String(row.address));
    if (!ipv4) return { row, info: null };

    let info = null;
    for (const qp of candidates) {
      info = await queryServerInfo(ipv4, qp);
      if (info) break;
    }
    return { row, info };
  });

  /** @type {import('./types.js').GameServer[]} */
  const servers = [];
  let enriched = 0;
  for (const entry of infos) {
    if (!entry?.row) continue;
    const { row, info } = entry;
    if (info) enriched += 1;
    const host = String(row.address);
    const port = Number(row.port);
    const modeParts = [];
    if (row.channel) modeParts.push(String(row.channel));
    if (row.official) modeParts.push("official");
    if (info && BATTLE_MODES[info.battlemode]) {
      modeParts.push(BATTLE_MODES[info.battlemode]);
    }

    servers.push({
      id: `${host}:${port}`,
      name: String(row.name || host),
      host,
      port,
      players: info?.players ?? null,
      maxPlayers: info?.maxPlayers ?? null,
      map: row.description ? String(row.description).slice(0, 80) : null,
      gameType: modeParts.length ? modeParts.join(" · ") : null,
      location: row.location ? { countryCode: String(row.location).toUpperCase() } : null,
      protected: false,
    });
  }

  console.log(`[veloren] enriched ${enriched}/${servers.length} servers with player counts`);

  servers.sort(
    (a, b) => (b.players ?? -1) - (a.players ?? -1) || a.name.localeCompare(b.name)
  );
  return servers.slice(0, MAX_SERVERS);
}
