import { describe, it, expect } from "vitest";
import {
  findOrphanedAdapters,
  getMultiplayerAdapter,
  MULTIPLAYER_ADAPTERS,
} from "./adapters";
import {
  canSelfHost,
  canUseCouch,
  canUseDedicated,
  couchPayloadFromDoc,
  defaultHostMode,
  findHostModeConfigProblems,
  hostModeOptions,
  hostModesFor,
  isValidHostMode,
  publicLobbyPortFor,
  resolvedHostMode,
} from "./hostModes";

describe("host mode configuration", () => {
  /*
   * The regression guard. A game typed `managed-server` that is not in
   * HOSTABLE_GAMES has no dedicated server to run and is not peer-hosted
   * either, so it resolves to no multiplayer at all — and nothing in the UI
   * distinguishes that from a single-player game.
   *
   * GoldenEye: Source and Mr. Boom both shipped in that state, Mr. Boom while
   * its own notes said no dedicated server existed. Failing the build is the
   * only thing that reliably catches it.
   */
  it("has no adapter that resolves to zero host modes by misconfiguration", () => {
    const problems = findHostModeConfigProblems();
    const readable = problems.map((p) => `${p.gameSlug}: ${p.problem}`).join("\n");
    expect(readable).toBe("");
  });

  it("offers both modes only when the game really supports both", () => {
    // Warzone 2100 is the case that motivated the picker: a VPS dedicated
    // server, a client that can also host, and a public master list.
    expect(hostModesFor("warzone-2100")).toEqual(["public", "self", "dedicated"]);
    expect(canSelfHost("warzone-2100")).toBe(true);
    expect(canUseDedicated("warzone-2100")).toBe(true);
  });

  it("treats a peer-hosted game as self-hostable without extra configuration", () => {
    // Marathon 2 has no dedicated server; peer hosting is
    // the only way it works, so it must not require a verification entry.
    expect(hostModesFor("marathon-2")).toEqual(["self"]);
    expect(canUseDedicated("marathon-2")).toBe(false);
  });

  it("gives a VPS-only game just the dedicated mode", () => {
    // YSoccer runs a KryoNet dedicated server and its client only connects.
    expect(hostModesFor("ysoccer")).toEqual(["dedicated"]);
    expect(canSelfHost("ysoccer")).toBe(false);
  });

  it("offers nothing for a game PlayBound does not run multiplayer for", () => {
    // League of Legends uses Riot's own networking end to end.
    expect(hostModesFor("league-of-legends")).toEqual([]);
    expect(defaultHostMode("league-of-legends")).toBeNull();
    expect(hostModeOptions("league-of-legends")).toEqual([]);
  });

  it("prefers a public dedicated server when the game has a live list", () => {
    expect(defaultHostMode("warzone-2100")).toBe("public");
    expect(defaultHostMode("openra")).toBe("public");
    expect(defaultHostMode("marathon-2")).toBe("self");
    expect(defaultHostMode("ysoccer")).toBe("dedicated");
  });

  it("rejects a mode the game does not support", () => {
    expect(isValidHostMode("ysoccer", "self")).toBe(false);
    expect(isValidHostMode("warzone-2100", "self")).toBe(true);
    // Untrusted input reaches this from the party API.
    expect(isValidHostMode("warzone-2100", "nonsense")).toBe(false);
    expect(isValidHostMode("warzone-2100", null)).toBe(false);
    expect(isValidHostMode("warzone-2100", 42)).toBe(false);
  });

  it("only offers a picker when there is a real choice", () => {
    // One option is not a choice; the UI hides the control in that case.
    expect(hostModeOptions("ysoccer").length).toBe(1);
    expect(hostModeOptions("warzone-2100").length).toBe(3);
  });

  it("offers public servers only when a real list exists", () => {
    expect(hostModesFor("openra")[0]).toBe("public");
    expect(hostModesFor("old-school-runescape")).toEqual(["public"]);
    // Steam concurrent count is not a server list.
    expect(hostModesFor("marathon-2")).toEqual(["self"]);
    expect(hostModesFor("league-of-legends")).toEqual([]);
  });

  it("keeps a live VPS room on dedicated when hostMode was never stored", () => {
    expect(resolvedHostMode("openra", null, { roomId: "room-1" })).toBe("dedicated");
    expect(resolvedHostMode("openra", null, {})).toBe("public");
    expect(resolvedHostMode("openra", "self", { roomId: "room-1" })).toBe("self");
  });

  it("supplies a public-lobby port for self-hostable games", () => {
    // Mr. Boom hosts through RetroArch netplay.
    expect(publicLobbyPortFor("mrboom")).toEqual({ port: 55435, protocol: "tcp" });
    /*
     * OpenTyrian 2000 does NOT go through RetroArch — it has its own built-in
     * peer-to-peer netplay. Per the engine's own --help, `-p/--net-port=PORT`
     * defaults to 1333 and the transport is UDP (it uses UDP hole punching to
     * avoid needing a forwarded port at all). This previously asserted
     * RetroArch's 55435/tcp, which the adapter has never claimed.
     */
    expect(publicLobbyPortFor("opentyrian-2000")).toEqual({ port: 1333, protocol: "udp" });
    // GoldenEye: Source is a Source sourcemod on the engine's default port.
    expect(publicLobbyPortFor("goldeneye-source")).toEqual({ port: 27015, protocol: "udp" });
  });

  it("derives the public-lobby port from the game-host catalog when undeclared", () => {
    // Not duplicated per adapter: a game listens on the same port whether the
    // VPS runs it or a player does.
    expect(publicLobbyPortFor("warzone-2100")).toEqual({ port: 2100, protocol: "both" });
  });

  it("has no port for a game that cannot be self-hosted at all", () => {
    expect(publicLobbyPortFor("league-of-legends")).toBeNull();
  });

  /*
   * 0 A.D. is published as `0ad` but HOSTABLE_GAMES and the agent both call it
   * `0-ad`. It used to carry two byte-identical adapter entries; now one entry
   * plus an alias. Both spellings still have to resolve identically, because
   * which one a call site uses is not something the caller thinks about.
   */
  it("resolves both spellings of 0 A.D. to the same configuration", () => {
    expect(getMultiplayerAdapter("0ad").adapterType).toBe("managed-server");
    expect(getMultiplayerAdapter("0-ad").adapterType).toBe("managed-server");
    expect(getMultiplayerAdapter("0-ad").gameSlug).toBe(getMultiplayerAdapter("0ad").gameSlug);
    expect(hostModesFor("0ad")).toEqual(hostModesFor("0-ad"));
  });

  it("still falls back to `official` for a genuinely unknown game", () => {
    // The alias lookup must not turn an unknown slug into a match.
    expect(getMultiplayerAdapter("not-a-real-game").adapterType).toBe("official");
  });
});

describe("orphaned adapters", () => {
  /*
   * Deliberately not pinned to a specific game. This first asserted on
   * "openlara" — the case that prompted the check, after it became the engine
   * behind Tomb Raider 1+2+3 — and broke the moment that adapter was cleaned
   * up, which is the wrong reason for a test to fail. Any real adapter absent
   * from the catalog should report.
   */
  it("reports an adapter whose game left the catalog", () => {
    const live = ["warzone-2100", "freedoom"];
    const orphans = findOrphanedAdapters(live);
    expect(orphans).toContain("mrboom");
    expect(orphans).not.toContain("warzone-2100");
    expect(orphans).not.toContain("freedoom");
  });

  it("does not report deliberate aliases or folded-in editions", () => {
    const orphans = findOrphanedAdapters(["warzone-2100"]);
    for (const expected of ["0-ad", "marathon", "alephone", "aleph-one", "keeperfx", "tes3mp"]) {
      expect(orphans).not.toContain(expected);
    }
  });

  it("reports nothing when every adapter names a live game", () => {
    const live = Object.keys(MULTIPLAYER_ADAPTERS);
    expect(findOrphanedAdapters(live)).toEqual([]);
  });

  it("is case-insensitive about catalog slugs", () => {
    expect(findOrphanedAdapters(["WARZONE-2100"])).not.toContain("warzone-2100");
  });
});

describe("couch mode", () => {
  /*
   * Streets of Rage Remake is a 2011 Bennu game with no network code at all:
   * two players share one keyboard and two pads. Before couch mode existed it
   * had no host modes, so hostModeOptions returned an empty list and a party
   * formed around it could do nothing.
   */
  it("gives a game with no networking somewhere to play", () => {
    expect(canUseCouch("streets-of-rage-remake")).toBe(true);
    expect(hostModesFor("streets-of-rage-remake")).toEqual(["couch"]);
    expect(defaultHostMode("streets-of-rage-remake")).toBe("couch");
  });

  it("is the only option, so the picker stays hidden", () => {
    const available = hostModeOptions("streets-of-rage-remake").filter((o) => o.available);
    expect(available.map((o) => o.mode)).toEqual(["couch"]);
  });

  it("is not offered to games that actually have online play", () => {
    expect(canUseCouch("openra")).toBe(false);
    expect(hostModesFor("openra")).not.toContain("couch");
  });

  it("survives a round trip through the party document", () => {
    expect(isValidHostMode("streets-of-rage-remake", "couch")).toBe(true);
    expect(resolvedHostMode("streets-of-rage-remake", "couch", null)).toBe("couch");
    // A party created before couch mode stored null and must still resolve.
    expect(resolvedHostMode("streets-of-rage-remake", null, null)).toBe("couch");
  });

  it("rejects a mode the game does not have", () => {
    expect(isValidHostMode("streets-of-rage-remake", "dedicated")).toBe(false);
    expect(isValidHostMode("openra", "couch")).toBe(false);
  });

  it("enables the payload only for a couch party, and carries the code", () => {
    const ready = couchPayloadFromDoc("streets-of-rage-remake", "couch", {
      status: "ready",
      joinCode: "AB3D",
      joinUrl: "https://playbound.club/controller/AB3D",
    });
    expect(ready.enabled).toBe(true);
    expect(ready.joinCode).toBe("AB3D");

    // An online game must never render the controller panel, even if a stale
    // couch document is sitting on the party.
    const online = couchPayloadFromDoc("openra", "dedicated", {
      status: "ready",
      joinCode: "AB3D",
    });
    expect(online.enabled).toBe(false);
    expect(online.joinCode).toBeNull();
  });
});
