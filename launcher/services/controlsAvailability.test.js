"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { EXPECTED_CONTROLS_GAMES, REASONS, resolveControlsAvailability, logControlsSkip } = require("./controlsAvailability");

const PROFILES = path.join(__dirname, "inputEngine", "profiles");
const load = (name) => JSON.parse(fs.readFileSync(path.join(PROFILES, `${name}.json`), "utf8"));

// The live catalog row for OutRun is the repo pilot promoted exactly the way
// platform/scripts/apply-control-profile-wave.ts promotes it.
const outrunLive = () => ({ ...load("outrun"), version: "0.1.1", status: "verified", antiCheatCompatibility: "verified" });

const base = (over = {}) => ({
  platform: "win32",
  couchDisqualifies: false,
  hasControlsHost: true,
  fetchProfile: async () => null,
  bundledProfile: () => null,
  slug: "outrun",
  ...over,
});

test("OutRun gets the controls popup when the live catalog has its verified profile", async () => {
  const r = await resolveControlsAvailability(base({ fetchProfile: async () => outrunLive() }));
  assert.equal(r.reason, null);
  assert.equal(r.profile.gameSlug, "outrun");
});

test("OutRun with no live profile is skipped WITH a reason (the Sept 30 regression)", async () => {
  const r = await resolveControlsAvailability(base());
  assert.equal(r.profile, null);
  assert.equal(r.reason, REASONS.NO_PROFILE);
});

test("every skip branch reports its own reason", async () => {
  const cases = [
    [{ platform: "linux" }, REASONS.NOT_WINDOWS],
    [{ couchDisqualifies: true }, REASONS.COUCH_PARTY],
    [{ hasControlsHost: false }, REASONS.NO_HOST],
    [{ fetchProfile: async () => ({ ...outrunLive(), status: "draft" }) }, REASONS.NOT_VERIFIED],
    [{ fetchProfile: async () => ({ ...outrunLive(), antiCheatCompatibility: "unknown" }) }, REASONS.NOT_VERIFIED],
    [{ fetchProfile: async () => ({ ...outrunLive(), status: "testing" }) }, REASONS.NEEDS_PREVIEW],
    [{ fetchProfile: async () => ({ ...outrunLive(), inputStrategy: "native" }) }, REASONS.BAD_STRATEGY],
  ];
  for (const [over, reason] of cases) {
    const r = await resolveControlsAvailability(base(over));
    assert.equal(r.profile, null, reason);
    assert.equal(r.reason, reason);
  }
});

test("a testing profile is offered only when preview is allowed", async () => {
  const testing = { ...outrunLive(), status: "testing", antiCheatCompatibility: "unknown" };
  const withPreview = await resolveControlsAvailability(base({ fetchProfile: async () => testing, allowPreview: true }));
  assert.equal(withPreview.profile.status, "testing");
});

test("a bundled profile is used when the live catalog has none", async () => {
  const r = await resolveControlsAvailability(base({ slug: "holocure", bundledProfile: () => load("holocure") }));
  assert.notEqual(r.reason, REASONS.NO_PROFILE);
});

test("every expected-popup game has a repo profile source, so a missing live row is recoverable", () => {
  for (const slug of EXPECTED_CONTROLS_GAMES) {
    assert.ok(fs.existsSync(path.join(PROFILES, `${slug}.json`)), `${slug} needs launcher/services/inputEngine/profiles/${slug}.json`);
    assert.equal(load(slug).gameSlug, slug);
  }
});

test("skip logging is loud for expected games and quiet for ordinary ones", () => {
  const out = { warns: [], logs: [], warn: (m) => out.warns.push(m), log: (m) => out.logs.push(m) };
  logControlsSkip("outrun", REASONS.NO_PROFILE, out);
  logControlsSkip("some-random-game", REASONS.NO_PROFILE, out);
  logControlsSkip("some-random-game", REASONS.COUCH_PARTY, out);
  assert.equal(out.warns.length, 1);
  assert.match(out.warns[0], /outrun.*EXPECTED/);
  assert.equal(out.logs.length, 1);
});
