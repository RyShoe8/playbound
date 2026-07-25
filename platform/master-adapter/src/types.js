/**
 * Shared GameServer shape (mirrors platform/src/lib/servers/types.ts).
 * @typedef {{ countryCode: string, region?: string }} ServerLocation
 * @typedef {{
 *   id: string,
 *   name: string,
 *   host: string,
 *   port: number,
 *   players: number,
 *   maxPlayers: number | null,
 *   map: string | null,
 *   gameType: string | null,
 *   location: ServerLocation | null,
 *   protected: boolean,
 * }} GameServer
 */

export const MAX_SERVERS = 100;
