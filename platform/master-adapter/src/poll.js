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

/**
 * @typedef {{
 *   slug: string,
 *   kind: 'dpmaster' | 'mindustry' | 'hedgewars' | 'wesnoth' | 'warzone' | 'zerok' | 'zerod',
 *   masterHost?: string,
 *   masterPort?: number,
 *   query?: string,
 *   nameKeys?: string[],
 *   source?: string,
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
    nameKeys: ["hostname", "sv_hostname", "host"],
  },
  {
    slug: "unvanquished",
    kind: "dpmaster",
    masterHost: "master.unvanquished.net",
    masterPort: 27950,
    query: "getservers 0 empty full",
    nameKeys: ["sv_hostname", "hostname", "host"],
  },
  { slug: "mindustry", kind: "mindustry", source: "github:MindustryServerList" },
  { slug: "hedgewars", kind: "hedgewars", source: "netserver.hedgewars.org:46631" },
  { slug: "battle-for-wesnoth", kind: "wesnoth", source: "server.wesnoth.org:15000" },
  { slug: "warzone-2100", kind: "warzone", source: "wzlobby.wz2100.net" },
  { slug: "zero-k", kind: "zerok", source: "zero-k.info:8200" },
  { slug: "0ad", kind: "zerod", source: "lobby.wildfiregames.com" },
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
  const clients = Number(info.clients ?? info.players ?? 0) || 0;
  const bots = Number(info.bots ?? info.sv_bots ?? 0) || 0;
  const players = clients + bots;
  const maxPlayers = Number(info.sv_maxclients ?? info.maxclients ?? 0) || null;
  return { players, maxPlayers };
}

/**
 * @param {GameMasterConfig} game
 * @returns {Promise<import('./types.js').GameServer[]>}
 */
async function pollDpmaster(game) {
  const packets = await udpQueryMaster(game.masterHost, game.masterPort, game.query, 8000);
  /** @type {{ host: string, port: number }[]} */
  const addresses = [];
  const seen = new Set();
  for (const raw of packets) {
    for (const a of parseGetServersResponse(raw)) {
      const key = `${a.host}:${a.port}`;
      if (seen.has(key)) continue;
      seen.add(key);
      addresses.push(a);
    }
  }

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
    const name = pickName(info, game.nameKeys || ["hostname", "sv_hostname", "host"], fallback);
    const { players, maxPlayers } = pickPlayers(info);
    const map = info?.mapname || info?.map || null;
    const gameType = info?.gamename || info?.modname || info?.game || null;
    const needPass = info?.needpass === "1" || info?.g_needpass === "1";

    servers.push({
      id: fallback,
      name,
      host: addr.host,
      port: addr.port,
      players,
      maxPlayers,
      map,
      gameType,
      location: null,
      protected: Boolean(needPass),
    });
  }

  servers.sort((a, b) => b.players - a.players || a.name.localeCompare(b.name));
  return servers.slice(0, MAX_SERVERS);
}

/**
 * @param {GameMasterConfig} game
 * @returns {Promise<import('./types.js').GameServer[]>}
 */
export async function pollGame(game) {
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
      return pollZeroK();
    case "zerod":
      return pollZeroAd();
    default:
      throw new Error(`Unknown poller kind: ${game.kind}`);
  }
}

export function gameSource(game) {
  if (game.source) return game.source;
  if (game.masterHost && game.masterPort) return `${game.masterHost}:${game.masterPort}`;
  return game.kind;
}
