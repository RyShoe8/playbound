import { describe, it, expect } from "vitest";
import {
  offerTypeLabel,
  claimCtaLabel,
  expirationLabel,
  dateRangeLabel,
  storeDisplayName,
  storeShortName,
  storeColor,
} from "./labels";

describe("freeOffers labels", () => {
  it("formats store display names and short names", () => {
    expect(storeDisplayName("epic")).toBe("Epic Games Store");
    expect(storeDisplayName("steam")).toBe("Steam");
    expect(storeDisplayName("gog")).toBe("GOG");
    expect(storeDisplayName("prime_gaming")).toBe("Amazon Prime Gaming");

    expect(storeShortName("epic")).toBe("Epic");
    expect(storeShortName("steam")).toBe("Steam");
    expect(storeShortName("gog")).toBe("GOG");
    expect(storeShortName("prime_gaming")).toBe("Prime Gaming");
  });

  it("formats offer type labels accurately", () => {
    expect(offerTypeLabel("free_to_keep")).toBe("FREE TO KEEP");
    expect(offerTypeLabel("free_weekend")).toBe("FREE THIS WEEKEND");
    expect(offerTypeLabel("free_trial")).toBe("FREE TRIAL");
    expect(offerTypeLabel("free_with_subscription", "prime_gaming")).toBe("FREE WITH PRIME");
    expect(offerTypeLabel("free_with_subscription")).toBe("FREE WITH SUBSCRIPTION");
  });

  it("formats store claim CTAs", () => {
    expect(claimCtaLabel("epic")).toBe("Claim on Epic");
    expect(claimCtaLabel("steam")).toBe("Get on Steam");
    expect(claimCtaLabel("gog")).toBe("Claim on GOG");
    expect(claimCtaLabel("prime_gaming")).toBe("Claim with Prime");
  });

  it("handles expiration labels correctly", () => {
    expect(expirationLabel(null)).toBeNull();

    // In the past
    const past = new Date(Date.now() - 3600 * 1000);
    expect(expirationLabel(past)).toBeNull();

    // In 30 minutes
    const in30Mins = new Date(Date.now() + 30 * 60 * 1000);
    expect(expirationLabel(in30Mins)).toMatch(/minute/);

    // In 5 hours
    const in5Hours = new Date(Date.now() + 5 * 3600 * 1000);
    expect(expirationLabel(in5Hours)).toBe("5 hours left");

    // In 3 days
    const in3Days = new Date(Date.now() + 3 * 24 * 3600 * 1000);
    expect(expirationLabel(in3Days)).toMatch(/^Ends /);

    // In 10 days
    const in10Days = new Date(Date.now() + 10 * 24 * 3600 * 1000);
    expect(expirationLabel(in10Days)).toBe("10 days left");
  });

  it("formats date ranges", () => {
    const s = new Date("2026-08-13T12:00:00Z");
    const e = new Date("2026-08-20T12:00:00Z");
    expect(dateRangeLabel(s, e)).toBe("August 13–20, 2026");

    const diffMonth = new Date("2026-09-01T12:00:00Z");
    expect(dateRangeLabel(s, diffMonth)).toContain("August 13, 2026");
    expect(dateRangeLabel(s, diffMonth)).toContain("September 1, 2026");
  });

  it("returns distinct store colors", () => {
    const epicCol = storeColor("epic");
    const steamCol = storeColor("steam");
    expect(epicCol).toBeDefined();
    expect(steamCol).toBeDefined();
    expect(epicCol).not.toBe(steamCol);
  });
});
