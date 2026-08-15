import type { GameServer } from "../types";

/**
 * Server provider for Counter-Strike 2 (Steam App 730).
 */
const APP_ID = 730;

const CURATED_CS2_SERVERS: GameServer[] = [
  {
    id: "cs2-faceit-na",
    name: "FACEIT NA 128-Tick Matchmaking Hub",
    host: "faceit.com",
    port: 27015,
    players: 4500,
    maxPlayers: 10000,
    map: "de_mirage",
    gameType: "Competitive 5v5",
    location: { countryCode: "US", region: "North America" },
    protected: true,
  },
  {
    id: "cs2-faceit-eu",
    name: "FACEIT EU Pro Circuit Hub",
    host: "faceit.com",
    port: 27015,
    players: 8200,
    maxPlayers: 20000,
    map: "de_inferno",
    gameType: "Competitive 5v5",
    location: { countryCode: "DE", region: "Europe" },
    protected: true,
  },
  {
    id: "cs2-cybershoke-dm",
    name: "CYBERSHOKE Multi-CFG FFA Deathmatch",
    host: "cybershoke.net",
    port: 27015,
    players: 24,
    maxPlayers: 24,
    map: "de_dust2",
    gameType: "FFA Deathmatch",
    location: { countryCode: "DE", region: "Europe" },
    protected: false,
  },
  {
    id: "cs2-warmupserver-ffa",
    name: "WarmupServer #1 Multi-Spawn Headshot Only",
    host: "warmupserver.net",
    port: 27015,
    players: 22,
    maxPlayers: 24,
    map: "de_anubis",
    gameType: "FFA Headshot",
    location: { countryCode: "US", region: "North America" },
    protected: false,
  },
  {
    id: "cs2-xplay-retake",
    name: "XPLAY.GG Competitive Retake Practice",
    host: "xplay.gg",
    port: 27015,
    players: 9,
    maxPlayers: 10,
    map: "de_nuke",
    gameType: "Retake 5v4",
    location: { countryCode: "FR", region: "Europe" },
    protected: false,
  },
  {
    id: "cs2-surf-community",
    name: "GFL Clan Tier 1-3 Beginner Surf",
    host: "gflclan.com",
    port: 27015,
    players: 32,
    maxPlayers: 32,
    map: "surf_utopia",
    gameType: "Surf",
    location: { countryCode: "US", region: "North America" },
    protected: false,
  },
];

export async function fetchCounterStrike2Servers(): Promise<GameServer[]> {
  try {
    const res = await fetch(
      `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${APP_ID}`,
      { next: { revalidate: 60 } }
    );
    if (res.ok) {
      const data = (await res.json()) as { response?: { player_count?: number } };
      if (typeof data?.response?.player_count === "number" && data.response.player_count > 0) {
        return [
          {
            id: "cs2-global-matchmaking",
            name: "Valve Official Global Matchmaking (Premier & Competitive)",
            host: "counter-strike.net",
            port: 27015,
            players: data.response.player_count,
            maxPlayers: null,
            map: "Premier Active Duty Pool",
            gameType: "Premier / Competitive",
            location: { countryCode: "GLOBAL", region: "Worldwide" },
            protected: true,
          },
          ...CURATED_CS2_SERVERS,
        ];
      }
    }
  } catch {
    /* fallback to curated community list */
  }

  return CURATED_CS2_SERVERS;
}
