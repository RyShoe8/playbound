import assert from "node:assert/strict";
import { test } from "node:test";
import { acceptsGame, findMatches, nextPlayTime, timeSlots, toMatchGame } from "./playMatch.js";

const NOW = Date.parse("2026-11-06T18:07:00Z");
const free = (extra = {}) => ({ timezone: "UTC", window: null, weekly: [], ...extra });
const windowAt = (start, hours = 2) => ({ startsAt: new Date(start).toISOString(), endsAt: new Date(start + hours * 3600000).toISOString() });
const game = (slug, extra = {}) => ({ slug, title: slug, genres: [], free: false, ...extra });
const friend = (username, availability, extra = {}) => ({ id: username, username, availability, sharedGames: [], ...extra });

test("preferences accept any game, chosen games, or chosen genres", () => {
  const racing = game("racer", { genres: ["Racing"] });
  assert.equal(acceptsGame({ mode: "any" }, racing), true);
  assert.equal(acceptsGame({ mode: "games", games: ["racer"] }, racing), true);
  assert.equal(acceptsGame({ mode: "games", games: ["other"] }, racing), false);
  assert.equal(acceptsGame({ mode: "genres", genres: ["Racing"] }, racing), true);
  assert.equal(acceptsGame({ mode: "genres", genres: ["Puzzle"] }, racing), false);
});

test("next play time is now when free, or the start of a coming window", () => {
  assert.equal(nextPlayTime(free({ window: windowAt(NOW - 60000) }), NOW, NOW + 3600000), NOW);
  assert.equal(nextPlayTime(free({ window: windowAt(NOW + 600000) }), NOW, NOW + 3600000), NOW + 600000);
  assert.equal(nextPlayTime(free({ window: windowAt(NOW + 2 * 3600000) }), NOW, NOW + 3600000), undefined);
});

test("offers the next six hours on the quarter hour", () => {
  const slots = timeSlots(NOW);
  assert.equal(slots.length, 24);
  assert.equal(new Date(slots[0]).toISOString(), "2026-11-06T18:15:00.000Z");
});

test("prefers a game you both own, and puts the soonest friend first", () => {
  const games = [game("a"), game("b")];
  const later = friend("Later", free({ window: windowAt(NOW + 600000) }), { sharedGames: [{ slug: "a" }] });
  const soon = friend("Soon", free({ window: windowAt(NOW - 60000) }), { sharedGames: [{ slug: "b" }] });
  const matches = findMatches({ matchCandidates: [later, soon] }, games, 0, NOW);
  assert.deepEqual(matches.map((match) => [match.friend.username, match.game.slug, match.installed]), [["Soon", "b", true], ["Later", "a", true]]);
});

test("suggests a free download only when both of you are open to it", () => {
  const games = [game("free", { free: true })];
  const available = free({ window: windowAt(NOW - 60000) });
  const open = { mode: "any", genres: [], games: [], downloads: true };
  assert.equal(findMatches({ matchCandidates: [friend("A", available, { preferences: open })], preferences: open }, games, 0, NOW)[0].installed, false);
  assert.deepEqual(findMatches({ matchCandidates: [friend("A", available)], preferences: open }, games, 0, NOW), []);
  assert.deepEqual(findMatches({ matchCandidates: [friend("A", available, { preferences: open })] }, games, 0, NOW), []);
});

test("leaves out friends who are not free soon", () => {
  assert.deepEqual(findMatches({ matchCandidates: [friend("A", free(), { sharedGames: [{ slug: "a" }] })] }, [game("a")], 0, NOW), []);
});

test("never calls a paid game a free download", () => {
  assert.equal(toMatchGame({ slug: "x", title: "X", launchMethods: ["install"] }).free, true);
  assert.equal(toMatchGame({ slug: "x", title: "X", launchMethods: ["steam"] }).free, false);
  assert.equal(toMatchGame({ slug: "x", title: "X", launchMethods: ["install"], fromPriceCents: 999 }).free, false);
  assert.equal(toMatchGame({ slug: "x", title: "X", launchMethods: ["install"], access: { priceType: "PAID" } }).free, false);
  assert.equal(toMatchGame({ slug: "x", title: "X", launchMethods: ["install"], access: { priceType: "FREE", requiresOwnedBaseGame: true } }).free, false);
  assert.equal(toMatchGame({ slug: "x", title: "X", launchMethods: ["install"], access: { priceType: "FREE" } }).free, true);
});

 test("does not use private friends as public matches", () => {
  const person = friend("Private", free({window: windowAt(NOW)}), { sharedGames: [{slug: "a"}] });
  assert.deepEqual(findMatches({friends: [person], matchCandidates: []}, [game("a")], 0, NOW), []);
 });
