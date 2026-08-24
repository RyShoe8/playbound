const assert = require("node:assert/strict");
const { test } = require("node:test");
const { SELF_HOST_PORTS, selfHostIsAutomatic, selfHostLaunchArgs, selfHostPort } = require("./selfHost");

test("GoldenEye listen server binds to the overlay address", () => {
  assert.equal(selfHostPort("goldeneye-source"), 27045);
  assert.deepEqual(selfHostLaunchArgs("goldeneye-source", "100.80.12.4"), [
    "-console",
    "-ip",
    "100.80.12.4",
    "-port",
    "27045",
    "+maxplayers",
    "16",
    "+sv_lan",
    "0",
    "+map",
    "ge_facility",
  ]);
});

test("every PlayBound-hostable game has a local-host plan", () => {
  assert.equal(Object.keys(SELF_HOST_PORTS).length, 21);
  assert.deepEqual(selfHostLaunchArgs("openarena", "100.80.12.4"), []);
  assert.equal(selfHostIsAutomatic("openarena"), false);
  assert.equal(selfHostIsAutomatic("goldeneye-source"), true);
});

test("self-host recipes reject unknown games and unsafe addresses", () => {
  assert.equal(selfHostLaunchArgs("not-a-hosted-game", "100.80.12.4"), null);
  assert.equal(selfHostLaunchArgs("goldeneye-source", "example.com"), null);
  assert.equal(selfHostLaunchArgs("goldeneye-source", "100.80.12.4", 70000), null);
});
