import { describe, expect, it } from "vitest";
import { MULTIPLAYER_ADAPTERS } from "@/lib/multiplayer/adapters";
import { PARTY_ADAPTER_SLUGS } from "@/lib/multiplayer/partyAdapterSlugs";
import { supportsOnlineMultiplayer } from "@/lib/multiplayer/support";

describe("party adapter slugs", () => {
  it("mirrors every non-official adapter", () => {
    const expected = Object.entries(MULTIPLAYER_ADAPTERS)
      .filter(([, a]) => a.adapterType !== "official")
      .map(([slug]) => slug)
      .sort();
    expect([...PARTY_ADAPTER_SLUGS].sort()).toEqual(expected);
  });

  it("offers a party for a virtual-LAN game whose tags never say online", () => {
    expect(supportsOnlineMultiplayer({ slug: "opentyrian-2000", features: ["Singleplayer"], tags: [] })).toBe(true);
  });

  it("still lets an explicit multiplayer: false win", () => {
    expect(supportsOnlineMultiplayer({ slug: "opentyrian-2000", multiplayer: false })).toBe(false);
  });
});
