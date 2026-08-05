import { MAX_SERVERS } from "./types.js";
import { stripQuakeColors } from "./udp.js";

const DEATHMASK_XML =
  "http://dpmaster.deathmask.net/?game=xonotic&xml=1&showplayers=1";

/**
 * Parse qstat-style deathmask XML into GameServer rows (no UDP required).
 * @param {string} xml
 * @returns {import('./types.js').GameServer[]}
 */
export function parseDeathmaskXonoticXml(xml) {
  const text = String(xml || "");
  /** @type {import('./types.js').GameServer[]} */
  const servers = [];
  const re = /<server\b([^>]*)>([\s\S]*?)<\/server>/gi;
  let m;
  while ((m = re.exec(text))) {
    const attrs = m[1] || "";
    const body = m[2] || "";
    const status = (attrs.match(/\bstatus="([^"]*)"/i) || [])[1] || "";
    if (status && status.toUpperCase() !== "UP") continue;

    const address = (attrs.match(/\baddress="([^"]*)"/i) || [])[1] || "";
    // Master summary row: address is the master host without :port game endpoint.
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
      "Xonotic";

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

/**
 * @param {string} body
 * @param {string} tag
 */
function tagText(body, tag) {
  const m = body.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? m[1].trim() : "";
}

/**
 * @param {string} body
 * @param {string} ruleName
 */
function ruleValue(body, ruleName) {
  const m = body.match(
    new RegExp(`<rule\\s+name="${ruleName}"[^>]*>([\\s\\S]*?)<\\/rule>`, "i")
  );
  return m ? stripQuakeColors(m[1].trim()) : null;
}

/**
 * @param {string | null | undefined} raw
 * @param {number | null} fallback
 */
function toInt(raw, fallback) {
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * HTTP fallback when UDP dpmaster returns nothing for Xonotic.
 * @returns {Promise<import('./types.js').GameServer[]>}
 */
export async function pollXonoticHttp() {
  const res = await fetch(DEATHMASK_XML, {
    headers: { "user-agent": "PlayBound-master-adapter/1.0", accept: "application/xml,text/xml,*/*" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`deathmask HTTP returned ${res.status}`);
  const xml = await res.text();
  const servers = parseDeathmaskXonoticXml(xml);
  console.log(`[dpmaster] xonotic HTTP fallback: ${servers.length} servers`);
  return servers;
}
