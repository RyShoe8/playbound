import { MAX_SERVERS } from "./types.js";
import {
  getServerInfo,
  mapPool,
  parseGetServersResponse,
  stripQuakeColors,
  udpQueryMaster,
} from "./udp.js";
import { pollMindustry } from "./mindustry.js";
import { pollHedgewars } from "./hedgewars.js";
import { pollWesnoth } from "./wesnoth.js";
import { pollWarzone } from "./warzone.js";
import { pollZeroK } from "./zerok.js";
import { pollZeroAd } from "./zerod.js";
import { pollVeloren } from "./veloren.js";
import { pollOpenTtd } from "./openttd.js";

/**
 * @typedef {{
 *   slug: string,
 *   kind: 'dpmaster' | 'mindustry' | 'hedgewars' | 'wesnoth' | 'warzone' | 'zerok' | 'zerod' | 'veloren' | 'openttd',
 *   masterHost?: string,
 *   masterPort?: number,
 *   query?: string,
 *   altQueries?: string[],
 *   nameKeys?: string[],
 *   source?: string,
 *   refreshMs?: number,
 * }} GameMasterConfig
 */

/** @type {GameMasterConfig[]} */
export const GAMES = [
  {
    slug: "xonotic",
    kind: "dpmaster",
    masterHost: "dpmaster.deathmask.net",
    masterPort: 27950,
    query: "getserversExt Xonotic 3 empty full ipv4",
    altQueries: ["getserversExt Xonotic 3 empty full", "getservers 68 empty full"],
    nameKeys: ["hostname", "sv_hostname", "host"],
  },
  {
    slug: "unvanquished",
    kind: "dpmaster",
    masterHost: "master.unvanquished.net",
    masterPort: 27950,
    query: "getserversExt Unvanquished 86 empty full ipv4",
    altQueries: ["getservers 86 empty full", "getservers 0 empty full"],
    nameKeys: ["sv_hostname", "hostname", "host"],
  },
  { slug: "mindustry", kind: "mindustry", source: "github:MindustryServerList" },
  { slug: "hedgewars", kind: "hedgewars", source: "netserver.hedgewars.org:46631" },
  { slug: "battle-for-wesnoth", kind: "wesnoth", source: "server.wesnoth.org:15000" },
  { slug: "warzone-2100", kind: "warzone", source: "wzlobby.wz2100.net" },
  { slug: "zero-k", kind: "zerok", source: "zero-k.info:8200" },
  { slug: "0ad", kind: "zerod", source: "lobby.wildfiregames.com" },
  { slug: "veloren", kind: "veloren", source: "serverlist.veloren.net" },
  {
    slug: "openttd",
    kind: "openttd",
    source: "servers.openttd.org",
    refreshMs: 120_000,
  },
];

/**
 * @param {Record<string, string> | null} info
 * @param {string[]} nameKeys
 * @param {string} fallback
 */
function pickName(info, nameKeys, fallback) {
  if (!info) return fallback;
  for (const k of nameKeys) {
    const raw = info[k];
    if (!raw) continue;
    const cleaned = stripQuakeColors(raw);
    if (cleaned) return cleaned;
  }
  return fallback;
}

/**
 * @param {Record<string, string> | null} info
 */
function pickPlayers(info) {
  if (!info) return { players: 0, maxPlayers: null };
  const maxPlayers = Number(info.sv_maxclients ?? info.maxclients ?? 0) || null;

  const human = Number(info.g_humanplayers);
  if (Number.isFinite(human) && human >= 0 && info.g_humanplayers !== "") {
    return { players: human, maxPlayers };
  }

  let clients = Number(info.clients ?? info.players ?? 0) || 0;
  const bots = Number(info.bots ?? info.sv_privateClients ?? NaN);
  if (Number.isFinite(bots) && bots > 0) {
    clients = Math.max(0, clients - bots);
  }
  return { players: Math.max(0, clients), maxPlayers };
}

/**
 * @param {GameMasterConfig} game
 * @returns {Promise<{ host: string, port: number }[]>}
 */
async function collectMasterAddresses(game) {
  const queries = [game.query, ...(game.altQueries || [])].filter(Boolean);
  /** @type {{ host: string, port: number }[]} */
  const addresses = [];
  const seen = new Set();

  for (const query of queries) {
    try {
      const packets = await udpQueryMaster(game.masterHost, game.masterPort, query, 8000);
      for (const raw of packets) {
        for (const a of parseGetServersResponse(raw)) {
          const key = `${a.host}:${a.port}`;
          if (seen.has(key)) continue;
          seen.add(key);
          addresses.push(a);
        }
      }
      if (addresses.length >= 8) break;
    } catch (err) {
      console.warn(
        `[dpmaster] ${game.slug} query "${query}" failed:`,
        err instanceof Error ? err.message : err
      );
    }
  }
  return addresses;
}

/**
 * @param {GameMasterConfig} game
 * @returns {Promise<import('./types.js').GameServer[]>}
 */
async function pollDpmaster(game) {
  const addresses = await collectMasterAddresses(game);

  const infos = await mapPool(addresses.slice(0, 180), 20, async (addr) => {
    const info = await getServerInfo(addr.host, addr.port);
    return { addr, info };
  });

  /** @type {import('./types.js').GameServer[]} */
  const servers = [];
  for (const row of infos) {
    if (!row?.addr) continue;
    const { addr, info } = row;
    const fallback = `${addr.host}:${addr.port}`;

    // Prefer dropping silent hosts rather than flooding the list as bare IPs.
    if (!info) continue;

    const name = pickName(info, game.nameKeys || ["hostname", "sv_hostname", "host"], fallback);
    const { players, maxPlayers } = pickPlayers(info);
    const map = info.mapname || info.map || info.mapName || null;
    const gameType = info.gamename || info.modname || info.game || info.version || null;
    const needPass = info.needpass === "1" || info.g_needpass === "1";

    servers.push({
      id: fallback,
      name,
      host: addr.host,
      port: addr.port,
      players,
      maxPlayers,
      map: map ? stripQuakeColors(map) : null,
      gameType: gameType ? stripQuakeColors(gameType) : null,
      location: null,
      protected: Boolean(needPass),
    });
  }

  servers.sort((a, b) => b.players - a.players || a.name.localeCompare(b.name));
  return servers.slice(0, MAX_SERVERS);
}

/**
 * @param {GameMasterConfig} game
 * @param {{ username?: string, password?: string } | null} [creds]
 * @returns {Promise<import('./types.js').GameServer[]>}
 */
export async function pollGame(game, creds = null) {
  switch (game.kind) {
    case "dpmaster":
      return pollDpmaster(game);
    case "mindustry":
      return pollMindustry();
    case "hedgewars":
      return pollHedgewars();
    case "wesnoth":
      return pollWesnoth();
    case "warzone":
      return pollWarzone();
    case "zerok":
      return pollZeroK(creds);
    case "zerod":
      return pollZeroAd(creds);
    case "veloren":
      return pollVeloren();
    case "openttd":
      return pollOpenTtd();
    default:
      throw new Error(`Unknown poller kind: ${game.kind}`);
  }
}

export function gameSource(game) {
  if (game.source) return game.source;
  if (game.masterHost && game.masterPort) return `${game.masterHost}:${game.masterPort}`;
  return game.kind;
}
