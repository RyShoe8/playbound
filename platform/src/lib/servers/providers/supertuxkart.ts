import { attachGeo } from "../geo";
import type { GameServer } from "../types";
import { MAX_SERVERS } from "../types";

function intToIpv4(n: number): string {
  const u = n >>> 0;
  return [(u >>> 24) & 255, (u >>> 16) & 255, (u >>> 8) & 255, u & 255].join(".");
}

const GAME_MODES: Record<string, string> = {
  "0": "Normal Race",
  "1": "Time Trial",
  "2": "Follow the Leader",
  "3": "Free-for-All",
  "4": "Capture the Flag",
  "5": "Battle",
  "6": "Soccer",
  "7": "Easter Egg Hunt",
};

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`, "i"));
  return m ? m[1] : null;
}

export async function fetchSuperTuxKartServers(): Promise<GameServer[]> {
  const res = await fetch("https://online.supertuxkart.net/api/v2/server/get-all", {
    headers: { "user-agent": "PlayBound/1.0", accept: "application/xml,text/xml,*/*" },
    next: { revalidate: 30 },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`STK API returned ${res.status}`);
  const xml = await res.text();
  const tags = [...xml.matchAll(/<server-info\b[^>]*\/?>/gi)].map((m) => m[0]);
  const mapped: GameServer[] = [];

  for (const tag of tags) {
    const name = attr(tag, "name");
    const ipRaw = attr(tag, "ip");
    const portRaw = attr(tag, "port");
    if (!name || !ipRaw || !portRaw) continue;
    const ipNum = Number(ipRaw);
    if (!Number.isFinite(ipNum)) continue;
    const host = intToIpv4(ipNum);
    const port = Number(portRaw);
    const country = attr(tag, "country_code");
    const mode = attr(tag, "game_mode");
    const track = attr(tag, "current_track");
    const gameStarted = attr(tag, "game_started");
    const trackLabel =
      track && track.trim()
        ? track
        : gameStarted !== "1"
          ? "In lobby"
          : null;
    mapped.push({
      id: attr(tag, "id") || `${host}:${port}`,
      name: name.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))),
      host,
      port,
      players: Number(attr(tag, "current_players") || 0),
      maxPlayers: Number(attr(tag, "max_players") || 0) || null,
      map: trackLabel,
      gameType: (mode && GAME_MODES[mode]) || mode,
      location: country ? { countryCode: country.toUpperCase() } : null,
      protected: attr(tag, "password") === "1",
    });
  }

  mapped.sort((a, b) => b.players - a.players || a.name.localeCompare(b.name));
  return attachGeo(mapped.slice(0, MAX_SERVERS));
}
