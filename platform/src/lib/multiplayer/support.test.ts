import { describe, it, expect } from "vitest";
import { supportsMultiplayer, supportsLauncherParty, hasServerBrowser } from "./support";

describe("supportsMultiplayer", () => {
  it("counts the play modes that used to be missed", () => {
    // Each of these was multiplayer to some call sites and not others before
    // the rules were consolidated.
    for (const marker of [
      "Co-op",
      "Cooperative",
      "Hotseat",
      "Hot Seat",
      "LAN support",
      "Split-Screen",
      "Split Screen",
      "splitscreen",
      "Team Play",
      "Cross-Play",
      "Dedicated Servers",
      "MMO",
      "MMORPG",
      "PvP",
      "Deathmatch",
      "Multiplayer",
      "Multi-Player",
    ]) {
      expect(supportsMultiplayer({ tags: [marker] }), `${marker} should count`).toBe(true);
    }
  });

  it("reads tags as well as features", () => {
    // Hotseat, LAN and split-screen are not in gamePayload.FEATURES at all, so
    // a features-only rule would miss exactly what this exists to catch.
    expect(supportsMultiplayer({ features: [], tags: ["Hotseat"] })).toBe(true);
    expect(supportsMultiplayer({ features: ["Co-op"], tags: [] })).toBe(true);
  });

  it("treats a server browser as multiplayer whatever the features say", () => {
    expect(supportsMultiplayer({ features: ["Singleplayer"], launchMethods: ["server"] })).toBe(true);
    expect(hasServerBrowser({ launchMethods: ["server"] })).toBe(true);
    expect(hasServerBrowser({ launchMethods: ["install"] })).toBe(false);
  });

  it("does not fire on words that merely contain a marker", () => {
    /*
     * The reason the markers are anchored patterns rather than substrings. A
     * bare "lan" matches all of these, and every one is a plausible tag.
     */
    for (const innocent of ["Island", "Planet", "Highlander", "Milan", "Atlantis", "Plane"]) {
      expect(supportsMultiplayer({ tags: [innocent] }), `${innocent} must not count`).toBe(false);
    }
  });

  it("says no for a singleplayer game", () => {
    expect(supportsMultiplayer({ features: ["Singleplayer"], tags: ["Story Rich", "Roguelike"] })).toBe(
      false
    );
    expect(supportsMultiplayer({})).toBe(false);
    expect(supportsMultiplayer(null)).toBe(false);
  });

  it("lets an explicit flag overrule the markers in both directions", () => {
    // How a curator says "no" about a game whose tags read as yes.
    expect(supportsMultiplayer({ multiplayer: false, tags: ["Co-op"] })).toBe(false);
    expect(supportsMultiplayer({ multiplayer: true, tags: ["Story Rich"] })).toBe(true);
  });
});

describe("supportsLauncherParty", () => {
  const installable = { enabled: true, kind: "github-zip" };

  it("needs multiplayer and an installable recipe", () => {
    expect(supportsLauncherParty({ tags: ["Co-op"], launcherInstall: installable })).toBe(true);
  });

  it("excludes a browser game even though it is genuinely multiplayer", () => {
    // The launcher never starts the process, so there is nothing for a party
    // to coordinate and party health for it would measure nothing.
    const browserMmo = { tags: ["MMO"], launcherInstall: { enabled: true, kind: "external" } };
    expect(supportsMultiplayer(browserMmo)).toBe(true);
    expect(supportsLauncherParty(browserMmo)).toBe(false);
  });

  it("excludes a singleplayer game and a disabled recipe", () => {
    expect(supportsLauncherParty({ tags: ["Story Rich"], launcherInstall: installable })).toBe(false);
    expect(
      supportsLauncherParty({ tags: ["Co-op"], launcherInstall: { enabled: false, kind: "github-zip" } })
    ).toBe(false);
    expect(supportsLauncherParty({ tags: ["Co-op"] })).toBe(false);
  });

  it("is never broader than supportsMultiplayer", () => {
    const cases = [
      { tags: ["Co-op"], launcherInstall: installable },
      { tags: ["MMO"], launcherInstall: { enabled: true, kind: "external" } },
      { tags: ["Story Rich"], launcherInstall: installable },
      { launchMethods: ["server"], launcherInstall: installable },
      {},
    ];
    for (const c of cases) {
      if (supportsLauncherParty(c)) expect(supportsMultiplayer(c)).toBe(true);
    }
  });
});

describe("the call sites that used to disagree", () => {
  it("gives the party picker and the join check the same answer", () => {
    /*
     * PartyView filtered with the launcherInstall rule while joinCapability
     * gated with the playTogether one, so a game with a server browser and no
     * multiplayer feature was offered in the picker and then refused on join.
     * Both now resolve through this module, so one call answers for both.
     */
    const serverBrowserOnly = { features: ["Singleplayer"], tags: [], launchMethods: ["server"] };
    expect(supportsMultiplayer(serverBrowserOnly)).toBe(true);

    // And the discover filter's old substring rule said false for this one.
    const coopOnly = { features: ["Co-op"], tags: [], launchMethods: [] };
    expect(supportsMultiplayer(coopOnly)).toBe(true);
  });
});
