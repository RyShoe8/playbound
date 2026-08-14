import { describe, it, expect } from "vitest";
import { getProvider, getAllProviders } from "./providers";
import { buildPrimeGamingOffer } from "./providers/primeGaming";

describe("freeOffers providers", () => {
  it("registers adapters for all 4 stores", () => {
    const epic = getProvider("epic");
    const steam = getProvider("steam");
    const gog = getProvider("gog");
    const prime = getProvider("prime_gaming");

    expect(epic.store).toBe("epic");
    expect(steam.store).toBe("steam");
    expect(gog.store).toBe("gog");
    expect(prime.store).toBe("prime_gaming");

    const all = getAllProviders();
    expect(all).toHaveLength(4);
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
});
