/**
 * Tests for the home ranking model.
 *
 * The point of this module is that a ranking can be explained, so these check
 * the two properties that make that true: the gates are absolute, and the
 * reason a card shows is the signal that actually moved its score.
 *
 * Run: node renderer/homeRanking.test.mjs
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  WEIGHTS,
  affinity,
  controllerFit,
  latencyFit,
  occupancyFit,
  rankPlayableNow,
  recencyScore,
  scorePlayable,
} from "./homeRanking.js";

const game = (slug, extra = {}) => ({ slug, genres: ["RTS"], tags: ["Strategy"], ...extra });

test("occupancy peaks at the target, not at capacity", () => {
  // A server at 75% should beat both a near-empty and a rammed one.
  const target = occupancyFit(75, 100);
  assert.equal(target, 1);
  assert.ok(occupancyFit(10, 100) < target, "a near-empty server should score lower");
  assert.ok(occupancyFit(100, 100) < target, "a full server should score lower");
  // But full still beats empty — you can queue for a full server, not for a dead one.
  assert.ok(occupancyFit(100, 100) > occupancyFit(5, 100));
});

test("occupancy treats no players as no signal", () => {
  assert.equal(occupancyFit(0, 64), 0);
  assert.equal(occupancyFit(null, 64), 0);
});

test("latency is 1 under 50ms and 0 past 150ms", () => {
  assert.equal(latencyFit(20), 1);
  assert.equal(latencyFit(50), 1);
  assert.equal(latencyFit(150), 0);
  assert.equal(latencyFit(300), 0);
  const mid = latencyFit(100);
  assert.ok(mid > 0 && mid < 1, "100ms should land between the bounds");
  // Unknown latency must not be punished as though it were terrible.
  assert.equal(latencyFit(undefined), 0.5);
});

test("controller confidence ladder outranks the catalog's claim", () => {
  const native = controllerFit({ kind: "native" }, null);
  const verified = controllerFit({ kind: "config", verified: true }, null);
  const config = controllerFit({ kind: "config", verified: false }, null);
  const claimed = controllerFit({ kind: "unknown" }, ["Controller Support"]);
  const nothing = controllerFit({ kind: "unknown" }, ["Multiplayer"]);

  assert.ok(native.score > verified.score);
  assert.ok(verified.score > config.score);
  assert.ok(config.score > claimed.score);
  assert.equal(nothing.score, 0);
  assert.equal(nothing.label, null, "an unassessed game gets no badge at all");
  assert.equal(native.label, "Plug in and play");
});

test("a controller badge does not depend on a pad being plugged in", () => {
  const candidate = {
    game: game("ysoccer"),
    controllerSupport: { kind: "native" },
  };
  const unplugged = scorePlayable(candidate, { padConnected: false });
  const plugged = scorePlayable(candidate, { padConnected: true });

  assert.equal(unplugged.controller.label, "Plug in and play");
  assert.equal(plugged.controller.label, "Plug in and play");
  assert.ok(plugged.score > unplugged.score, "connecting a pad should raise the weight");
  assert.ok(unplugged.score > 0, "an unplugged pad is still a pad you own");
});

test("recency halves every fortnight", () => {
  const now = Date.parse("2026-09-01T00:00:00Z");
  const days = (n) => new Date(now - n * 86_400_000).toISOString();
  assert.ok(recencyScore(days(0), now) > 0.99);
  assert.ok(Math.abs(recencyScore(days(14), now) - 0.5) < 0.01);
  assert.ok(recencyScore(days(28), now) < 0.3);
  assert.equal(recencyScore(null, now), 0);
});

test("affinity measures overlap against play history", () => {
  const history = [game("openra", { genres: ["RTS"], tags: ["Strategy"] })];
  assert.equal(affinity(game("0ad"), history), 1);
  assert.equal(affinity(game("x", { genres: ["Racing"], tags: ["Arcade"] }), history), 0);
  assert.equal(affinity(game("y"), []), 0, "no history means no affinity, not a default");
});

test("gates multiply — no signal can surface an incompatible game", () => {
  const loaded = {
    game: game("heavy"),
    installed: true,
    friendsPresent: 3,
    server: { players: 40, maxPlayers: 50, ping: 20 },
    controllerSupport: { kind: "native" },
    lastPlayed: new Date().toISOString(),
  };
  assert.ok(scorePlayable({ ...loaded }).score > 0);
  assert.equal(scorePlayable({ ...loaded, compatible: false }).score, 0);
  assert.equal(scorePlayable({ ...loaded, tierVisible: false }).score, 0);
});

test("friends outrank a busy server", () => {
  const withFriends = scorePlayable({
    game: game("a"),
    friendsPresent: 3,
    server: { players: 2, maxPlayers: 50, ping: 90 },
  });
  const busyOnly = scorePlayable({
    game: game("b"),
    server: { players: 38, maxPlayers: 50, ping: 20 },
  });
  assert.ok(withFriends.score > busyOnly.score);
  assert.equal(withFriends.dominant, "friends");
  assert.equal(withFriends.reasons[0].text, "3 friends online");
});

test("the top reason is the signal that actually moved the score", () => {
  const r = scorePlayable({
    game: game("openttd"),
    installed: true,
    server: { players: 11, maxPlayers: 50, ping: 34 },
    controllerSupport: { kind: "unknown" },
  });
  assert.equal(r.reasons[0].key, "servers");
  assert.equal(r.reasons[0].text, "11 playing · 34ms");
});

test("ranking drops gated games and orders best-first", () => {
  const ranked = rankPlayableNow([
    { game: game("quiet"), installed: false },
    { game: game("busy"), server: { players: 30, maxPlayers: 40, ping: 25 } },
    { game: game("blocked"), installed: true, friendsPresent: 3, compatible: false },
  ]);
  assert.deepEqual(ranked.map((r) => r.slug), ["busy"]);
});

test("ties break on slug so the order does not flicker between paints", () => {
  const a = { game: game("bravo"), installed: true };
  const b = { game: game("alpha"), installed: true };
  assert.deepEqual(
    rankPlayableNow([a, b]).map((r) => r.slug),
    ["alpha", "bravo"]
  );
});

test("weights are exported so ordering can be tuned without touching scoring", () => {
  assert.ok(WEIGHTS.friendsPresent > WEIGHTS.installed);
  assert.ok(WEIGHTS.controllerConnected > WEIGHTS.controllerIdle);
});
