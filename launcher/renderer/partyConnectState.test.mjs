import assert from "node:assert/strict";
import test from "node:test";
import { partyConnectFailed, partyConnectReady } from "./partyConnectState.js";

test("a self-hosted party can join when its overlay is ready even if the VPS room is not", () => {
  const party = {
    hostMode: "self",
    hosted: { enabled: true, status: "failed" },
    lan: { enabled: true, status: "ready" },
  };
  assert.equal(partyConnectReady(party, false), true);
  assert.equal(partyConnectFailed(party), false);
  assert.equal(partyConnectReady({ ...party, hostMode: "dedicated" }, false), false);
  assert.equal(partyConnectFailed({ ...party, hostMode: "dedicated" }), true);
});

test("self-hosted guests still wait for the party network", () => {
  const party = { hostMode: "self", hosted: { enabled: true, status: "none" }, lan: { enabled: true, status: "pending" } };
  assert.equal(partyConnectReady(party, false), false);
  assert.equal(partyConnectReady({ ...party, lan: { enabled: true, status: "failed" } }, false), false);
  assert.equal(partyConnectFailed({ ...party, lan: { enabled: true, status: "failed" } }), true);
});
