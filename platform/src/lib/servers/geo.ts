import type { ServerLocation } from "./types";

type CacheEntry = { location: ServerLocation | null; expires: number };

const cache = new Map<string, CacheEntry>();
const TTL_MS = 6 * 60 * 60 * 1000;

function isIp(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":");
}

/** Best-effort GeoIP for IPv4 hosts. Uses ip-api.com (no key, rate-limited). */
export async function lookupLocations(hosts: string[]): Promise<Map<string, ServerLocation | null>> {
  const out = new Map<string, ServerLocation | null>();
  const unique = [...new Set(hosts.filter(isIp))];
  const now = Date.now();
  const missing: string[] = [];

  for (const host of unique) {
    const hit = cache.get(host);
    if (hit && hit.expires > now) {
      out.set(host, hit.location);
    } else {
      missing.push(host);
    }
  }

  // Cap lookups per request to stay polite with the free API.
  const batch = missing.slice(0, 40);
  await Promise.all(
    batch.map(async (host) => {
      try {
        const res = await fetch(`https://ipwho.is/${host}`, {
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
          country?: string;
        };
        const location =
          data.success !== false && data.country_code
            ? {
                countryCode: data.country_code,
                region: data.region || data.country || undefined,
              }
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

export async function attachGeo<T extends { host: string; location: ServerLocation | null }>(
  servers: T[]
): Promise<T[]> {
  const need = servers.filter((s) => !s.location).map((s) => s.host);
  if (need.length === 0) return servers;
  const map = await lookupLocations(need);
  return servers.map((s) => {
    if (s.location) return s;
    return { ...s, location: map.get(s.host) ?? null };
  });
}

/** Map a free-form country name to a display location. */
export function locationFromCountryName(name: string | null | undefined): ServerLocation | null {
  if (!name?.trim()) return null;
  const trimmed = name.trim();
  if (/^[A-Z]{2}$/i.test(trimmed)) {
    return { countryCode: trimmed.toUpperCase() };
  }
  return { countryCode: trimmed.slice(0, 3).toUpperCase(), region: trimmed };
}
