import { describe, it, expect } from "vitest";
import { computePartyReadiness } from "./partyReadiness";

/**
 * The party's single state.
 *
 * The bug this replaces: two things were both called `allReady` — every member
 * pressed Ready Up, and every member has the files — and the panels rendered
 * one directly above the other. A member list reading "Not ready" sat under a
 * green "Everyone is ready to play". The first test below is that exact screen.
 */

const inSync = (userIds: string[]) => ({
  allInSync: true,
  members: userIds.map((userId) => ({
    userId,
    hasGame: true,
    hasEdition: true,
    missingMods: [] as string[],
  })),
});

describe("the contradiction that started this", () => {
  it("does not claim everyone is ready when nobody has readied up", () => {
    const r = computePartyReadiness({
      gameSlug: "holocure",
      status: "forming",
      members: [
        { userId: "a", ready: false },
        { userId: "b", ready: false },
      ],
      sync: inSync(["a", "b"]),
    });

    expect(r.phase).toBe("waiting_ready");
    expect(r.allInSync).toBe(true);
    expect(r.allReadyUp).toBe(false);
    // Files are fine, so the headline must not say anyone is missing anything…
    expect(r.headline).toBe("Everyone has the right version");
    // …and it must not claim readiness either.
    expect(r.headline).not.toMatch(/ready/i);
  });

  it("says everyone is ready only when both things are true", () => {
    const r = computePartyReadiness({
      gameSlug: "holocure",
      status: "forming",
      members: [
        { userId: "a", ready: true },
        { userId: "b", ready: true },
      ],
      sync: inSync(["a", "b"]),
    });
    expect(r.phase).toBe("ready");
    expect(r.allReadyUp).toBe(true);
  });
});

describe("someone is missing files", () => {
  const partial = {
    allInSync: false,
    members: [
      { userId: "a", hasGame: true, hasEdition: true, missingMods: [] as string[] },
      { userId: "b", hasGame: false, hasEdition: false, missingMods: [] as string[] },
    ],
  };

  it("reports installing regardless of ready flags", () => {
    // Readiness must not paper over a member who cannot launch.
    const r = computePartyReadiness({
      gameSlug: "holocure",
      status: "forming",
      members: [
        { userId: "a", ready: true },
        { userId: "b", ready: true },
      ],
      sync: partial,
    });
    expect(r.phase).toBe("installing");
    expect(r.blockedUserIds).toEqual(["b"]);
  });

  it("counts a missing edition and missing mods as blocked too", () => {
    const r = computePartyReadiness({
      gameSlug: "holocure",
      status: "forming",
      members: [{ userId: "a" }, { userId: "b" }],
      sync: {
        allInSync: false,
        members: [
          { userId: "a", hasGame: true, hasEdition: false, missingMods: [] },
          { userId: "b", hasGame: true, hasEdition: true, missingMods: ["x"] },
        ],
      },
    });
    expect(r.blockedUserIds.sort()).toEqual(["a", "b"]);
  });

  it("uses singular wording for one blocked member", () => {
    const r = computePartyReadiness({
      gameSlug: "holocure",
      status: "forming",
      members: [{ userId: "a" }, { userId: "b" }],
      sync: partial,
    });
    expect(r.headline).toBe("One member needs to install");
  });
});

describe("nothing to decide yet", () => {
  it("asks for a game when none is picked", () => {
    const r = computePartyReadiness({
      gameSlug: null,
      status: "forming",
      members: [{ userId: "a" }],
      sync: null,
    });
    expect(r.phase).toBe("no_game");
  });

  it("does not flash a warning before the first sync arrives", () => {
    /*
     * The panel renders before config-sync lands. Defaulting to "blocked" would
     * show a red card to a party that is perfectly fine.
     */
    const r = computePartyReadiness({
      gameSlug: "holocure",
      status: "forming",
      members: [{ userId: "a", ready: false }],
      sync: null,
    });
    expect(r.phase).toBe("waiting_ready");
    expect(r.blockedUserIds).toEqual([]);
  });
});

describe("a session already running", () => {
  it("tells latecomers they need not wait for anyone", () => {
    // Issue #3: joining must never read as gated on the host.
    const r = computePartyReadiness({
      gameSlug: "holocure",
      status: "playing",
      members: [
        { userId: "a", ready: true },
        { userId: "b", ready: false },
      ],
      sync: inSync(["a", "b"]),
    });
    expect(r.phase).toBe("playing");
    expect(r.detail).toMatch(/do not have to wait/i);
  });
});

describe("counts", () => {
  it("reports how many have readied", () => {
    const r = computePartyReadiness({
      gameSlug: "holocure",
      status: "forming",
      members: [
        { userId: "a", ready: true },
        { userId: "b", ready: false },
        { userId: "c", ready: false },
      ],
      sync: inSync(["a", "b", "c"]),
    });
    expect(r.readyCount).toBe(1);
    expect(r.memberCount).toBe(3);
    expect(r.waitingUserIds.sort()).toEqual(["b", "c"]);
    expect(r.detail).toMatch(/2 players/);
  });

  it("does not call an empty party ready", () => {
    const r = computePartyReadiness({
      gameSlug: "holocure",
      status: "forming",
      members: [],
      sync: { allInSync: true, members: [] },
    });
    expect(r.allReadyUp).toBe(false);
  });
});
