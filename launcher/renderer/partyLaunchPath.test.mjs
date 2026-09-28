import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const friends = readFileSync(new URL("./views/friends.js", import.meta.url), "utf8");
const main = readFileSync(new URL("../main.js", import.meta.url), "utf8");

test("an installed party game reaches PlayBound play instead of its store link", () => {
  const partyLaunch = friends.split("async function launchPartyGame(party) {")[1]?.split("\nfunction ")[0];
  assert.ok(partyLaunch);
  assert.match(partyLaunch, /isGameReadyToPlay\(slug\)/);
  assert.match(partyLaunch, /window\.playbound\.play\(/);
  assert.doesNotMatch(partyLaunch, /window\.playbound\.openExternal\(/);
});

test("GOG netplay launch prefers the owned ROM and avoids duplicate connect flags", () => {
  const netplayLaunch = main.split("const netplayConfig = require(\"./services/retroArchNetplay\").getNetplayConfig(slug);")[1];
  assert.ok(netplayLaunch);
  assert.match(netplayLaunch, /persistEditionExe\(slug, edSlug, launchPath, rom\)/);
  assert.match(netplayLaunch, /const hasClientFlag = args\.includes\("-C"\)/);
});

test("a guest arms a direct-IP party join until the host listener is ready", () => {
  assert.match(friends, /lan\.requiresHostReady && !party\.selfHostReady/);
  assert.match(friends, /party\.lan\?\.requiresHostReady && !partyConnectReady\(party, false\)/);
  assert.match(friends, /pendingJoin = \{ partyId, at: Date\.now\(\) \}/);
  assert.match(friends, /party\.port \|\| lan\.hostPort \|\| catalogGame\?\.port \|\| connectMeta\.defaultPort/);
});
