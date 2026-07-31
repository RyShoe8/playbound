import { lookup as dnsLookup } from "dns/promises";
import type { ServerLocation } from "./types";
import { classifyUsDivision, usLocationLabel } from "./usRegion";

type CacheEntry = { location: ServerLocation | null; expires: number };

const cache = new Map<string, CacheEntry>();
const TTL_MS = 6 * 60 * 60 * 1000;

/** Approximate country centroids for Est. when GeoIP has country but no coordinates. */
const COUNTRY_CENTROIDS: Record<string, { lat: number; lon: number }> = {
  US: { lat: 39.8, lon: -98.5 },
  CA: { lat: 56.1, lon: -106.3 },
  GB: { lat: 54.0, lon: -2.5 },
  DE: { lat: 51.2, lon: 10.4 },
  FR: { lat: 46.2, lon: 2.2 },
  NL: { lat: 52.1, lon: 5.3 },
  BE: { lat: 50.5, lon: 4.5 },
  ES: { lat: 40.5, lon: -3.7 },
  IT: { lat: 41.9, lon: 12.6 },
  PL: { lat: 52.1, lon: 19.4 },
  SE: { lat: 60.1, lon: 18.6 },
  NO: { lat: 60.5, lon: 8.5 },
  FI: { lat: 61.9, lon: 25.7 },
  DK: { lat: 56.3, lon: 9.5 },
  IE: { lat: 53.1, lon: -8.0 },
  PT: { lat: 39.4, lon: -8.2 },
  CH: { lat: 46.8, lon: 8.2 },
  AT: { lat: 47.5, lon: 14.5 },
  CZ: { lat: 49.8, lon: 15.5 },
  RU: { lat: 61.5, lon: 105.3 },
  UA: { lat: 48.4, lon: 31.2 },
  BR: { lat: -14.2, lon: -51.9 },
  AR: { lat: -38.4, lon: -63.6 },
  MX: { lat: 23.6, lon: -102.5 },
  AU: { lat: -25.3, lon: 133.8 },
  NZ: { lat: -40.9, lon: 174.9 },
  JP: { lat: 36.2, lon: 138.3 },
  KR: { lat: 35.9, lon: 127.8 },
  CN: { lat: 35.9, lon: 104.2 },
  IN: { lat: 20.6, lon: 79.0 },
  SG: { lat: 1.4, lon: 103.8 },
  HK: { lat: 22.3, lon: 114.2 },
  TW: { lat: 23.7, lon: 121.0 },
  ZA: { lat: -30.6, lon: 22.9 },
  TR: { lat: 39.0, lon: 35.2 },
  IL: { lat: 31.0, lon: 34.9 },
  AE: { lat: 23.4, lon: 53.8 },
};

function isIpv4(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}


export function applyCountryCentroid(location: ServerLocation): ServerLocation {
  if (location.lat != null && location.lon != null) return location;
  const code = location.countryCode?.toUpperCase();
  if (!code) return location;
  const c = COUNTRY_CENTROIDS[code === "USA" ? "US" : code];
  if (!c) return location;
  return { ...location, lat: c.lat, lon: c.lon };
}

function refineLocation(location: ServerLocation): ServerLocation {
  const code = location.countryCode.toUpperCase();
  let next: ServerLocation = { ...location, countryCode: code === "USA" ? "US" : code };

  if (next.countryCode === "US") {
    if (/^US (East|Central|West)$/i.test(next.region ?? "")) {
      next = { ...next, countryCode: "US", region: next.region };
    } else {
      const division = classifyUsDivision({
        region: next.region,
        regionCode: next.regionCode,
        lat: next.lat,
        lon: next.lon,
      });
      if (division) {
        next = {
          ...next,
          countryCode: "US",
          region: usLocationLabel(division),
        };
      }
    }
  }

  return applyCountryCentroid(next);
}

async function resolveLookupHost(host: string): Promise<string | null> {
  if (isIpv4(host)) return host;
  if (host.includes(":")) return null; // skip raw IPv6 for free IPv4 GeoIP
  try {
    const res = await dnsLookup(host, { family: 4 });
    return res.address || null;
  } catch {
    return null;
  }
}

/** Best-effort GeoIP. Resolves hostnames to IPv4 first. Uses ipwho.is (no key, rate-limited). */
export async function lookupLocations(hosts: string[]): Promise<Map<string, ServerLocation | null>> {
  const out = new Map<string, ServerLocation | null>();
  const unique = [...new Set(hosts.filter(Boolean))];
  const now = Date.now();
  const missing: string[] = [];

  for (const host of unique) {
    const hit = cache.get(host);
    if (hit && hit.expires > now) {
      out.set(host, hit.location ? refineLocation(hit.location) : null);
    } else {
      missing.push(host);
    }
  }

  const batch = missing.slice(0, 50);
  await Promise.all(
    batch.map(async (host) => {
      try {
        const lookupHost = await resolveLookupHost(host);
        if (!lookupHost) {
          cache.set(host, { location: null, expires: now + 60_000 });
          out.set(host, null);
          return;
        }
        const res = await fetch(`https://ipwho.is/${lookupHost}`, {
          signal: AbortSignal.timeout(4000),
          next: { revalidate: 3600 },
        });
        if (!res.ok) {
          cache.set(host, { location: null, expires: now + TTL_MS });
          out.set(host, null);
          return;
        }
        const data = (await res.json()) as {
          success?: boolean;
          country_code?: string;
          region?: string;
          region_code?: string;
          country?: string;
          latitude?: number;
          longitude?: number;
        };
        const lat = typeof data.latitude === "number" ? data.latitude : undefined;
        const lon = typeof data.longitude === "number" ? data.longitude : undefined;
        const location =
          data.success !== false && data.country_code
            ? refineLocation({
                countryCode: data.country_code,
                region: data.region || data.country || undefined,
                regionCode: data.region_code || undefined,
                ...(lat != null && lon != null ? { lat, lon } : {}),
              })
            : null;
        cache.set(host, { location, expires: now + TTL_MS });
        out.set(host, location);
      } catch {
        cache.set(host, { location: null, expires: now + 60_000 });
        out.set(host, null);
      }
    })
  );

  return out;
}

function isUnknownCountryCode(code: string | null | undefined): boolean {
  if (!code) return true;
  const c = code.toUpperCase();
  return c === "ZZ" || c === "XX" || c === "A1" || c === "A2" || c === "O1";
}

function needsGeoLookup(location: ServerLocation | null): boolean {
  if (!location) return true;
  if (isUnknownCountryCode(location.countryCode)) return true;
  return location.lat == null || location.lon == null;
}

function preferCountryCode(existing: string | undefined, looked: string | undefined): string {
  if (looked && !isUnknownCountryCode(looked)) return looked;
  if (existing && !isUnknownCountryCode(existing)) return existing;
  return looked || existing || "ZZ";
}

export async function attachGeo<T extends { host: string; location: ServerLocation | null }>(
  servers: T[]
): Promise<T[]> {
  const need = servers.filter((s) => needsGeoLookup(s.location)).map((s) => s.host);
  if (need.length === 0) {
    return servers.map((s) =>
      s.location ? { ...s, location: refineLocation(s.location) } : s
    );
  }
  const map = await lookupLocations(need);
  return servers.map((s) => {
    if (!needsGeoLookup(s.location)) {
      return s.location ? { ...s, location: refineLocation(s.location) } : s;
    }
    const looked = map.get(s.host);
    if (!looked) {
      return s.location ? { ...s, location: refineLocation(s.location) } : s;
    }
    if (!s.location) return { ...s, location: looked };
    return {
      ...s,
      location: refineLocation({
        countryCode: preferCountryCode(s.location.countryCode, looked.countryCode),
        region: s.location.region || looked.region,
        regionCode: s.location.regionCode || looked.regionCode,
        lat: looked.lat ?? s.location.lat,
        lon: looked.lon ?? s.location.lon,
      }),
    };
  });
}

/** Common country names returned by game masters (e.g. OpenRA). */
const COUNTRY_NAME_TO_ISO: Record<string, string> = {
  afghanistan: "AF",
  albania: "AL",
  algeria: "DZ",
  argentina: "AR",
  armenia: "AM",
  australia: "AU",
  austria: "AT",
  azerbaijan: "AZ",
  bahrain: "BH",
  bangladesh: "BD",
  belarus: "BY",
  belgium: "BE",
  bolivia: "BO",
  "bosnia and herzegovina": "BA",
  bosnia: "BA",
  brazil: "BR",
  bulgaria: "BG",
  cambodia: "KH",
  canada: "CA",
  chile: "CL",
  china: "CN",
  colombia: "CO",
  croatia: "HR",
  cuba: "CU",
  cyprus: "CY",
  "czech republic": "CZ",
  czechia: "CZ",
  denmark: "DK",
  ecuador: "EC",
  egypt: "EG",
  estonia: "EE",
  finland: "FI",
  france: "FR",
  georgia: "GE",
  germany: "DE",
  greece: "GR",
  "hong kong": "HK",
  hungary: "HU",
  iceland: "IS",
  india: "IN",
  indonesia: "ID",
  iran: "IR",
  iraq: "IQ",
  ireland: "IE",
  israel: "IL",
  italy: "IT",
  japan: "JP",
  jordan: "JO",
  kazakhstan: "KZ",
  kenya: "KE",
  kuwait: "KW",
  latvia: "LV",
  lebanon: "LB",
  lithuania: "LT",
  luxembourg: "LU",
  malaysia: "MY",
  mexico: "MX",
  moldova: "MD",
  morocco: "MA",
  netherlands: "NL",
  "new zealand": "NZ",
  nigeria: "NG",
  "north macedonia": "MK",
  norway: "NO",
  oman: "OM",
  pakistan: "PK",
  panama: "PA",
  paraguay: "PY",
  peru: "PE",
  philippines: "PH",
  poland: "PL",
  portugal: "PT",
  qatar: "QA",
  romania: "RO",
  russia: "RU",
  "russian federation": "RU",
  "saudi arabia": "SA",
  serbia: "RS",
  singapore: "SG",
  slovakia: "SK",
  slovenia: "SI",
  "south africa": "ZA",
  "south korea": "KR",
  korea: "KR",
  spain: "ES",
  sweden: "SE",
  switzerland: "CH",
  taiwan: "TW",
  thailand: "TH",
  turkey: "TR",
  türkiye: "TR",
  ukraine: "UA",
  "united arab emirates": "AE",
  uae: "AE",
  "united kingdom": "GB",
  uk: "GB",
  "great britain": "GB",
  england: "GB",
  scotland: "GB",
  wales: "GB",
  "united states": "US",
  "united states of america": "US",
  usa: "US",
  uruguay: "UY",
  venezuela: "VE",
  vietnam: "VN",
};

/** Map a free-form country name to a display location (centroid applied). */
export function locationFromCountryName(name: string | null | undefined): ServerLocation | null {
  if (!name?.trim()) return null;
  const trimmed = name.trim();
  if (/^[A-Z]{2}$/i.test(trimmed)) {
    return refineLocation({ countryCode: trimmed.toUpperCase() });
  }
  const iso = COUNTRY_NAME_TO_ISO[trimmed.toLowerCase()];
  if (iso) {
    return refineLocation({ countryCode: iso, region: trimmed });
  }
  // Unknown name — keep label; GeoIP may replace ZZ via attachGeo
  return { countryCode: "ZZ", region: trimmed };
}
