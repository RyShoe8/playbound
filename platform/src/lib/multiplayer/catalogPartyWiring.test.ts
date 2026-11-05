import { describe, expect, it } from "vitest";
import { getMultiplayerAdapter, getVirtualLanConfig } from "./adapters";
import { couchOnlyGameSlugs, hostModesFor, resolvedHostMode } from "./hostModes";
import { COUCH_PARTY_SLUGS } from "./partyAdapterSlugs";
import { partyMaxPlayersBySlug } from "@/lib/data/partyMaxPlayers";

describe("curated online services and local co-op", () => {
  it("defaults Double Dragon to native online play and honors explicit couch parties", () => {
    expect(couchOnlyGameSlugs()).not.toContain("double-dragon-trilogy");
    expect(resolvedHostMode("double-dragon-trilogy", null)).toBeNull();
    expect(resolvedHostMode("double-dragon-trilogy", "couch")).toBe("couch");
    expect(hostModesFor("double-dragon-trilogy")).toContain("couch");
    expect(COUCH_PARTY_SLUGS.has("double-dragon-trilogy")).toBe(true);
    expect(partyMaxPlayersBySlug["double-dragon-trilogy"]).toBe(2);
    expect(getVirtualLanConfig("double-dragon-trilogy")).toBeNull();
  });

  it.each(["dragons-dogma-online", "city-of-heroes-homecoming", "planetside-2"])(
    "%s launches with in-game instructions without provisioning a server",
    (slug) => {
      const adapter = getMultiplayerAdapter(slug);
      expect(adapter.adapterType).toBe("official");
      expect(adapter.client?.inGameSteps?.length).toBeGreaterThan(0);
      expect(adapter.host).toBeUndefined();
      expect(hostModesFor(slug)).toEqual([]);
      expect(getVirtualLanConfig(slug)).toBeNull();
    },
  );
});
