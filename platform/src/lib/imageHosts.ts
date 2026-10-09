/**
 * Hosts Next's image optimizer is allowed to fetch from — the same list as
 * `images.remotePatterns` in next.config.ts, which cannot be imported here
 * because this runs in client components. imageHosts.test.ts fails if the two
 * drift.
 *
 * A remote image on a host in this list should go through the optimizer
 * (resized, re-encoded, cached at the edge). Anything else must be marked
 * `unoptimized` or next/image rejects it outright. Marking everything
 * unoptimized, as CoverImage used to, served ~130 of 156 catalog covers —
 * the ones on Vercel Blob, GOG and Steam — at their full original size.
 */
export const OPTIMIZED_IMAGE_HOSTS: readonly string[] = [
  "**.public.blob.vercel-storage.com",
  "cdn.cloudflare.steamstatic.com",
  "shared.akamai.steamstatic.com",
  "steamcdn-a.akamaihd.net",
  "opengraph.githubassets.com",
  "avatars.githubusercontent.com",
  "repository-images.githubusercontent.com",
  "cdn.microlink.io",
  "cdn1.epicgames.com",
  "cdn2.unrealengine.com",
  "**.unrealengine.com",
  "images.gog-statics.com",
  "m.media-amazon.com",
  "media.alienwarearena.com",
  "**.steamstatic.com",
  "shared.fastly.steamstatic.com",
  "sttc.gamersgate.com",
  "images.greenmangaming.com",
  "store.ubisoft.com",
  "**.ubisoft.com",
  "**.cheapshark.com",
  "images.2game.com",
  "**.gog-statics.com",
];

function hostMatches(pattern: string, host: string): boolean {
  if (pattern === host) return true;
  if (pattern.startsWith("**.")) return host.endsWith(pattern.slice(2));
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(1);
    return host.endsWith(suffix) && !host.slice(0, -suffix.length).includes(".");
  }
  return false;
}

/** True when next/image may optimize this URL; false means pass `unoptimized`. */
export function canOptimizeImage(src: string | null | undefined): boolean {
  if (!src) return false;
  if (!/^https?:\/\//i.test(src)) return true; // local or relative asset
  try {
    const { protocol, hostname } = new URL(src);
    if (protocol !== "https:") return false;
    return OPTIMIZED_IMAGE_HOSTS.some((pattern) => hostMatches(pattern, hostname));
  } catch {
    return false;
  }
}
