const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { authenticateCouchClient, bindInputToSlot } = require("./inputAuth");

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
});

describe("bindInputToSlot", () => {
  it("overwrites the packet slot with the bound slot", () => {
    const bound = bindInputToSlot({ v: 1, p: 0, seq: 1 }, 2);
    assert.equal(bound.p, 2);
  });
});
