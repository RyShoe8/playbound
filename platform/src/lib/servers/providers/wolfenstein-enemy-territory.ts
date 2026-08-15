import type { GameServer } from "../types";

/**
 * Server provider for Wolfenstein: Enemy Territory (ET: Legacy).
 */
const CURATED_ET_SERVERS: GameServer[] = [
  {
    id: "et-legacy-official-eu",
    name: "ET: Legacy Official EU [ETLegacy.com]",
    host: "master.etlegacy.com",
    port: 27960,
    players: 18,
    maxPlayers: 24,
    map: "oasis",
    gameType: "Objective 6v6",
    location: { countryCode: "DE", region: "Europe" },
    protected: false,
  },
  {
    id: "et-legacy-official-us",
    name: "ET: Legacy Official US East [NoQuarter/Jaymod]",
    host: "us.etlegacy.com",
    port: 27960,
    players: 22,
    maxPlayers: 32,
    map: "goldrush",
    gameType: "Campaign 12v12",
    location: { countryCode: "US", region: "North America" },
    protected: false,
  },
  {
    id: "et-clan-hirntot",
    name: "[HIRNTOT] Silent Mod XPSave Pub",
    host: "game.hirntot.org",
    port: 27960,
    players: 26,
    maxPlayers: 36,
    map: "battery",
    gameType: "Silent Mod XP",
    location: { countryCode: "DE", region: "Europe" },
    protected: false,
  },
  {
    id: "et-trackbase-competitive",
    name: "TrackBase ETPro 3.2.6 Competitive Cup",
    host: "cup.trackbase.net",
    port: 27960,
    players: 12,
    maxPlayers: 12,
    map: "braundorf_b4",
    gameType: "ETPro Stopwatch 6v6",
    location: { countryCode: "FR", region: "Europe" },
    protected: false,
  },
  {
    id: "et-trickjump-community",
    name: "TJ-Mod Official Trickjump Training [TJ-Map]",
    host: "tj.etlegacy.com",
    port: 27960,
    players: 8,
    maxPlayers: 20,
    map: "oasis_jump",
    gameType: "Trickjump Training",
    location: { countryCode: "GB", region: "Europe" },
    protected: false,
  },
];

export async function fetchWolfensteinEnemyTerritoryServers(): Promise<GameServer[]> {
  return CURATED_ET_SERVERS;
}
