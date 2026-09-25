import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptedSettingsFor, recipes } from "./recipes.js";
import { readFileSync } from "node:fs";

const managed = (slug, limit = 12) => ({
  managed: true, partyId: "community-12345678", name: "Community",
  settings: acceptedSettingsFor(slug, { maxPlayers: limit }),
});

test("managed CS2 uses the configured startup slot limit", () => {
  const settings = acceptedSettingsFor("counter-strike-2", { maxPlayers: 12, unrelated: 99 });
  assert.deepEqual(settings, { maxPlayers: 12 });
  const args = recipes["counter-strike-2"].args(27030, { managed: true, settings, name: "Community" });
  const index = args.indexOf("-maxplayers");
  assert.equal(args[index + 1], "12");
  const partyArgs = recipes["counter-strike-2"].args(27030, { managed: false, settings, name: "Party" });
  assert.equal(partyArgs[partyArgs.indexOf("-maxplayers") + 1], "16");
});

test("the scheduler and agent agree on every managed player-limit recipe", () => {
  const source = readFileSync(new URL("../src/lib/communityHosting/reconcile.ts", import.meta.url), "utf8");
  const declared = source.match(/const PLAYER_LIMIT_RECIPES = new Set\(\[([\s\S]*?)\]\)/)?.[1];
  assert.ok(declared, "scheduler list must be inspectable");
  const slugs = [...declared.matchAll(/"([\w-]+)"/g)].map((m) => m[1]);
  for (const slug of slugs) {
    assert.ok(recipes[slug], `${slug} has a recipe`);
    assert.deepEqual(acceptedSettingsFor(slug, { maxPlayers: 12 }), { maxPlayers: 12 }, `${slug} accepts the limit`);
  }
});

test("managed server recipes translate the cap into native command-line controls", () => {
  const cases = [
    ["assaultcube", "-c12"],
    ["medal-of-honor-allied-assault", "sv_maxclients", "12"],
    ["bzflag", "-mp", "12"],
    ["supertuxkart", "--max-players=8"],
    ["xonotic", "+maxplayers", "12"],
    ["openarena", "sv_maxclients", "12"],
    ["0-ad", "-autostart-host-players=8"],
    ["bombsquad", "8"],
    ["wolfenstein-enemy-territory", "sv_maxclients", "12"],
    ["team-fortress-2", "+maxplayers", "12"],
    ["unvanquished", "sv_maxclients", "12"],
    ["hurry-curry", "--max-players", "12"],
  ];
  for (const [slug, flag, value] of cases) {
    const args = recipes[slug].args(27030, managed(slug));
    const index = args.indexOf(flag);
    assert.notEqual(index, -1, `${slug} includes ${flag}`);
    if (value !== undefined) assert.equal(args[index + 1], value, `${slug} uses the admin cap`);
  }
  assert.match(recipes.mindustry.stdin(6567, managed("mindustry")), /playerlimit 12\nhost/);
  assert.doesNotMatch(recipes.mindustry.stdin(6567, { managed: false, name: "Party" }), /playerlimit/);
  const openTtdArgs = recipes.openttd.args(3979, managed("openttd"));
  assert.ok(openTtdArgs.includes("-c"));
  assert.ok(!recipes.openttd.args(3979, { managed: false }).includes("-c"));
});
