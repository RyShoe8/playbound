import { describe, expect, it } from "vitest";
import {
  mediaUrlFingerprint,
  mergeUniqueMediaUrls,
  normalizeMediaSourceUrl,
} from "@/lib/mediaDedupe";

describe("mediaUrlFingerprint", () => {
  it("collapses Steam CDN variants to app+file", () => {
    const a =
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/440/ss_abc.jpg?t=1";
    const b =
      "https://cdn.cloudflare.steamstatic.com/steam/apps/440/ss_abc.jpg?utm_source=x";
    expect(mediaUrlFingerprint(a)).toBe(mediaUrlFingerprint(b));
    expect(mediaUrlFingerprint(a)).toBe("steam:440:ss_abc.jpg");
  });

  it("keys deterministic blob paths by kind+hash", () => {
    const url =
      "https://abc.public.blob.vercel-storage.com/games/openra/shot-0123456789abcdef.webp";
    expect(mediaUrlFingerprint(url)).toBe("blob:shot:0123456789abcdef");
  });

  it("keeps legacy timestamped blobs unique by path", () => {
    const a =
      "https://abc.public.blob.vercel-storage.com/games/openra/shot0-1111111111111-abc12.webp";
    const b =
      "https://abc.public.blob.vercel-storage.com/games/openra/shot0-2222222222222-def34.webp";
    expect(mediaUrlFingerprint(a)).not.toBe(mediaUrlFingerprint(b));
  });
});

describe("normalizeMediaSourceUrl", () => {
  it("upgrades http and strips tracking", () => {
    expect(
      normalizeMediaSourceUrl("http://example.com/img.png?utm_source=x&utm_campaign=y")
    ).toBe("https://example.com/img.png");
  });
});

describe("mergeUniqueMediaUrls", () => {
  it("preserves existing order and skips fingerprint duplicates", () => {
    const existing = [
      "https://cdn.cloudflare.steamstatic.com/steam/apps/440/ss_one.jpg",
      "https://cdn.cloudflare.steamstatic.com/steam/apps/440/ss_two.jpg",
    ];
    const incoming = [
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/440/ss_one.jpg?t=9",
      "https://cdn.cloudflare.steamstatic.com/steam/apps/440/ss_three.jpg",
    ];
    expect(mergeUniqueMediaUrls(existing, incoming, 20)).toEqual([
      existing[0],
      existing[1],
      incoming[1],
    ]);
  });

  it("clamps to max", () => {
    expect(mergeUniqueMediaUrls(["a", "b"], ["c", "d"], 3)).toEqual(["a", "b", "c"]);
  });
});
