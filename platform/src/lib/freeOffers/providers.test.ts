import { describe, it, expect } from "vitest";
import { getProvider, getAllProviders } from "./providers";
import {
  buildPrimeGamingOffer,
  extractCsrfToken,
  cookieHeaderFrom,
} from "./providers/primeGaming";
import {
  cleanAwaTitle,
  detectRedemptionPlatform,
  looksLikeBaseGame,
} from "./providers/alienwareArena";
import { STORE_SLUGS } from "./types";

describe("freeOffers providers", () => {
  // Counting STORE_SLUGS rather than a literal: a new store that forgets to
  // register an adapter is the bug worth catching, not the count changing.
  it("registers an adapter for every store slug", () => {
    for (const slug of STORE_SLUGS) {
      expect(getProvider(slug).store).toBe(slug);
    }
    expect(getAllProviders()).toHaveLength(STORE_SLUGS.length);
  });

  it("builds valid Prime Gaming offers with proper types", () => {
    const offer = buildPrimeGamingOffer({
      title: "BioShock Remastered",
      claimUrl: "https://gaming.amazon.com/loot/bioshock",
      redemptionPlatform: "gog",
    });

    expect(offer.store).toBe("prime_gaming");
    expect(offer.offerType).toBe("free_with_subscription");
    expect(offer.redemptionPlatform).toBe("gog");
    expect(offer.externalId).toBe("prime-bioshock-remastered");
  });

  it("strips Alienware Arena giveaway boilerplate from titles", () => {
    expect(cleanAwaTitle("Frog Sqwad Steam Game Key Giveaway")).toBe("Frog Sqwad");
    expect(cleanAwaTitle("SWAPMEAT Steam Game Key Giveaway")).toBe("SWAPMEAT");
    expect(cleanAwaTitle("RIDE 6 Welcome Bikes Pack Key Giveaway")).toBe(
      "RIDE 6 Welcome Bikes Pack"
    );
  });

  it("reads the redemption store off an Alienware giveaway", () => {
    expect(detectRedemptionPlatform({ title: "Some Game Steam Key Giveaway" })).toBe("steam");
    expect(
      detectRedemptionPlatform({ title: "X", instructions: "Redeem on the Epic Games launcher" })
    ).toBe("epic");
    // Unlabelled giveaways default to Steam, which is the common case.
    expect(detectRedemptionPlatform({ title: "Mystery Key Giveaway" })).toBe("steam");
  });

  it("keeps DLC and bundle keys out of the base-game slot", () => {
    expect(looksLikeBaseGame("Frog Sqwad Steam Game Key Giveaway")).toBe(true);
    expect(looksLikeBaseGame("SurfsUp Supporter DLC Key Giveaway")).toBe(false);
    expect(looksLikeBaseGame("RIDE 6 Welcome Bikes Pack Key Giveaway")).toBe(false);
    expect(looksLikeBaseGame("Black Desert Online Reward Bundle Key Giveaway")).toBe(false);
  });

  it("pulls the anonymous CSRF token out of the Luna claims page", () => {
    const html = `<input type='hidden' name='csrf-key' value='AbC123+/=xyz'/>`;
    expect(extractCsrfToken(html)).toBe("AbC123+/=xyz");
    // A reshaped page must return null so the adapter bails instead of
    // sending a request that would 403.
    expect(extractCsrfToken("<html><body>nothing here</body></html>")).toBeNull();
  });

  it("folds Set-Cookie headers into one Cookie header, last value winning", () => {
    const header = cookieHeaderFrom([
      "session-id=130-1; Path=/; Secure",
      "ubid-main=abc; Domain=.amazon.com",
      "session-id=130-2; Path=/",
    ]);
    expect(header).toContain("ubid-main=abc");
    expect(header).toContain("session-id=130-2");
    expect(header).not.toContain("130-1");
    expect(header).not.toContain("Path=/");
  });
});
