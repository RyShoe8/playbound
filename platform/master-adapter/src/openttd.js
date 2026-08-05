import { MAX_SERVERS } from "./types.js";
import { mapPool } from "./udp.js";

const LISTING_URL = "https://servers.openttd.org/listing";
const DETAIL_BASE = "https://servers.openttd.org/server/";

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
  eu: "DE",
  na: "US",
  sa: "BR",
  oc: "AU",
  as: "SG",
};

const NAME_HINTS = [
  [/korea|korean|\.kr\b|\[kor\]/i, "KR"],
  [/japan|\.jp\b/i, "JP"],
  [/australia|aussie|\.au\b/i, "AU"],
  [/new zealand|\.nz\b/i, "NZ"],
  [/united states|\busa\b|\bu\.s\.|\bus\b|\bnyc\b|\bohio\b|\btexas\b|\bcalifornia\b/i, "US"],
  [/canada|\.ca\b/i, "CA"],
  [/united kingdom|\buk\b|britain|england|scotland|wales/i, "GB"],
  [/germany|deutsch|\.de\b/i, "DE"],
  [/netherlands|dutch|\.nl\b/i, "NL"],
  [/france|français|\.fr\b/i, "FR"],
  [/poland|polska|\.pl\b/i, "PL"],
  [/spain|español|\.es\b/i, "ES"],
  [/italy|italia|\.it\b/i, "IT"],
  [/russia|росси|\.ru\b/i, "RU"],
  [/ukraine|\.ua\b/i, "UA"],
  [/brazil|brasil|\.br\b/i, "BR"],
  [/argentina|\.ar\b/i, "AR"],
  [/mexico|\.mx\b/i, "MX"],
  [/singapore|\.sg\b|sea asia|southeast asia/i, "SG"],
  [/hong kong|\.hk\b/i, "HK"],
  [/taiwan|\.tw\b/i, "TW"],
  [/china|\.cn\b/i, "CN"],
  [/india|\.in\b/i, "IN"],
  [/turkey|türkiye|\.tr\b/i, "TR"],
  [/portugal|\.pt\b/i, "PT"],
  [/belgium|\.be\b/i, "BE"],
  [/austria|\.at\b/i, "AT"],
  [/switzerland|\.ch\b/i, "CH"],
  [/ireland|\.ie\b/i, "IE"],
  [/europe\b|\beu\b/i, "DE"],
  [/scandinavia|sweden|svea|\.se\b/i, "SE"],
  [/norway|\.no\b/i, "NO"],
  [/denmark|\.dk\b/i, "DK"],
  [/finland|\.fi\b/i, "FI"],
  [/czech|czechia|\.cz\b/i, "CZ"],
  [/\bnorth america\b|\bna\b/i, "US"],
  [/\bsouth america\b|\blatam\b/i, "BR"],
  [/\boceania\b/i, "AU"],
];

const CLIMATE_RE = /\b(temperate|arctic|tropical|tropic|toyland|desert|winter)\b/i;

/**
 * @param {string} raw
 */
function titleCaseClimate(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return null;
  if (s === "tropic") return "Tropical";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

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
  const paren = name.match(/\(([A-Za-z]{2,3})\)/);
  if (paren) {
    const iso = TAG_TO_ISO[paren[1].toLowerCase()];
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
  if (climate) return titleCaseClimate(climate[1]);
  return null;
}

/**
 * Detail pages expose Landscape + Map size (not scenario filenames).
 * @param {string} html
 * @param {string} invite
 * @returns {{ map: string | null, location: { countryCode: string, region?: string } | null }}
 */
function parseDetailPage(html, invite) {
  const landscapeMatch =
    html.match(/Landscape\s*[:<\/][^A-Za-z0-9]*([A-Za-z][A-Za-z ]{2,20})/i) ||
    html.match(/>\s*Landscape\s*<[\s\S]{0,80}?>([A-Za-z][A-Za-z ]{2,20})</i);
  const sizeMatch =
    html.match(/Map\s*size\s*[:<\/][^0-9]*(\d+)\s*[×xX]\s*(\d+)/i) ||
    html.match(/>\s*Map\s*size\s*<[\s\S]{0,80}?>(\d+)\s*[×xX]\s*(\d+)</i);

  let landscape = landscapeMatch ? titleCaseClimate(landscapeMatch[1]) : null;
  if (!landscape) {
    const climate = html.match(/\b(Temperate|Arctic|Tropic(?:al)?|Toyland|Desert|Winter)\b/i);
    if (climate) landscape = titleCaseClimate(climate[1]);
  }

  /** @type {string | null} */
  let map = null;
  if (landscape && sizeMatch) {
    map = `${landscape} · ${sizeMatch[1]}×${sizeMatch[2]}`;
  } else if (landscape) {
    map = landscape;
  } else if (sizeMatch) {
    map = `${sizeMatch[1]}×${sizeMatch[2]}`;
  }

  const locMatch =
    html.match(/Country\s*[:<\/][^A-Za-z]*([A-Za-z][A-Za-z .'-]{1,40})/i) ||
    html.match(/Location\s*[:<\/][^A-Za-z]*([A-Za-z][A-Za-z .'-]{1,40})/i);

  /** @type {{ countryCode: string, region?: string } | null} */
  let location = null;
  if (locMatch) {
    const raw = locMatch[1].trim();
    if (/^[A-Z]{2}$/i.test(raw)) location = { countryCode: raw.toUpperCase() };
    else {
      const hit = NAME_HINTS.find(([re]) => re.test(raw));
      if (hit) location = { countryCode: hit[1], region: raw };
      else {
        const key = raw.toLowerCase().slice(0, 3);
        const iso = TAG_TO_ISO[key] || TAG_TO_ISO[raw.toLowerCase().slice(0, 2)];
        if (iso) location = { countryCode: iso, region: raw };
      }
    }
  }

  void invite;
  return { map, location };
}

/**
 * Scrape public OpenTTD listing; enrich listed servers via detail pages.
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

  mapped.sort((a, b) => (b.players ?? -1) - (a.players ?? -1) || a.name.localeCompare(b.name));
  const top = mapped.slice(0, MAX_SERVERS);

  // Enrich every listed server (up to MAX_SERVERS) for Landscape · Map size.
  await mapPool(top, 8, async (server) => {
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
      } else if (!server.location) {
        server.location = locationFromName(server.name);
      }
    } catch {
      /* detail optional */
    }
  });

  return top;
}
