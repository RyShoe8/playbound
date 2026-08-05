import { MAX_SERVERS } from "./types.js";
import { mapPool } from "./udp.js";

const LISTING_URL = "https://servers.openttd.org/listing";
const DETAIL_BASE = "https://servers.openttd.org/server/";
const DETAIL_ENRICH = 40;

/** @type {Record<string, string>} */
const TAG_TO_ISO = {
  pl: "PL",
  de: "DE",
  nl: "NL",
  fr: "FR",
  es: "ES",
  it: "IT",
  cz: "CZ",
  se: "SE",
  no: "NO",
  fi: "FI",
  dk: "DK",
  uk: "GB",
  gb: "GB",
  us: "US",
  usa: "US",
  ca: "CA",
  au: "AU",
  nz: "NZ",
  jp: "JP",
  kr: "KR",
  kor: "KR",
  br: "BR",
  ar: "AR",
  mx: "MX",
  ru: "RU",
  ua: "UA",
  cn: "CN",
  tw: "TW",
  hk: "HK",
  sg: "SG",
  in: "IN",
  tr: "TR",
  pt: "PT",
  be: "BE",
  at: "AT",
  ch: "CH",
  ie: "IE",
};

const NAME_HINTS = [
  [/korea|korean|\.kr\b|\[kor\]/i, "KR"],
  [/japan|\.jp\b/i, "JP"],
  [/australia|aussie|\.au\b/i, "AU"],
  [/new zealand|\.nz\b/i, "NZ"],
  [/united states|\busa\b|\bu\.s\./i, "US"],
  [/canada|\.ca\b/i, "CA"],
  [/united kingdom|\buk\b|britain|england/i, "GB"],
  [/germany|deutsch|\.de\b/i, "DE"],
  [/netherlands|dutch|\.nl\b/i, "NL"],
  [/france|français|\.fr\b/i, "FR"],
  [/poland|polska|\.pl\b/i, "PL"],
  [/spain|español|\.es\b/i, "ES"],
  [/russia|росси/i, "RU"],
  [/brazil|brasil/i, "BR"],
  [/argentina/i, "AR"],
  [/singapore|\.sg\b|sea asia/i, "SG"],
  [/europe\b/i, "DE"],
  [/scandinavia|sweden|svea/i, "SE"],
  [/finland|\.fi\b/i, "FI"],
  [/czech|czechia/i, "CZ"],
];

const CLIMATE_RE = /\b(temperate|arctic|tropical|tropic|toyland|desert|winter)\b/i;

/**
 * @param {string} name
 * @returns {{ countryCode: string, region?: string } | null}
 */
function locationFromName(name) {
  const tag = name.match(/\[([A-Za-z]{2,3})\]/);
  if (tag) {
    const iso = TAG_TO_ISO[tag[1].toLowerCase()];
    if (iso) return { countryCode: iso };
  }
  for (const [re, iso] of NAME_HINTS) {
    if (re.test(name)) return { countryCode: iso };
  }
  return null;
}

/**
 * @param {string} name
 * @returns {string | null}
 */
function mapFromName(name) {
  const climate = name.match(CLIMATE_RE);
  if (climate) return climate[1].charAt(0).toUpperCase() + climate[1].slice(1).toLowerCase();
  return null;
}

/**
 * @param {string} html
 * @param {string} invite
 * @returns {{ map: string | null, location: { countryCode: string, region?: string } | null }}
 */
function parseDetailPage(html, invite) {
  let map = null;
  const mapMatch =
    html.match(/Map(?:\s*size)?\s*[:<][^A-Za-z0-9]*([A-Za-z][A-Za-z0-9 _.-]{2,60})/i) ||
    html.match(/landscape[^A-Za-z0-9]+([A-Za-z]+)/i) ||
    html.match(/\b(Temperate|Arctic|Tropic|Toyland|Desert)\b/);
  if (mapMatch) map = mapMatch[1].trim();

  const locMatch =
    html.match(/Country\s*[:<][^A-Za-z]*([A-Za-z][A-Za-z .'-]{1,40})/i) ||
    html.match(/Location\s*[:<][^A-Za-z]*([A-Za-z][A-Za-z .'-]{1,40})/i);

  /** @type {{ countryCode: string, region?: string } | null} */
  let location = null;
  if (locMatch) {
    const raw = locMatch[1].trim();
    if (/^[A-Z]{2}$/i.test(raw)) location = { countryCode: raw.toUpperCase() };
    else {
      const hit = NAME_HINTS.find(([re]) => re.test(raw));
      if (hit) location = { countryCode: hit[1], region: raw };
    }
  }

  void invite;
  return { map, location };
}

/**
 * Scrape public OpenTTD listing; enrich top servers via detail pages.
 * Host stays as Game Coordinator invite (+ABC) for join.
 * @returns {Promise<import('./types.js').GameServer[]>}
 */
export async function pollOpenTtd() {
  const res = await fetch(LISTING_URL, {
    headers: { "user-agent": "PlayBound-master-adapter/1.0", accept: "text/html" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`OpenTTD listing returned ${res.status}`);
  const html = await res.text();

  const rowRe =
    /href="\/server\/(\+[A-Za-z0-9]+)"[^>]*>\s*([^<]+?)\s*<\/a>[\s\S]*?(\d+)\s*\/\s*(\d+)[\s\S]*?(\d+)\s*\/\s*(\d+)[\s\S]*?(\d+h\s*\d+m|\d+h|\d+m)/gi;

  /** @type {import('./types.js').GameServer[]} */
  const mapped = [];
  const seen = new Set();

  let match;
  while ((match = rowRe.exec(html)) !== null) {
    const invite = match[1];
    const name = match[2].replace(/\s+/g, " ").trim();
    const players = Number(match[3]) || 0;
    const maxPlayers = Number(match[4]) || null;
    const companies = Number(match[5]) || 0;
    const maxCompanies = Number(match[6]) || 0;
    const playTime = (match[7] || "").replace(/\s+/g, " ").trim();
    if (!invite || !name || seen.has(invite)) continue;
    seen.add(invite);

    const slice = html.slice(match.index, match.index + 1600);
    const ver = slice.match(/href="\/listing\/([^"]+)"/)?.[1] || null;
    const modeParts = [
      ver,
      maxCompanies > 0 ? `${companies}/${maxCompanies} cos` : null,
      playTime || null,
    ].filter(Boolean);

    mapped.push({
      id: invite,
      name,
      host: invite,
      port: 3979,
      players,
      maxPlayers,
      map: mapFromName(name),
      gameType: modeParts.length ? modeParts.join(" · ") : null,
      location: locationFromName(name),
      protected: false,
    });
  }

  if (mapped.length === 0) {
    const simpleRe =
      /href="\/server\/(\+[A-Za-z0-9]+)"[^>]*>\s*([^<]+?)\s*<\/a>[\s\S]*?(\d+)\s*\/\s*(\d+)/g;
    let m;
    while ((m = simpleRe.exec(html)) !== null) {
      const invite = m[1];
      const name = m[2].replace(/\s+/g, " ").trim();
      if (!invite || !name || seen.has(invite)) continue;
      seen.add(invite);
      const slice = html.slice(m.index, m.index + 1200);
      const ver = slice.match(/href="\/listing\/([^"]+)"/)?.[1] || null;
      mapped.push({
        id: invite,
        name,
        host: invite,
        port: 3979,
        players: Number(m[3]) || 0,
        maxPlayers: Number(m[4]) || null,
        map: mapFromName(name),
        gameType: ver,
        location: locationFromName(name),
        protected: false,
      });
    }
  }

  mapped.sort((a, b) => (b.players ?? 0) - (a.players ?? 0) || a.name.localeCompare(b.name));
  const top = mapped.slice(0, MAX_SERVERS);
  const enrichTargets = top.slice(0, DETAIL_ENRICH);

  await mapPool(enrichTargets, 6, async (server) => {
    try {
      const detailRes = await fetch(`${DETAIL_BASE}${encodeURIComponent(server.host)}`, {
        headers: { "user-agent": "PlayBound-master-adapter/1.0", accept: "text/html" },
        signal: AbortSignal.timeout(8_000),
      });
      if (!detailRes.ok) return;
      const detailHtml = await detailRes.text();
      const parsed = parseDetailPage(detailHtml, server.host);
      if (parsed.map) server.map = parsed.map;
      if (parsed.location) {
        server.location = {
          countryCode: parsed.location.countryCode,
          region: parsed.location.region || server.location?.region,
        };
      }
    } catch {
      /* detail optional */
    }
  });

  return top;
}
