import { attachGeo } from "../geo";
import type { GameServer } from "../types";
import { MAX_SERVERS } from "../types";

/**
 * OpenArena server list via deathmask dpmaster HTTP/XML (same qstat feed as Xonotic).
 * http://dpmaster.deathmask.net/?game=openarena&xml=1
 */

const DEATHMASK_XML =
  "http://dpmaster.deathmask.net/?game=openarena&xml=1&showplayers=1";

function stripQuakeColors(text: string): string {
  return String(text || "")
    .replace(/\^(\d|x[0-9a-fA-F]{6})/g, "")
    .trim();
}

function tagText(body: string, tag: string): string {
  const m = body.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? m[1].trim() : "";
}

function ruleValue(body: string, ruleName: string): string | null {
  const m = body.match(
    new RegExp(`<rule\\s+name="${ruleName}"[^>]*>([\\s\\S]*?)<\\/rule>`, "i")
  );
  return m ? stripQuakeColors(m[1].trim()) : null;
}

function toInt(raw: string | null | undefined, fallback: number | null): number | null {
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function parseDeathmaskOpenArenaXml(xml: string): GameServer[] {
  const servers: GameServer[] = [];
  const re = /<server\b([^>]*)>([\s\S]*?)<\/server>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const attrs = m[1] || "";
    const body = m[2] || "";
    const status = (attrs.match(/\bstatus="([^"]*)"/i) || [])[1] || "";
    if (status && status.toUpperCase() !== "UP") continue;

    const address = (attrs.match(/\baddress="([^"]*)"/i) || [])[1] || "";
    if (!address || !/:\d+$/.test(address)) continue;

    const [host, portStr] = address.split(":");
    const port = Number(portStr);
    if (!host || !Number.isFinite(port) || port <= 0) continue;

    const nameRaw = tagText(body, "name") || tagText(body, "hostname") || address;
    const name = stripQuakeColors(nameRaw) || address;
    const players = toInt(tagText(body, "numplayers"), 0);
    const maxPlayers = toInt(tagText(body, "maxplayers"), null);
    const map = stripQuakeColors(tagText(body, "map") || "") || null;
    const gameType =
      stripQuakeColors(tagText(body, "gametype") || "") ||
      ruleValue(body, "gamename") ||
      "OpenArena";

    servers.push({
      id: `${host}:${port}`,
      name,
      host,
      port,
      players,
      maxPlayers,
      map,
      gameType,
      location: null,
      protected: false,
    });
  }

  servers.sort(
    (a, b) => (b.players ?? -1) - (a.players ?? -1) || a.name.localeCompare(b.name)
  );
  return servers.slice(0, MAX_SERVERS);
}

export async function fetchOpenArenaServers(): Promise<GameServer[]> {
  const res = await fetch(DEATHMASK_XML, {
    headers: {
      "user-agent": "PlayBound/1.0",
      accept: "application/xml,text/xml,*/*",
    },
    next: { revalidate: 45 },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`OpenArena deathmask returned ${res.status}`);
  const xml = await res.text();
  const mapped = parseDeathmaskOpenArenaXml(xml);
  return attachGeo(mapped);
}
