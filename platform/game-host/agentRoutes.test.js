import assert from "node:assert/strict";
import { test } from "node:test";
import { isAgentGetPath } from "./agentRoutes.js";

test("per-room and managed GETs are agent routes, not mirror files", () => {
  for (const p of ["/rooms", "/rooms/", "/metrics", "/managed", "/rooms/abc/tes3mp/accounts", "/managed/cs-123456"]) {
    assert.equal(isAgentGetPath(p), true, p);
  }
  for (const p of ["/games/openra.zip", "/", "/roomsx", "/mirror/archive/x"]) {
    assert.equal(isAgentGetPath(p), false, p);
  }
});
