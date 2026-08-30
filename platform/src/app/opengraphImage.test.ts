import { describe, it, expect } from "vitest";
import { coverImageUrl } from "./opengraph-image";

/**
 * Which artwork reaches the share card.
 *
 * The renderer behind ImageResponse handles PNG, JPEG and GIF but not WebP —
 * and it does not fail on one, it logs "Unsupported image type" and draws
 * nothing. So the failure mode is a share card that silently loses its
 * artwork, on the one surface nobody looks at while working on the site.
 * Nearly every catalog cover is .webp, which is why these go through Next's
 * image optimiser rather than being used directly.
 */

const SITE = "https://playbound.club";
const optimised = (p: string) => `${SITE}/_next/image?url=${encodeURIComponent(p)}&w=1200&q=75`;

describe("share-card cover art", () => {
  it("routes a webp cover through the optimiser, which transcodes it", () => {
    // Used directly this renders nothing at all.
    expect(coverImageUrl("/games/0ad/cover.webp", SITE)).toBe(optimised("/games/0ad/cover.webp"));
  });

  it("routes every site-relative cover the same way, not just webp", () => {
    // One path rather than a format check: the optimiser also sizes the image
    // down to the card, and a branch here would be a second thing to keep true.
    expect(coverImageUrl("/games/x/cover.png", SITE)).toBe(optimised("/games/x/cover.png"));
    expect(coverImageUrl("/games/x/cover.jpg", SITE)).toBe(optimised("/games/x/cover.jpg"));
  });

  it("encodes the path so a query cannot be injected into the optimiser URL", () => {
    const url = coverImageUrl("/games/x/a b.webp", SITE);
    expect(url).toContain("url=%2Fgames%2Fx%2Fa%20b.webp");
    expect(url).not.toContain(" ");
  });

  it("uses a remote cover directly when the renderer can decode it", () => {
    const remote = "https://blob.example.com/covers/x.jpg";
    expect(coverImageUrl(remote, SITE)).toBe(remote);
  });

  it("drops a remote cover it cannot decode rather than guessing", () => {
    // The optimiser only accepts hosts listed in next.config, so sending an
    // arbitrary one through it would 400 and lose the image entirely.
    expect(coverImageUrl("https://blob.example.com/covers/x.webp", SITE)).toBeNull();
    expect(coverImageUrl("https://blob.example.com/covers/x.avif", SITE)).toBeNull();
  });

  it("returns null for nothing usable, so the game's gradient shows", () => {
    // Not a failure — the per-game gradient is a real design, not an error.
    for (const bad of [null, undefined, "", "   ", "cover.webp", "data:image/png;base64,xx"]) {
      expect(coverImageUrl(bad, SITE)).toBeNull();
    }
  });
});
