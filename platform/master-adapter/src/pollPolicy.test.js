import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The adapter's entry point starts a server on import, so the policy is checked at
// the source level: what matters is that it exists and cannot be dropped silently.
const source = readFileSync(new URL("./index.js", import.meta.url), "utf8");

test("idle games are polled slowly and demand refreshes are de-duplicated", () => {
  assert.match(source, /IDLE_REFRESH_MS = Number\(process\.env\.IDLE_REFRESH_MS \?\? 15 \* 60_000\)/);
  assert.match(source, /Math\.max\(base, IDLE_REFRESH_MS\)/);
  assert.match(source, /lastRequestedAt\.set\(slug, Date\.now\(\)\)/);
  assert.match(source, /if \(refreshing\.has\(game\.slug\)\) return;/);
  assert.match(source, /polls: Object\.fromEntries\(pollCounts\)/);
});
