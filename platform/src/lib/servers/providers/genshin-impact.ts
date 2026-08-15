import { applyCountryCentroid } from "../geo";
import type { GameServer } from "../types";

/**
 * Genshin Impact official regional server realms and status.
 *
 * Checks HoYoverse's live global service gateway and tracks the primary
 * regional server clusters across North America, Europe, Asia, and TW/HK/MO.
 */

const AMERICA = applyCountryCentroid({ countryCode: "US", region: "North & South America (America Server)" });
const EUROPE = applyCountryCentroid({ countryCode: "DE", region: "Europe (Europe Server · Frankfurt)" });
const ASIA = applyCountryCentroid({ countryCode: "JP", region: "Asia (Asia Server · Tokyo)" });
const TW_HK_MO = applyCountryCentroid({ countryCode: "HK", region: "Taiwan, Hong Kong, Macao (TW/HK/MO Server)" });

export async function fetchGenshinImpactServers(): Promise<GameServer[]> {
  let hoyoOnline = true;
  try {
    const res = await fetch("https://genshin.hoyoverse.com", {
      method: "HEAD",
      headers: { "user-agent": "PlayBound/1.0" },
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(6_000),
    });
    hoyoOnline = res.ok;
  } catch {
    hoyoOnline = false;
  }

  const servers: GameServer[] = [
    {
      id: "genshin-america",
      name: "HoYoverse America Cluster (Teyvat Open World & 4-Player Co-Op)",
      host: "osasiadisp.yuanshen.com",
      port: 443,
      players: hoyoOnline ? 1 : 0,
      maxPlayers: null,
      map: "Teyvat (Mondstadt · Liyue · Inazuma · Sumeru · Fontaine · Natlan)",
      gameType: "Open-World ARPG & 4P Co-Op",
      location: AMERICA,
      protected: true,
    },
    {
      id: "genshin-europe",
      name: "HoYoverse Europe Cluster (Teyvat Open World & 4-Player Co-Op)",
      host: "oseurodisp.yuanshen.com",
      port: 443,
      players: hoyoOnline ? 1 : 0,
      maxPlayers: null,
      map: "Teyvat (Mondstadt · Liyue · Inazuma · Sumeru · Fontaine · Natlan)",
      gameType: "Open-World ARPG & 4P Co-Op",
      location: EUROPE,
      protected: true,
    },
    {
      id: "genshin-asia",
      name: "HoYoverse Asia Cluster (Teyvat Open World & 4-Player Co-Op)",
      host: "osasiadisp.yuanshen.com",
      port: 443,
      players: hoyoOnline ? 1 : 0,
      maxPlayers: null,
      map: "Teyvat (Mondstadt · Liyue · Inazuma · Sumeru · Fontaine · Natlan)",
      gameType: "Open-World ARPG & 4P Co-Op",
      location: ASIA,
      protected: true,
    },
    {
      id: "genshin-tw-hk-mo",
      name: "HoYoverse TW/HK/MO Cluster (Teyvat Open World & 4-Player Co-Op)",
      host: "oschtdisp.yuanshen.com",
      port: 443,
      players: hoyoOnline ? 1 : 0,
      maxPlayers: null,
      map: "Teyvat (Mondstadt · Liyue · Inazuma · Sumeru · Fontaine · Natlan)",
      gameType: "Open-World ARPG & 4P Co-Op",
      location: TW_HK_MO,
      protected: true,
    },
  ];

  return servers;
}
