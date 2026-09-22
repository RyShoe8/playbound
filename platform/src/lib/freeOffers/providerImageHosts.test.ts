import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config";
import { STORE_SLUGS } from "./types";
import { PROVIDER_IMAGE_HOSTS, allProviderImageHosts } from "./providerImageHosts";

/**
 * Free-offer cover images must survive next/image.
 *
 * The bug this guards: Prime Gaming and Alienware Arena were added as providers,
 * returned a `coverImage` for every single live offer, stored them correctly —
 * and rendered nothing, because `images.remotePatterns` in next.config.ts had
 * never learned their CDNs. next/image answers an unlisted host with 400
 * INVALID_IMAGE_OPTIMIZE_REQUEST, so 31 of 36 live offers showed a gradient
 * placeholder while every layer anyone would think to debug looked healthy.
 *
 * Allowlisting a CDN is a different file from adding a provider, which is why it
 * was missed. This test is the only thing that connects them.
 */

/** `{ hostname: "**.example.com" }` patterns match subdomains, so honour them. */
function patternMatches(pattern: string, host: string): boolean {
  if (pattern === host) return true;
  if (pattern.startsWith("**.")) {
    const suffix = pattern.slice(2); // keep the leading dot
    return host.endsWith(suffix);
  }
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(1);
    // A single star is one label only: *.a.com matches b.a.com, not c.b.a.com.
    return host.endsWith(suffix) && host.slice(0, -suffix.length).includes(".") === false;
  }
  return false;
}

const remoteHostnames = (nextConfig.images?.remotePatterns ?? [])
  .map((p) => (typeof p === "string" ? p : p.hostname))
  .filter((h): h is string => typeof h === "string" && h.length > 0);

describe("free-offer provider image hosts", () => {
  it("has an entry for every store slug", () => {
    // A provider with no recorded host would pass the coverage test below by
    // being invisible to it, which is the one way this guard can rot.
    expect(Object.keys(PROVIDER_IMAGE_HOSTS).sort()).toEqual([...STORE_SLUGS].sort());
  });

  it("records at least one host per provider", () => {
    for (const [store, hosts] of Object.entries(PROVIDER_IMAGE_HOSTS)) {
      expect(hosts.length, `${store} has no recorded image host`).toBeGreaterThan(0);
    }
  });

  it("allowlists every provider image host in next.config remotePatterns", () => {
    const missing: string[] = [];
    for (const [store, hosts] of Object.entries(PROVIDER_IMAGE_HOSTS)) {
      for (const host of hosts) {
        if (!remoteHostnames.some((pattern) => patternMatches(pattern, host))) {
          missing.push(`${store} → ${host}`);
        }
      }
    }
    expect(
      missing,
      `these provider image hosts are not in next.config.ts images.remotePatterns, so ` +
        `next/image will answer 400 and their cards will render blank:\n  ${missing.join("\n  ")}`
    ).toEqual([]);
  });

  it("matches subdomain wildcards but not unrelated hosts", () => {
    // Pins the matcher itself — a matcher that returned true too easily would
    // make the assertion above pass while production still 400s.
    expect(patternMatches("**.unrealengine.com", "cdn2.unrealengine.com")).toBe(true);
    expect(patternMatches("m.media-amazon.com", "m.media-amazon.com")).toBe(true);
    expect(patternMatches("m.media-amazon.com", "evil-m.media-amazon.com")).toBe(false);
    expect(patternMatches("**.unrealengine.com", "unrealengine.com.attacker.net")).toBe(false);
    expect(patternMatches("images.gog-statics.com", "media.alienwarearena.com")).toBe(false);
  });

  it("exposes a flat de-duplicated host list", () => {
    const flat = allProviderImageHosts();
    expect(new Set(flat).size).toBe(flat.length);
    expect(flat).toContain("m.media-amazon.com");
    expect(flat).toContain("media.alienwarearena.com");
  });
});
