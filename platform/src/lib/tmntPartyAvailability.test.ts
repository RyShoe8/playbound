import { describe, it, expect } from "vitest";
import { games } from "@/lib/data/games";
import { partyMaxPlayersBySlug } from "@/lib/data/partyMaxPlayers";
import { supportsMultiplayer, supportsLauncherParty } from "@/lib/multiplayer/support";
import { fitsPartySize } from "@/lib/playTogether/partyPlatforms";
import { canUseCouch, couchOnlyGameSlugs } from "@/lib/multiplayer/hostModes";
import { MULTIPLAYER_ADAPTERS } from "@/lib/multiplayer/adapters";

describe("Teenage Mutant Ninja Turtles party availability", () => {
  const tmnt = games.find((g) => g.slug === "tmnt-rescue-palooza");

  it("is present in the games catalog with published status and maxPlayers = 4", () => {
    expect(tmnt).toBeDefined();
    expect(tmnt?.title).toBe("Teenage Mutant Ninja Turtles: Rescue-Palooza!");
    expect(tmnt?.status).toBe("published");
    expect(tmnt?.maxPlayers).toBe(4);
  });

  it("includes searchable aliases for Ninja Turtles, TMNT, and full name", () => {
    expect(tmnt?.aliases).toContain("Ninja Turtles");
    expect(tmnt?.aliases).toContain("Teenage Mutant Ninja Turtles");
    expect(tmnt?.aliases).toContain("TMNT");
    expect(tmnt?.aliases).toContain("TMNT: Rescue-Palooza!");
  });

  it("is configured in partyMaxPlayersBySlug with 4 seats", () => {
    expect(partyMaxPlayersBySlug["tmnt-rescue-palooza"]).toBe(4);
  });

  it("satisfies party multiplayer and launcher party requirements", () => {
    expect(supportsMultiplayer(tmnt)).toBe(true);
    expect(supportsLauncherParty(tmnt)).toBe(true);
  });

  it("supports parties from 1 to 4 players, but rejects parties of 5+", () => {
    expect(fitsPartySize(tmnt?.maxPlayers, 1)).toBe(true);
    expect(fitsPartySize(tmnt?.maxPlayers, 2)).toBe(true);
    expect(fitsPartySize(tmnt?.maxPlayers, 3)).toBe(true);
    expect(fitsPartySize(tmnt?.maxPlayers, 4)).toBe(true);
    expect(fitsPartySize(tmnt?.maxPlayers, 5)).toBe(false);
  });

  it("supports couch mode with remote controller joining", () => {
    expect(couchOnlyGameSlugs()).toContain("tmnt-rescue-palooza");
    expect(canUseCouch("tmnt-rescue-palooza")).toBe(true);
  });

  it("has a registered multiplayer adapter matching canonical title", () => {
    const adapter = MULTIPLAYER_ADAPTERS["tmnt-rescue-palooza"];
    expect(adapter).toBeDefined();
    expect(adapter.title).toBe("Teenage Mutant Ninja Turtles: Rescue-Palooza!");
    expect(adapter.adapterType).toBe("official");
  });
});
