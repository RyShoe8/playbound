import { describe, expect, it } from "vitest";
import { allowedSlotSizes, higherHostingTiers, inheritTierGames, lowerHostingTiers, type HostingTier, type TierGame } from "./tier";

const profile: TierGame = {
  profileKey: "openra:combined-arms", enabled: true,
  newServerCreationEnabled: false, existingServerStartEnabled: false,
  supportedRegions: ["us-east"], allowedMods: [],
};
const lower = { games: [], maxSlotsSold: 32, regions: [{ key: "us-central" }] } as unknown as HostingTier;

describe("hosting tier inheritance", () => {
  it("cascades Extreme to Pro and Basic, and Pro to Basic", () => {
    expect(lowerHostingTiers("extreme")).toEqual(["pro", "basic"]);
    expect(lowerHostingTiers("pro")).toEqual(["basic"]);
    expect(higherHostingTiers("basic")).toEqual(["pro", "extreme"]);
  });

  it("adds selected editions without overriding lower-tier settings", () => {
    const inherited = inheritTierGames(lower, [profile]);
    expect(inherited).toMatchObject([{ profileKey: profile.profileKey, enabled: true, supportedRegions: ["us-central"] }]);
    const custom = { ...profile, enabled: false, adminNote: "Basic limit" };
    expect(inheritTierGames({ ...lower, games: [custom] }, [profile])).toEqual([{ ...custom, enabled: true }]);
  });

  it("does not inherit unselected profiles", () => {
    expect(inheritTierGames(lower, [{ ...profile, enabled: false }])).toEqual([]);
  });

  it("uses purchased slots and the catalog cap, ignoring old per-game limits", () => {
    const tier = { ...lower, allocationIncrement: 4, minAllocation: 4 };
    const oldProfile = { ...profile, minSlots: 4, maxSlots: 8, slotIncrement: 4 };
    expect(allowedSlotSizes(tier, oldProfile, 12, 10)).toEqual(Array.from({ length: 10 }, (_, i) => i + 1));
    expect(allowedSlotSizes(tier, oldProfile, 12, null)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    expect(allowedSlotSizes(tier, oldProfile, 4, 10)).toEqual([1, 2, 3, 4]);
  });
});
