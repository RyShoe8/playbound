import { isIP } from "node:net";
import { attachGeo } from "../geo";
import { MAX_SERVERS, type GameServer } from "../types";

const count = (value: unknown): number | null => typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
const clean = (value: unknown): string | null => typeof value === "string" ? value.replace(/\^[0-9a-z]/gi, "").replace(/[\x00-\x1f]/g, "").trim() || null : null;

/** Official ms.srb2.org browser JSON; missing populations remain unknown. */
export function parseSrb2Servers(payload: unknown): GameServer[] {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { servers?: unknown }).servers)) throw new Error("Invalid SRB2 master server response");
  const rows = (payload as { servers: unknown[] }).servers;
  const servers = new Map<string, GameServer>();
  for (const value of rows) {
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    const address = row.address;
    if (!Array.isArray(address) || typeof address[0] !== "string" || !isIP(address[0])) continue;
    const port = count(address[1]);
    const name = clean(row.server_name);
    if (!port || port > 65535 || !name || row.error || row.joinable_state === "unreachable") continue;
    const id = `${address[0]}:${port}`;
    servers.set(id, { id, name, gameSlug: "srb2", host: address[0], port,
      players: count(row.num_humans), maxPlayers: count(row.max_connections), bots: count(row.num_bots),
      map: clean(row.map_title) || clean(row.map_lump), gameType: clean(row.gametype),
      location: null, protected: row.joinable_state === "password" || row.passworded === true });
  }
  if (rows.length && !servers.size) throw new Error("SRB2 master server returned no usable server records");
  return [...servers.values()];
}

/** Kart v1.6 uses the separate Kart Krew master, not Ring Racers' list.json. */
export function parseSrb2KartServers(text: string): GameServer[] {
  const servers = new Map<string, GameServer>();
  for (const line of text.split(/\r?\n/).filter((line) => line.trim())) {
    const [host, rawPort] = line.trim().split(/\s+/);
    const port = /^\d+$/.test(rawPort || "") ? Number(rawPort) : 0;
    if (!isIP(host || "") || port < 1 || port > 65535) throw new Error("Invalid SRB2Kart master server response");
    const id = `${host}:${port}`;
    servers.set(id, { id, gameSlug: "srb2kart", name: `SRB2Kart server · ${id}`, host, port,
      players: null, maxPlayers: null, map: null, gameType: null, location: null, protected: false });
  }
  return [...servers.values()];
}

async function fetchMaster(url: string): Promise<Response> {
  const response = await fetch(url, { headers: { "user-agent": "PlayBound/1.0" },
    next: { revalidate: 30 }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Official master server unavailable (HTTP ${response.status})`);
  return response;
}
async function srb2List(): Promise<GameServer[]> {
  return parseSrb2Servers(await (await fetchMaster("https://ms.srb2.org/list.json")).json());
}
export async function fetchSrb2Servers(): Promise<GameServer[]> {
  return attachGeo((await srb2List()).sort((a, b) => (b.players ?? -1) - (a.players ?? -1)).slice(0, MAX_SERVERS));
}
export async function fetchSrb2PlayerCount(): Promise<{ players: number; servers: number }> {
  const rows = await srb2List();
  if (rows.some((row) => row.players === null)) throw new Error("SRB2 master player count unavailable");
  return { players: rows.reduce((sum, row) => sum + (row.players ?? 0), 0), servers: rows.length };
}
export async function fetchSrb2KartServers(): Promise<GameServer[]> {
  return attachGeo(parseSrb2KartServers(await (await fetchMaster("https://ms.kartkrew.org/ms/api/games/SRB2Kart/10/servers?v=2.2")).text()).slice(0, MAX_SERVERS));
}
export async function fetchSrb2KartPlayerCount(): Promise<never> {
  throw new Error("SRB2Kart master lists addresses but does not report player counts");
}
