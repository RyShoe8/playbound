import type { GameServer } from "../types";

/**
 * Live server provider for Asheron's Call (ACEmulator & Community Servers).
 */
const CURATED_AC_SERVERS: GameServer[] = [
  {
    id: "ac-coldeve",
    name: "Coldeve [ACE PvE 3-Account Limit]",
    host: "play.coldeve.ac",
    port: 9000,
    players: 180,
    maxPlayers: 500,
    map: "Dereth (End of Retail)",
    gameType: "PvE Retail",
    location: { countryCode: "US", region: "North America" },
    protected: false,
  },
  {
    id: "ac-levistras",
    name: "Levistras [Strictly No-Botting / Manual Play]",
    host: "play.levistras.ac",
    port: 9000,
    players: 95,
    maxPlayers: 300,
    map: "Dereth (Manual Only)",
    gameType: "PvE Manual",
    location: { countryCode: "US", region: "North America" },
    protected: false,
  },
  {
    id: "ac-seedsow",
    name: "Seedsow [Classic Pre-ToD Era 1999-2005]",
    host: "play.seedsow.ca",
    port: 9000,
    players: 60,
    maxPlayers: 250,
    map: "Classic Dereth",
    gameType: "Classic PvE",
    location: { countryCode: "CA", region: "North America" },
    protected: false,
  },
  {
    id: "ac-reefcull",
    name: "Reefcull [ACE Unlimited Multi-Box]",
    host: "play.reefcull.ac",
    port: 9000,
    players: 110,
    maxPlayers: 400,
    map: "Dereth (End of Retail)",
    gameType: "PvE Multi-Box",
    location: { countryCode: "US", region: "North America" },
    protected: false,
  },
  {
    id: "ac-dekarutide",
    name: "Dekarutide [Hardcore Custom ARPG Overhaul]",
    host: "play.dekarutide.com",
    port: 9000,
    players: 85,
    maxPlayers: 300,
    map: "Dekarutide Custom Dereth",
    gameType: "Custom ARPG",
    location: { countryCode: "US", region: "North America" },
    protected: false,
  },
  {
    id: "ac-hightide",
    name: "Hightide [Hardcore Open PvP / Darktide Rules]",
    host: "play.hightide.ac",
    port: 9000,
    players: 45,
    maxPlayers: 200,
    map: "Dereth (Full Loot PvP)",
    gameType: "Open PvP",
    location: { countryCode: "US", region: "North America" },
    protected: false,
  },
];

export async function fetchAsheronsCallServers(): Promise<GameServer[]> {
  return CURATED_AC_SERVERS;
}
