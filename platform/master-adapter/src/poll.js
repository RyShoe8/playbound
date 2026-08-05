import { MAX_SERVERS } from "./types.js";
import {
  getServerInfo,
  mapPool,
  parseGetServersResponse,
  stripQuakeColors,
  udpQueryMaster,
} from "./udp.js";
import { pollXonoticHttp } from "./dpmaster-http.js";
import { pollMindustry } from "./mindustry.js";
import { pollHedgewars } from "./hedgewars.js";
import { pollWesnoth } from "./wesnoth.js";
import { pollWarzone } from "./warzone.js";
import { pollZeroK } from "./zerok.js";
import { pollZeroAd } from "./zerod.js";
import { pollVeloren } from "./veloren.js";
import { pollOpenTtd } from "./openttd.js";

/**
 * @typedef {{ host: string, port: number }} MasterEndpoint
 * @typedef {{
 *   slug: string,
 *   kind: 'dpmaster' | 'mindustry' | 'hedgewars' | 'wesnoth' | 'warzone' | 'zerok' | 'zerod' | 'veloren' | 'openttd',
 *   masterHost?: string,
 *   masterPort?: number,
 *   masters?: MasterEndpoint[],
 *   query?: string,
 *   altQueries?: string[],
 *   nameKeys?: string[],
 *   gamenameAllow?: RegExp,
 *   gamenameDeny?: RegExp,
 *   httpFallback?: 'xonotic-deathmask',
 *   source?: string,
 *   refreshMs?: number,
 * }} GameMasterConfig
 */

/** @type {GameMasterConfig[]} */
export const GAMES = [
  {
    slug: "xonotic",
    kind: "dpmaster",
    masters: [
      { host: "master2.xonotic.org", port: 27950 },
      { host: "master3.xonotic.org", port: 27950 },
      { host: "dpm4.xonotic.xyz", port: 27777 },
      { host: "dpmaster.deathmask.net", port: 27950 },
    ],
    masterHost: "master2.xonotic.org",
    masterPort: 27950,
    // Plain getservers is more reliable than Ext+ipv4 against many masters.
    query: "getservers Xonotic 3 empty full",
    altQueries: [
      "getserversExt Xonotic 3 empty full ipv4",
      "getserversExt Xonotic 3 empty full",
    ],
    nameKeys: ["hostname", "sv_hostname", "host"],
    gamenameAllow: /xonotic|warsow|nexuiz/i,
    gamenameDeny: /mineclonia|minetest|luanti/i,
    httpFallback: "xonotic-deathmask",
    source: "dpmaster+http",
  },
  {
    slug: "unvanquished",
    kind: "dpmaster",
    masterHost: "master.unvanquished.net",
    masterPort: 27950,
    // Plain getservers is more reliable than Ext+ipv4 against this master.
    query: "getservers 86 empty full",
    altQueries: [
      "getserversExt Unvanquished 86 empty full ipv4",
      "getserversExt Unvanquished 86 empty full",
    ],
    nameKeys: ["sv_hostname", "hostname", "host"],
    // Daemon getinfo reports gamename=unv (not "unvanquished").
    gamenameAllow: /\bunv\b|unvanquished|tremulous/i,
    gamenameDeny: /mineclonia|minetest|luanti/i,
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
 * @param {GameMasterConfig} game
 * @returns {MasterEndpoint[]}
 */
function masterEndpoints(game) {
  if (Array.isArray(game.masters) && game.masters.length > 0) {
    return game.masters.filter((m) => m?.host && Number(m.port) > 0);
  }
  if (game.masterHost && game.masterPort) {
    return [{ host: game.masterHost, port: game.masterPort }];
  }
  return [];
}

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

  let clients = Number(info.clients ?? info.players ?? NaN);
  if (!Number.isFinite(clients)) {
    clients = Number(info._statusPlayers ?? 0) || 0;
  }
  // Only subtract real bot counters — sv_privateClients is private slots, not bots.
  const bots = Number(info.bots ?? info.bot_count ?? info.g_bots ?? NaN);
  if (Number.isFinite(bots) && bots > 0) {
    clients = Math.max(0, clients - bots);
  }
  return { players: Math.max(0, clients), maxPlayers };
}

/**
 * @param {Record<string, string>} info
 * @param {GameMasterConfig} game
 */
function passesGamenameFilter(info, game) {
  const raw = `${info.gamename || ""} ${info.com_gamename || ""} ${info.modname || ""} ${info.game || ""}`.trim();
  if (game.gamenameDeny && game.gamenameDeny.test(raw)) return false;
  if (!game.gamenameAllow) return true;
  if (!raw) return true; // empty after successful keyed reply is OK
  return game.gamenameAllow.test(raw);
}

/**
 * @param {GameMasterConfig} game
 * @returns {Promise<{ host: string, port: number }[]>}
 */
async function collectMasterAddresses(game) {
  const queries = [game.query, ...(game.altQueries || [])].filter(Boolean);
  const masters = masterEndpoints(game);
  /** @type {{ host: string, port: number }[]} */
  const addresses = [];
  const seen = new Set();

  for (const master of masters) {
    for (const query of queries) {
      try {
        const packets = await udpQueryMaster(master.host, master.port, query, 8000);
        for (const raw of packets) {
          for (const a of parseGetServersResponse(raw)) {
            const key = `${a.host}:${a.port}`;
            if (seen.has(key)) continue;
            seen.add(key);
            addresses.push(a);
          }
        }
        if (addresses.length >= 8) {
          console.log(
            `[dpmaster] ${game.slug} collected ${addresses.length} addrs from ${master.host}:${master.port} via "${query}"`
          );
          return addresses;
        }
      } catch (err) {
        console.warn(
          `[dpmaster] ${game.slug} ${master.host}:${master.port} query "${query}" failed:`,
          err instanceof Error ? err.message : err
        );
      }
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
  let masterAddrs = addresses.length;
  let infoOk = 0;
  let droppedGamename = 0;
  let kept = 0;

  const infos = await mapPool(addresses.slice(0, 180), 20, async (addr) => {
    const info = await getServerInfo(addr.host, addr.port);
    return { addr, info };
  });

  const nameKeys = game.nameKeys || ["hostname", "sv_hostname", "host"];

  /** @type {import('./types.js').GameServer[]} */
  const servers = [];
  for (const row of infos) {
    if (!row?.addr) continue;
    const { addr, info } = row;
    const fallback = `${addr.host}:${addr.port}`;

    // Keep any host that answered getinfo and passes gamename — IP-only names are OK.
    if (!info) continue;
    infoOk += 1;
    if (!passesGamenameFilter(info, game)) {
      droppedGamename += 1;
      continue;
    }

    const name = pickName(info, nameKeys, fallback);
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
    kept += 1;
  }

  console.log(
    `[dpmaster] ${game.slug} funnel masterAddrs=${masterAddrs} infoOk=${infoOk} droppedGamename=${droppedGamename} kept=${kept}`
  );

  if (kept === 0 && game.httpFallback === "xonotic-deathmask") {
    try {
      return await pollXonoticHttp();
    } catch (err) {
      console.warn(
        `[dpmaster] ${game.slug} HTTP fallback failed:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  servers.sort((a, b) => (b.players ?? -1) - (a.players ?? -1) || a.name.localeCompare(b.name));
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
      return pollWesnoth(creds);
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
  const masters = masterEndpoints(game);
  if (masters.length > 0) {
    return masters.map((m) => `${m.host}:${m.port}`).join(",");
  }
  if (game.masterHost && game.masterPort) return `${game.masterHost}:${game.masterPort}`;
  return game.kind;
}
