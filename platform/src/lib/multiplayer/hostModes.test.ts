import { describe, it, expect } from "vitest";
import {
  findOrphanedAdapters,
  getMultiplayerAdapter,
  MULTIPLAYER_ADAPTERS,
} from "./adapters";
import {
  canSelfHost,
  canUseDedicated,
  defaultHostMode,
  findHostModeConfigProblems,
  hostModeOptions,
  hostModesFor,
  isValidHostMode,
  publicLobbyPortFor,
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
    // server and a client that can also host.
    expect(hostModesFor("warzone-2100")).toEqual(["self", "dedicated"]);
    expect(canSelfHost("warzone-2100")).toBe(true);
    expect(canUseDedicated("warzone-2100")).toBe(true);
  });

  it("treats a peer-hosted game as self-hostable without extra configuration", () => {
    // Freedoom has no dedicated server and never needed one; peer hosting is
    // the only way it works, so it must not require a verification entry.
    expect(hostModesFor("freedoom")).toEqual(["self"]);
    expect(canUseDedicated("freedoom")).toBe(false);
  });

  it("gives a VPS-only game just the dedicated mode", () => {
    // YSoccer runs a KryoNet dedicated server and its client only connects.
    expect(hostModesFor("ysoccer")).toEqual(["dedicated"]);
    expect(canSelfHost("ysoccer")).toBe(false);
  });

  it("offers nothing for a game PlayBound does not run multiplayer for", () => {
    // Counter-Strike 2 uses Valve's own networking end to end.
    expect(hostModesFor("counter-strike-2")).toEqual([]);
    expect(defaultHostMode("counter-strike-2")).toBeNull();
    expect(hostModeOptions("counter-strike-2")).toEqual([]);
  });

  it("prefers self-hosting when the game supports it", () => {
    // Safe because the party overlay carries reachability; see hostModes.ts.
    expect(defaultHostMode("warzone-2100")).toBe("self");
    expect(defaultHostMode("freedoom")).toBe("self");
    // Falls back rather than returning nothing when only the VPS can host.
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
    expect(hostModeOptions("freedoom").length).toBe(1);
    expect(hostModeOptions("warzone-2100").length).toBe(2);
  });

  it("supplies a public-lobby port for self-hostable games", () => {
    // Mr. Boom and OpenTyrian both host through RetroArch netplay.
    expect(publicLobbyPortFor("mrboom")).toEqual({ port: 55435, protocol: "tcp" });
    expect(publicLobbyPortFor("opentyrian-2000")).toEqual({ port: 55435, protocol: "tcp" });
    // GoldenEye: Source is a Source sourcemod on the engine's default port.
    expect(publicLobbyPortFor("goldeneye-source")).toEqual({ port: 27015, protocol: "udp" });
  });

  it("derives the public-lobby port from the game-host catalog when undeclared", () => {
    // Not duplicated per adapter: a game listens on the same port whether the
    // VPS runs it or a player does.
    expect(publicLobbyPortFor("warzone-2100")).toEqual({ port: 2100, protocol: "both" });
  });

  it("has no port for a game that cannot be self-hosted at all", () => {
    expect(publicLobbyPortFor("counter-strike-2")).toBeNull();
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
  it("reports an adapter whose game left the catalog", () => {
    // OpenLara became the engine behind Tomb Raider 1+2+3 and lost its own
    // catalog entry; its adapter stayed behind reading as live config.
    const live = ["warzone-2100", "freedoom"];
    expect(findOrphanedAdapters(live)).toContain("openlara");
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
