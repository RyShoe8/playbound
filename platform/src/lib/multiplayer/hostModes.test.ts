import { describe, it, expect } from "vitest";
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
});
