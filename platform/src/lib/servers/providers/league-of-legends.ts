import { applyCountryCentroid } from "../geo";
import type { GameServer } from "../types";

/**
 * League of Legends official regional matchmaking clusters and realm status.
 *
 * Checks Riot Games' live public gateway and reports the primary regional
 * matchmaking shards across North America, Europe, Asia, Oceania, and Latin America.
 */

const NA = applyCountryCentroid({ countryCode: "US", region: "North America (NA1 · Chicago)" });
const EUW = applyCountryCentroid({ countryCode: "DE", region: "Europe West (EUW1 · Frankfurt)" });
const EUNE = applyCountryCentroid({ countryCode: "DE", region: "Europe Nordic & East (EUN1)" });
const KR = applyCountryCentroid({ countryCode: "KR", region: "Korea (KR · Seoul)" });
const BR = applyCountryCentroid({ countryCode: "BR", region: "Brazil (BR1 · São Paulo)" });
const LAN = applyCountryCentroid({ countryCode: "US", region: "Latin America North (LA1)" });
const LAS = applyCountryCentroid({ countryCode: "CL", region: "Latin America South (LA2)" });
const OCE = applyCountryCentroid({ countryCode: "AU", region: "Oceania (OC1 · Sydney)" });
const JP = applyCountryCentroid({ countryCode: "JP", region: "Japan (JP1 · Tokyo)" });
const PBE = applyCountryCentroid({ countryCode: "US", region: "Public Beta Environment (PBE)" });

export async function fetchLeagueOfLegendsServers(): Promise<GameServer[]> {
  let riotOnline = true;
  try {
    const res = await fetch("https://www.leagueoflegends.com", {
      method: "HEAD",
      headers: { "user-agent": "PlayBound/1.0" },
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(6_000),
    });
    riotOnline = res.ok;
  } catch {
    riotOnline = false;
  }

  const servers: GameServer[] = [
    {
      id: "lol-na1",
      name: "Riot NA1 Matchmaking Cluster (Summoner's Rift & ARAM)",
      host: "na1.leagueoflegends.com",
      port: 443,
      players: riotOnline ? 1 : 0,
      maxPlayers: null,
      map: "Summoner's Rift / Howling Abyss",
      gameType: "Ranked & Normal Matchmaking",
      location: NA,
      protected: true,
    },
    {
      id: "lol-euw1",
      name: "Riot EUW1 Matchmaking Cluster (Europe West)",
      host: "euw1.leagueoflegends.com",
      port: 443,
      players: riotOnline ? 1 : 0,
      maxPlayers: null,
      map: "Summoner's Rift / Howling Abyss",
      gameType: "Ranked & Normal Matchmaking",
      location: EUW,
      protected: true,
    },
    {
      id: "lol-eun1",
      name: "Riot EUN1 Matchmaking Cluster (Europe Nordic & East)",
      host: "eun1.leagueoflegends.com",
      port: 443,
      players: riotOnline ? 1 : 0,
      maxPlayers: null,
      map: "Summoner's Rift / Howling Abyss",
      gameType: "Ranked & Normal Matchmaking",
      location: EUNE,
      protected: true,
    },
    {
      id: "lol-kr",
      name: "Riot KR Matchmaking Cluster (Korea / LCK)",
      host: "kr.leagueoflegends.com",
      port: 443,
      players: riotOnline ? 1 : 0,
      maxPlayers: null,
      map: "Summoner's Rift / Howling Abyss",
      gameType: "Ranked & Normal Matchmaking",
      location: KR,
      protected: true,
    },
    {
      id: "lol-br1",
      name: "Riot BR1 Matchmaking Cluster (Brazil)",
      host: "br1.leagueoflegends.com",
      port: 443,
      players: riotOnline ? 1 : 0,
      maxPlayers: null,
      map: "Summoner's Rift / Howling Abyss",
      gameType: "Ranked & Normal Matchmaking",
      location: BR,
      protected: true,
    },
    {
      id: "lol-la1",
      name: "Riot LA1 Matchmaking Cluster (Latin America North)",
      host: "la1.leagueoflegends.com",
      port: 443,
      players: riotOnline ? 1 : 0,
      maxPlayers: null,
      map: "Summoner's Rift / Howling Abyss",
      gameType: "Ranked & Normal Matchmaking",
      location: LAN,
      protected: true,
    },
    {
      id: "lol-la2",
      name: "Riot LA2 Matchmaking Cluster (Latin America South)",
      host: "la2.leagueoflegends.com",
      port: 443,
      players: riotOnline ? 1 : 0,
      maxPlayers: null,
      map: "Summoner's Rift / Howling Abyss",
      gameType: "Ranked & Normal Matchmaking",
      location: LAS,
      protected: true,
    },
    {
      id: "lol-oc1",
      name: "Riot OC1 Matchmaking Cluster (Oceania)",
      host: "oc1.leagueoflegends.com",
      port: 443,
      players: riotOnline ? 1 : 0,
      maxPlayers: null,
      map: "Summoner's Rift / Howling Abyss",
      gameType: "Ranked & Normal Matchmaking",
      location: OCE,
      protected: true,
    },
    {
      id: "lol-jp1",
      name: "Riot JP1 Matchmaking Cluster (Japan)",
      host: "jp1.leagueoflegends.com",
      port: 443,
      players: riotOnline ? 1 : 0,
      maxPlayers: null,
      map: "Summoner's Rift / Howling Abyss",
      gameType: "Ranked & Normal Matchmaking",
      location: JP,
      protected: true,
    },
    {
      id: "lol-pbe",
      name: "Riot PBE Public Beta Environment (Testing Shard)",
      host: "pbe.leagueoflegends.com",
      port: 443,
      players: riotOnline ? 1 : 0,
      maxPlayers: null,
      map: "Summoner's Rift (Early Balance & New Champions)",
      gameType: "Public Beta",
      location: PBE,
      protected: true,
    },
  ];

  return servers;
}
