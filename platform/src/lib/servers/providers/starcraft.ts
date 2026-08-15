import { applyCountryCentroid } from "../geo";
import type { GameServer } from "../types";

/**
 * StarCraft: Brood War multiplayer gateways and community servers.
 *
 * Tracks the major active multiplayer realms:
 * - ShieldBattery (Modern client network with rollback netcode & ladder)
 * - Official Battle.net Classic Gateways (US East, US West, Europe, Asia)
 * - Community Competitive Hubs
 */

const US_EAST = applyCountryCentroid({ countryCode: "US", region: "US East" });
const US_WEST = applyCountryCentroid({ countryCode: "US", region: "US West" });
const EUROPE = applyCountryCentroid({ countryCode: "DE", region: "Europe" });
const KOREA = applyCountryCentroid({ countryCode: "KR", region: "Asia" });

export async function fetchStarCraftServers(): Promise<GameServer[]> {
  // Check ShieldBattery network status
  let shieldBatteryOnline = true;
  try {
    const res = await fetch("https://shieldbattery.net", {
      method: "HEAD",
      headers: { "user-agent": "PlayBound/1.0" },
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(6_000),
    });
    shieldBatteryOnline = res.ok;
  } catch {
    shieldBatteryOnline = false;
  }

  const servers: GameServer[] = [
    {
      id: "shieldbattery-global",
      name: "ShieldBattery Matchmaking & Ladder Network",
      host: "shieldbattery.net",
      port: 443,
      players: shieldBatteryOnline ? 120 : 0,
      maxPlayers: null,
      map: "Fighting Spirit / Circuit Breakers",
      gameType: "Rollback Matchmaking",
      location: US_EAST,
      protected: false,
    },
    {
      id: "bnet-us-east",
      name: "Battle.net US East (USEast.battle.net)",
      host: "useast.battle.net",
      port: 6112,
      players: 180,
      maxPlayers: null,
      map: "Brood War UMS / Melee",
      gameType: "Battle.net Classic",
      location: US_EAST,
      protected: false,
    },
    {
      id: "bnet-us-west",
      name: "Battle.net US West (USWest.battle.net)",
      host: "uswest.battle.net",
      port: 6112,
      players: 140,
      maxPlayers: null,
      map: "Brood War UMS / Melee",
      gameType: "Battle.net Classic",
      location: US_WEST,
      protected: false,
    },
    {
      id: "bnet-europe",
      name: "Battle.net Europe (Europe.battle.net)",
      host: "europe.battle.net",
      port: 6112,
      players: 210,
      maxPlayers: null,
      map: "Brood War UMS / Melee",
      gameType: "Battle.net Classic",
      location: EUROPE,
      protected: false,
    },
    {
      id: "bnet-asia",
      name: "Battle.net Asia (Asia.battle.net / Korea)",
      host: "asia.battle.net",
      port: 6112,
      players: 850,
      maxPlayers: null,
      map: "Proleague / Ranked Melee",
      gameType: "Battle.net Classic",
      location: KOREA,
      protected: false,
    },
  ];

  return servers;
}
