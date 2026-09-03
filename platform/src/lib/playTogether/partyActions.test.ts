import { describe, it, expect } from "vitest";
import { computePartyActions, PARTY_COPY, type PartyActionsInput } from "./partyActions";

/*
 * These encode the launcher's party card, which is the surface that was ahead.
 * Each case is a rule that existed only there — the web panel had none of them
 * — so if the resolver stops matching, this is what says so.
 */

const base = (over: Partial<PartyActionsInput> = {}): PartyActionsInput => ({
  viewerId: "u1",
  leaderId: "u1",
  status: "forming",
  gameSlug: "openra",
  members: [{ userId: "u1", ready: false }],
  ...over,
});

describe("ready button", () => {
  it("is inert with no game, and says why", () => {
    const a = computePartyActions(base({ gameSlug: null }));
    expect(a.ready.enabled).toBe(false);
    expect(a.ready.title).toBe(PARTY_COPY.pickGameFirst);
  });

  it("flips to cancel once readied, and changes tone with it", () => {
    const off = computePartyActions(base());
    const on = computePartyActions(base({ members: [{ userId: "u1", ready: true }] }));
    expect(off.ready.label).toBe(PARTY_COPY.readyUp);
    expect(off.ready.tone).toBe("success");
    expect(on.ready.label).toBe(PARTY_COPY.cancelReady);
    expect(on.ready.tone).toBe("secondary");
  });

  it("disappears once the party is in a game", () => {
    expect(computePartyActions(base({ status: "playing" })).ready.visible).toBe(false);
  });
});

describe("join button", () => {
  it("reads Start Game for the leader and Join Game for a ready member", () => {
    const leader = computePartyActions(base({ members: [{ userId: "u1", ready: true }] }));
    expect(leader.join.label).toBe(PARTY_COPY.startGame);

    const member = computePartyActions(
      base({
        viewerId: "u2",
        leaderId: "u1",
        status: "playing",
        members: [
          { userId: "u1", ready: true },
          { userId: "u2", ready: true },
        ],
      })
    );
    expect(member.join.label).toBe(PARTY_COPY.joinGame);
  });

  it("holds a member on Waiting for host until the host has started", () => {
    const a = computePartyActions(
      base({ viewerId: "u2", members: [{ userId: "u2", ready: true }] })
    );
    expect(a.join.label).toBe(PARTY_COPY.waitingForHost);
    expect(a.join.enabled).toBe(false);
    expect(a.join.title).toBe(PARTY_COPY.hostMustStart);
    expect(a.join.icon).toBe("loader");
  });

  /*
   * A virtual-LAN party has no listen server to probe, so selfHostReady is a
   * flag nothing ever sets. HoloCure sat on "Waiting for host" forever.
   */
  it("does not wait on selfHostReady when the party is on a virtual LAN", () => {
    const a = computePartyActions(
      base({
        viewerId: "u2",
        status: "playing",
        hostMode: "self",
        selfHostReady: false,
        lan: { enabled: true, status: "ready" },
        members: [{ userId: "u2", ready: true }],
      })
    );
    expect(a.join.label).toBe(PARTY_COPY.joinGame);
    expect(a.join.enabled).toBe(true);
  });

  it("says Server Starting… while a hosted room is still coming up", () => {
    const a = computePartyActions(
      base({
        viewerId: "u2",
        status: "playing",
        hosted: { enabled: true, status: "pending" },
        members: [{ userId: "u2", ready: true }],
      })
    );
    expect(a.join.label).toBe(PARTY_COPY.serverStarting);
    expect(a.join.title).toBe(PARTY_COPY.serverStillStarting);
  });

  /*
   * Whether a join is armed is client-side state the server cannot see, so the
   * resolver emits both readings and the client picks. That is what stops the
   * launcher writing its own labels for the armed case.
   */
  it("offers an armed reading that stays clickable, so the wait can be called off", () => {
    const a = computePartyActions(
      base({
        viewerId: "u2",
        hosted: { enabled: true, status: "pending" },
        members: [{ userId: "u2", ready: true }],
      })
    );
    expect(a.join.enabled).toBe(false);
    expect(a.joinArmed.enabled).toBe(true);
    expect(a.joinArmed.label).toBe(PARTY_COPY.joinArmed);
    expect(a.joinArmed.title).toBe(PARTY_COPY.joinArmedTitle);
    expect(a.joinArmed.icon).toBe("loader");
    // Both readings appear and disappear together.
    expect(a.joinArmed.visible).toBe(a.join.visible);
  });

  it("surfaces the connect error rather than a generic one", () => {
    const a = computePartyActions(
      base({
        viewerId: "u2",
        status: "playing",
        hosted: { enabled: true, status: "failed", error: "VPS out of slots" },
        members: [{ userId: "u2", ready: true }],
      })
    );
    expect(a.join.title).toBe("VPS out of slots");
    expect(a.join.enabled).toBe(false);
  });

  it("is hidden until the viewer readies up", () => {
    expect(computePartyActions(base()).join.visible).toBe(false);
    expect(
      computePartyActions(base({ members: [{ userId: "u1", ready: true }] })).join.visible
    ).toBe(true);
  });
});

describe("couch parties", () => {
  const couchInput = (over: Partial<PartyActionsInput> = {}) =>
    base({
      gameSlug: "streets-of-rage-remake",
      couch: { enabled: true, status: "none" },
      members: [
        { userId: "u1", ready: true },
        { userId: "u2", ready: true },
      ],
      ...over,
    });

  it("gives the leader a join button and members none", () => {
    expect(computePartyActions(couchInput()).join.visible).toBe(true);
    expect(
      computePartyActions(couchInput({ viewerId: "u2", leaderUsername: "Ry" })).join.visible
    ).toBe(false);
  });

  it("names whose machine runs it, from the viewer's side", () => {
    expect(computePartyActions(couchInput()).couch?.where).toMatch(/your PC/);
    expect(
      computePartyActions(couchInput({ viewerId: "u2", leaderUsername: "Ry" })).couch?.where
    ).toMatch(/Ry's PC/);
  });

  it("tells each role what happens next", () => {
    expect(computePartyActions(couchInput()).couch?.note).toBe(PARTY_COPY.couchLeaderNext);
    expect(computePartyActions(couchInput({ viewerId: "u2" })).couch?.note).toBe(
      PARTY_COPY.couchMemberNext
    );
  });

  it("derives the controller link when only a code was published", () => {
    const a = computePartyActions(
      couchInput({ couch: { enabled: true, status: "ready", joinCode: "AB3D" } })
    );
    expect(a.couch?.joinUrl).toBe("https://playbound.club/controller/AB3D");
  });

  it("never waits on a server a couch party does not have", () => {
    const a = computePartyActions(couchInput({ viewerId: "u2", hostMode: "self" }));
    expect(a.join.visible).toBe(false);
    expect(a.notes).toEqual([]);
  });

  it("is null for an online game", () => {
    expect(computePartyActions(base()).couch).toBeNull();
  });
});

describe("notes", () => {
  it("asks a public party to pick a server before anything else", () => {
    const a = computePartyActions(
      base({ hostMode: "public", hosted: { enabled: true, status: "none" } })
    );
    expect(a.notes).toEqual([{ tone: "info", text: PARTY_COPY.hostedPickServer }]);
  });

  it("reports a LAN failure as an error, with the reason when there is one", () => {
    const a = computePartyActions(
      base({ lan: { enabled: true, status: "failed", error: "reflector down" } })
    );
    expect(a.notes).toContainEqual({ tone: "error", text: "reflector down" });
  });

  it("falls back to the standard wording when no reason came back", () => {
    const a = computePartyActions(base({ lan: { enabled: true, status: "failed" } }));
    expect(a.notes).toContainEqual({ tone: "error", text: PARTY_COPY.lanFailed });
  });
});

describe("the two panels cannot disagree", () => {
  it("hands both clients the same member-row words", () => {
    const a = computePartyActions(base());
    expect(a.memberReadyLabel).toBe("Ready");
    expect(a.memberNotReadyLabel).toBe("Not ready");
  });

  it("shows the playing pill only when there is no join button to show", () => {
    const playing = computePartyActions(
      base({ viewerId: "u2", status: "playing", members: [{ userId: "u2", ready: false }] })
    );
    expect(playing.join.visible).toBe(true);
    expect(playing.playingPill).toBe(false);

    const couchMember = computePartyActions(
      base({
        viewerId: "u2",
        status: "playing",
        couch: { enabled: true, status: "ready", joinCode: "AB3D" },
        members: [{ userId: "u2", ready: true }],
      })
    );
    expect(couchMember.join.visible).toBe(false);
    expect(couchMember.playingPill).toBe(true);
  });
});
