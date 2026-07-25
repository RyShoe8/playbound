import { MAX_SERVERS } from "./types.js";
import { getServerInfo, mapPool, parseGetServersResponse, udpQuery } from "./udp.js";

/**
 * @typedef {{
 *   slug: string,
 *   masterHost: string,
 *   masterPort: number,
 *   query: string,
 *   nameKeys?: string[],
 * }} GameMasterConfig
 */

/** @type {GameMasterConfig[]} */
export const GAMES = [
  {
    slug: "xonotic",
    masterHost: "dpmaster.deathmask.net",
    masterPort: 27950,
    query: "getserversExt Xonotic 3 empty full ipv4",
    nameKeys: ["hostname", "sv_hostname"],
  },
  {
    slug: "unvanquished",
    masterHost: "master.unvanquished.net",
    masterPort: 27950,
    query: "getservers 86 empty full",
    nameKeys: ["sv_hostname", "hostname"],
  },
];

/**
 * @param {GameMasterConfig} game
 * @returns {Promise<import('./types.js').GameServer[]>}
 */
export async function pollGame(game) {
  const raw = await udpQuery(game.masterHost, game.masterPort, game.query, 8000);
  const addresses = parseGetServersResponse(raw);
  // Prefer unique host:port
  const seen = new Set();
  const unique = [];
  for (const a of addresses) {
    const key = `${a.host}:${a.port}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(a);
  }

  const infos = await mapPool(unique.slice(0, 180), 20, async (addr) => {
    const info = await getServerInfo(addr.host, addr.port);
    return { addr, info };
  });

  /** @type {import('./types.js').GameServer[]} */
  const servers = [];
  for (const row of infos) {
    if (!row?.addr) continue;
    const { addr, info } = row;
    if (!info) continue;

    let name = null;
    for (const k of game.nameKeys || ["hostname"]) {
      if (info[k]) {
        name = info[k];
        break;
      }
    }
    name = name || `${addr.host}:${addr.port}`;

    const players = Number(info.clients ?? info.players ?? 0) || 0;
    const maxPlayers = Number(info.sv_maxclients ?? info.maxclients ?? 0) || null;
    const map = info.mapname || info.map || null;
    const gameType = info.gamename || info.modname || info.game || null;
    const needPass = info.needpass === "1" || info.g_needpass === "1";

    servers.push({
      id: `${addr.host}:${addr.port}`,
      name,
      host: addr.host,
      port: addr.port,
      players,
      maxPlayers,
      map,
      gameType,
      location: null,
      protected: needPass,
    });
  }

  servers.sort((a, b) => b.players - a.players || a.name.localeCompare(b.name));
  return servers.slice(0, MAX_SERVERS);
}
