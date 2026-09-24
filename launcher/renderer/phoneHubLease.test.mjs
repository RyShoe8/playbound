import assert from "node:assert/strict";
import { test } from "node:test";
import { PHONE_HUB_REUSE_MS, phoneHubDecision, phoneHubPairedAt } from "./phoneHubLease.js";

const pairedAt = 1_800_000_000_000;
const session = {
  solo: true,
  sessionId: "hub-1",
  snapshot: { controllers: [{ status: "approved", createdAt: pairedAt }] },
};
const lease = { sessionId: "hub-1", gameSlug: "outrun", pairedAt };

test("a paired phone can switch games during the two-hour reuse window", () => {
  assert.equal(phoneHubDecision(session, lease, "openra", pairedAt + PHONE_HUB_REUSE_MS - 1), "reuse");
});

test("two hours never ends the current game's phone connection", () => {
  assert.equal(phoneHubDecision(session, lease, "outrun", pairedAt + 8 * PHONE_HUB_REUSE_MS), "reuse");
});

test("switching games after two hours requires a new pairing", () => {
  assert.equal(phoneHubDecision(session, lease, "openra", pairedAt + PHONE_HUB_REUSE_MS), "rotate");
});

test("an unpaired phone is prompted and multiplayer sessions are left alone", () => {
  assert.equal(phoneHubDecision({ ...session, snapshot: { controllers: [] } }, lease, "outrun"), "pair");
  assert.equal(phoneHubDecision({ ...session, solo: false }, lease, "openra"), "other-session");
  assert.equal(phoneHubDecision(session, { ...lease, sessionId: "old-hub" }, "openra", pairedAt + 3 * PHONE_HUB_REUSE_MS), "reuse");
  assert.equal(phoneHubPairedAt(session), pairedAt);
});
