import assert from "node:assert/strict";
import test from "node:test";
import { readyInstalledGameSlugs } from "./multiplayerInstalled.js";

test("LFG installed games include completed base and edition installs", () => {
  const slugs = readyInstalledGameSlugs([
    { slug: "openra", exe: "C:/Games/OpenRA/OpenRA.exe", pending: false },
    { slug: "swgb", exe: null, pending: false, installedEditions: [{ slug: "expanding-fronts" }] },
  ]);

  assert.deepEqual([...slugs], ["openra", "swgb"]);
});

test("LFG installed games exclude incomplete and malformed records", () => {
  const slugs = readyInstalledGameSlugs([
    { slug: "downloading", exe: null, pending: true },
    { slug: "missing", exe: null, pending: false, installedEditions: [] },
    null,
  ]);

  assert.equal(slugs.size, 0);
});
