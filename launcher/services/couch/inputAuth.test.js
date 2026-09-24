const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { authenticateCouchClient, authenticatedInputSlot, bindInputToSlot } = require("./inputAuth");

const approved = [
  {
    controllerId: "c1",
    sessionToken: "sess",
    playerSlot: 2,
    status: "approved",
  },
];

describe("authenticateCouchClient", () => {
  it("rejects hello without credentials", () => {
    const r = authenticateCouchClient(
      { type: "hello", controllerId: "c1", playerSlot: 0 },
      { expectedWsToken: "tok", requireWsToken: true, controllers: approved }
    );
    assert.equal(r.ok, false);
  });

  it("rejects a wrong LAN token", () => {
    const r = authenticateCouchClient(
      { type: "auth", controllerId: "c1", sessionToken: "sess", wsToken: "nope" },
      { expectedWsToken: "tok", requireWsToken: true, controllers: approved }
    );
    assert.equal(r.reason, "bad-ws-token");
  });

  it("rejects pending or kicked controllers", () => {
    const r = authenticateCouchClient(
      { type: "hello", controllerId: "c1", sessionToken: "sess", wsToken: "tok" },
      {
        expectedWsToken: "tok",
        requireWsToken: true,
        controllers: [{ ...approved[0], status: "pending" }],
      }
    );
    assert.equal(r.reason, "not-approved");
  });

  it("binds the approved slot, not the claimed one", () => {
    const r = authenticateCouchClient(
      {
        type: "auth",
        controllerId: "c1",
        sessionToken: "sess",
        wsToken: "tok",
        playerSlot: 0,
      },
      { expectedWsToken: "tok", requireWsToken: true, controllers: approved }
    );
    assert.equal(r.ok, true);
    assert.equal(r.playerSlot, 2);
  });

  it("rejects a row without a host-side session token", () => {
    const r = authenticateCouchClient(
      {
        type: "hello",
        controllerId: "c1",
        sessionToken: "sess",
        playerSlot: 0,
      },
      {
        expectedWsToken: "tok",
        requireWsToken: false,
        controllers: [{ controllerId: "c1", playerSlot: 0, status: "approved" }],
      }
    );
    assert.equal(r.ok, false);
  });

  it("rejects when the controller row has a differing sessionToken", () => {
    const r = authenticateCouchClient(
      {
        type: "hello",
        controllerId: "c1",
        sessionToken: "sess",
        playerSlot: 0,
      },
      {
        expectedWsToken: "tok",
        requireWsToken: false,
        controllers: [{ controllerId: "c1", playerSlot: 0, status: "approved", sessionToken: "other" }],
      }
    );
    assert.equal(r.ok, false);
    assert.equal(r.reason, "not-approved");
  });

  it("authenticates a stream-only viewer without granting a gamepad slot", () => {
    const r = authenticateCouchClient(
      { type: "hello", controllerId: "viewer", sessionToken: "view-token" },
      { expectedWsToken: "", requireWsToken: false, controllers: [
        { controllerId: "viewer", sessionToken: "view-token", status: "approved", spectator: true, playerSlot: null },
      ] }
    );
    assert.equal(r.ok, true);
    assert.equal(r.playerSlot, null);
  });
});

describe("authenticatedInputSlot", () => {
  it("keeps four identities on four separate slots and rejects impersonation", () => {
    const rows = Array.from({ length: 4 }, (_, slot) => ({
      controllerId: `pad-${slot}`, sessionToken: `token-${slot}`,
      playerSlot: slot, status: "approved",
    }));
    for (let slot = 0; slot < 4; slot++) {
      assert.equal(authenticatedInputSlot(`pad-${slot}`, `token-${slot}`, rows), slot);
      assert.equal(authenticatedInputSlot(`pad-${slot}`, `token-${(slot + 1) % 4}`, rows), null);
    }
    assert.equal(authenticatedInputSlot("viewer", "view-token", [
      { controllerId: "viewer", sessionToken: "view-token", spectator: true, playerSlot: null, status: "approved" },
    ]), null);
  });
});

describe("bindInputToSlot", () => {
  it("overwrites the packet slot with the bound slot", () => {
    const bound = bindInputToSlot({ v: 1, p: 0, seq: 1 }, 2);
    assert.equal(bound.p, 2);
  });
});
