/**
 * Run: node roomRestart.test.js
 */

import assert from "node:assert/strict";
import test from "node:test";
import { shouldRestartRoom, MAX_RESTARTS, MIN_HEALTHY_MS } from "./roomRestart.js";

const MINUTES = 60_000;

test("brings back a server that finished a match", () => {
  // OpenRA exits when a game ends. That is the case this exists for: an
  // ordinary end-of-match should not read as the room dying.
  const { restart } = shouldRestartRoom({ uptimeMs: 20 * MINUTES, restarts: 0 });
  assert.equal(restart, true);
});

test("does not loop on a server that cannot start", () => {
  /*
   * A missing data file or bad argv exits immediately and will exit again.
   * Restarting that is a busy VPS and a party watching a room flap.
   */
  const quick = shouldRestartRoom({ uptimeMs: 2000, restarts: 0 });
  assert.equal(quick.restart, false);
  assert.match(quick.reason, /failure to start/);

  // The boundary itself counts as too short.
  assert.equal(shouldRestartRoom({ uptimeMs: MIN_HEALTHY_MS - 1 }).restart, false);
  assert.equal(shouldRestartRoom({ uptimeMs: MIN_HEALTHY_MS }).restart, true);
});

test("gives up after a bounded number of restarts", () => {
  // Long enough for an evening of matches, short enough that a server dying
  // every twenty minutes stops rather than doing it all night.
  assert.equal(shouldRestartRoom({ uptimeMs: 30 * MINUTES, restarts: MAX_RESTARTS - 1 }).restart, true);
  const spent = shouldRestartRoom({ uptimeMs: 30 * MINUTES, restarts: MAX_RESTARTS });
  assert.equal(spent.restart, false);
  assert.match(spent.reason, /already restarted/);
});

test("never fights a deliberate stop", () => {
  /*
   * Ending a party kills the room. If that came back the party would be
   * unkillable and the port would stay held — this check comes before every
   * other one for that reason.
   */
  const stopped = shouldRestartRoom({ deliberate: true, uptimeMs: 30 * MINUTES, restarts: 0 });
  assert.equal(stopped.restart, false);
  assert.match(stopped.reason, /on purpose/);
});

test("defaults to not restarting when it is told nothing", () => {
  // An unknown uptime is zero, which reads as a crash. Erring toward leaving a
  // room down is the safe direction: a party can start another.
  assert.equal(shouldRestartRoom().restart, false);
  assert.equal(shouldRestartRoom({}).restart, false);
});

test("always explains itself", () => {
  // The reason is logged next to the room, and it is the only breadcrumb when
  // someone asks why a server did or did not come back.
  for (const input of [
    { deliberate: true },
    { restarts: MAX_RESTARTS },
    { uptimeMs: 1 },
    { uptimeMs: 30 * MINUTES },
  ]) {
    assert.ok(shouldRestartRoom(input).reason.length > 10, JSON.stringify(input));
  }
});
