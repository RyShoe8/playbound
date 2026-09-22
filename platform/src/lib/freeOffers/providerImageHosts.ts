import type { StoreSlug } from "./types";

/**
 * Every image host a free-offer provider can put in `coverImage`.
 *
 * This exists because a missing host is not a soft failure. `next/image`
 * validates against `images.remotePatterns` in next.config.ts and answers an
 * unlisted host with **400 INVALID_IMAGE_OPTIMIZE_REQUEST** — the card falls
 * back to its gradient placeholder and the offer looks broken, while the
 * provider, the ingestion and the stored document are all perfectly fine.
 *
 * Prime Gaming and Alienware Arena shipped that way: both returned a usable
 * `coverImage` for every live offer and both rendered blank, because adding a
 * provider and allowlisting its CDN are two separate edits in two separate
 * files and nothing connected them.
 *
 * `providerImageHosts.test.ts` is that connection. Add a provider, add its
 * host here, and the test tells you if next.config.ts has not caught up.
 *
 * Hosts are recorded from observed live responses, not from the providers'
 * documentation — a store is free to serve art from anywhere.
 */
export const PROVIDER_IMAGE_HOSTS: Readonly<Record<StoreSlug, readonly string[]>> = {
  // Epic's catalog images, plus the Unreal CDN some older promos still use.
  epic: ["cdn1.epicgames.com", "cdn2.unrealengine.com"],
  // Steam serves store art from the Akamai and Cloudflare mirrors.
  steam: ["shared.akamai.steamstatic.com", "cdn.cloudflare.steamstatic.com"],
  gog: ["images.gog-statics.com"],
  // Amazon's media CDN, e.g. /images/I/<id>._FMwebp_.jpg — note the `.jpg`
  // extension on what is actually a WebP payload.
  prime_gaming: ["m.media-amazon.com"],
  // /media/<hash>.jpg?fit=crop&width=…&height=…&quality=… — the query string
  // matters, because it is what makes these URLs look unoptimizable at a glance
  // while still being matched by FreeGameCard's `(\?|$)` extension test.
  alienware_arena: ["media.alienwarearena.com"],
};

/** Flat, de-duplicated list of every provider image host. */
export function allProviderImageHosts(): string[] {
  return [...new Set(Object.values(PROVIDER_IMAGE_HOSTS).flat())].sort();
}
